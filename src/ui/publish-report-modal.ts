import { type App, Modal } from 'obsidian';

import type { PublishOutcome } from '../publish/publish-types';

export type PublishReportAction =
  | 'CLOSE'
  | 'RETRY'
  | 'RECONCILE'
  | 'REPAIR_LOCAL'
  | 'UNLINK_LOCAL'
  | 'OPEN_SETTINGS';

export type PublishReportHandlers = Partial<Record<Exclude<PublishReportAction, 'CLOSE'>, () => void>>;

interface PublishReportPresentation {
  title: string;
  message: string;
}

function firstIpv4(value: string): string | null {
  for (const match of value.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/gu)) {
    if (match[0].split('.').every(part => Number(part) <= 255)) return match[0];
  }
  return null;
}

function tokenFailureMessage(outcome: Readonly<PublishOutcome>): string {
  const error = outcome.error;
  if (error?.code === 'WECHAT_ACCOUNT_NOT_CONFIGURED') {
    return '公众号账号尚未配置完整，请在插件设置中保存 AppID 和 AppSecret。';
  }
  if (error?.errcode === 40013) {
    return '当前公众号 AppID 无效，请在插件设置中重新核对。';
  }
  if (error?.errcode === 40001 || error?.errcode === 40125) {
    return '当前 AppSecret 无效或与 AppID 不匹配，请重新保存。';
  }
  if (error?.errcode === 40164) {
    const address = firstIpv4(error.errmsg);
    return address === null
      ? '当前网络出口 IP 不在公众号白名单中，请更新白名单后重试。'
      : `当前请求出口 IP（${address}）不在公众号白名单中，请更新后重试。`;
  }
  if (error?.retryable === true && error.remoteEffect === 'NONE') {
    return '连接微信接口时遇到临时网络问题，可以安全重试。';
  }
  return '请检查公众号账号、AppSecret、IP 白名单和接口权限后再试。';
}

function publishFailureMessage(outcome: Readonly<PublishOutcome>): string {
  if (outcome.error?.stage === 'UPLOAD_BODY_IMAGE') {
    return '正文图片上传失败，请检查图片格式和公众号素材接口权限。';
  }
  if (outcome.error?.stage === 'UPLOAD_COVER') {
    return '文章封面上传失败，请更换封面或检查公众号素材接口权限。';
  }
  if (outcome.error?.stage === 'DRAFT_CREATE') {
    return '文章未能保存到公众号草稿箱，请稍后重试。';
  }
  if (outcome.error?.stage === 'DRAFT_UPDATE') {
    return '公众号草稿未能更新，请稍后重试。';
  }
  return '本次没有确认完成同步，请按下方操作重试或到公众号后台核对。';
}

function presentationFor(outcome: Readonly<PublishOutcome>): Readonly<PublishReportPresentation> {
  if (outcome.state === 'LOCAL_COMMITTED' && outcome.action === 'SKIP') {
    return Object.freeze({
      title: '内容未变化',
      message: '公众号草稿与当前文章一致，无需重复同步。',
    });
  }
  if (outcome.state === 'LOCAL_COMMITTED') {
    return Object.freeze({
      title: '已同步到草稿箱',
      message: '文章已保存到公众号后台草稿箱，可以继续到公众号后台检查和编辑。',
    });
  }
  if (outcome.state === 'REMOTE_COMMITTED') {
    return Object.freeze({
      title: '草稿已同步',
      message: '公众号后台已收到文章，但本地关联尚未保存。请修复本地记录，避免重复创建草稿。',
    });
  }
  if (outcome.state === 'AMBIGUOUS') {
    return Object.freeze({
      title: '同步结果待确认',
      message: '公众号可能已经收到这次同步。请先核对公众号草稿箱，避免重复创建文章。',
    });
  }
  if (outcome.state === 'FAILED') {
    if (outcome.error?.code === 'REMOTE_DRAFT_MISSING') {
      return Object.freeze({
        title: '原草稿已不存在',
        message: '本地记录对应的公众号草稿已不存在。确认草稿箱后，可解除旧关联并重新创建。',
      });
    }
    if (outcome.error?.code === 'DRAFT_ACCOUNT_MISMATCH') {
      return Object.freeze({
        title: '公众号账号不一致',
        message: '这篇文章关联的是另一个公众号。请切换回原账号，或解除旧关联后在当前账号新建草稿。',
      });
    }
    return Object.freeze({
      title: '同步失败',
      message: outcome.error?.stage === 'TOKEN'
        ? tokenFailureMessage(outcome)
        : publishFailureMessage(outcome),
    });
  }
  return Object.freeze({ title: '正在同步', message: '请稍候，文章正在同步到公众号草稿箱。' });
}

export function actionsFor(outcome: Readonly<PublishOutcome>): readonly PublishReportAction[] {
  if (outcome.state === 'AMBIGUOUS') return Object.freeze(['RECONCILE', 'CLOSE']);
  if (outcome.state === 'REMOTE_COMMITTED') return Object.freeze(['REPAIR_LOCAL', 'CLOSE']);
  if (outcome.state === 'FAILED' && (outcome.error?.code === 'REMOTE_DRAFT_MISSING'
    || outcome.error?.code === 'DRAFT_ACCOUNT_MISMATCH')) {
    return Object.freeze(['UNLINK_LOCAL', 'CLOSE']);
  }
  if (outcome.state === 'FAILED' && outcome.error?.code === 'WECHAT_ACCOUNT_NOT_CONFIGURED') {
    return Object.freeze(['OPEN_SETTINGS', 'CLOSE']);
  }
  if (outcome.state === 'FAILED' && outcome.error?.retryable === true
    && outcome.error.remoteEffect === 'NONE') return Object.freeze(['RETRY', 'CLOSE']);
  return Object.freeze(['CLOSE']);
}

export class PublishReportModal extends Modal {
  constructor(
    app: App,
    private readonly outcome: Readonly<PublishOutcome>,
    private readonly handlers: Readonly<PublishReportHandlers> = {},
  ) { super(app); }

  onOpen(): void {
    this.contentEl.replaceChildren();
    const presentation = presentationFor(this.outcome);
    this.titleEl.textContent = presentation.title;
    this.contentEl.append(createEl('p', { text: presentation.message }));
    const actions = createDiv('modal-button-container');
    for (const action of actionsFor(this.outcome)) {
      const button = createEl('button', { text: this.label(action) });
      if (action !== 'CLOSE' && this.handlers[action] === undefined) button.disabled = true;
      button.addEventListener('click', () => {
        this.close();
        if (action !== 'CLOSE') this.handlers[action]?.();
      });
      actions.append(button);
    }
    this.contentEl.append(actions);
  }

  private label(action: PublishReportAction): string {
    if (action === 'RETRY') return '重试';
    if (action === 'RECONCILE') return '核对草稿箱';
    if (action === 'REPAIR_LOCAL') return '修复本地记录';
    if (action === 'UNLINK_LOCAL') return '解除旧关联';
    if (action === 'OPEN_SETTINGS') return '检查公众号设置';
    return '完成';
  }
}
