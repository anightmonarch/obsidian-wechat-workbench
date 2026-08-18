import { type App, Modal } from 'obsidian';

import type { PublishOutcome } from '../publish/publish-types';

export type PublishReportAction = 'CLOSE' | 'RETRY' | 'RECONCILE' | 'REPAIR_LOCAL';

export type PublishReportHandlers = Partial<Record<Exclude<PublishReportAction, 'CLOSE'>, () => void>>;

export function actionsFor(outcome: Readonly<PublishOutcome>): readonly PublishReportAction[] {
  if (outcome.state === 'AMBIGUOUS') return Object.freeze(['RECONCILE', 'CLOSE']);
  if (outcome.state === 'REMOTE_COMMITTED') return Object.freeze(['REPAIR_LOCAL', 'CLOSE']);
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
    this.titleEl.textContent = '草稿同步报告';
    const values: Array<[string, string]> = [
      ['状态', this.outcome.state],
      ['操作', this.outcome.action ?? '无'],
      ['远端结果', this.outcome.error?.remoteEffect ?? 'COMMITTED'],
      ['错误代码', this.outcome.error?.code ?? '无'],
      ['微信 errcode', String(this.outcome.error?.errcode ?? '无')],
      ['微信 errmsg', this.outcome.error?.errmsg ?? '无'],
      ['rid', this.outcome.error?.rid ?? '无'],
      ['下一步', this.outcome.error?.nextAction ?? '无需处理'],
    ];
    for (const [label, value] of values) {
      this.contentEl.append(createEl('p', { text: `${label}：${value}` }));
    }
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
    if (action === 'RETRY') return '重试安全阶段';
    if (action === 'RECONCILE') return '对账草稿箱';
    if (action === 'REPAIR_LOCAL') return '修复本地关联';
    return '关闭';
  }
}
