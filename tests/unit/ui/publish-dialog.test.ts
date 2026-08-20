import { describe, expect, it } from 'vitest';

import {
  buildPublishDialogModel,
  PublishConfirmationModal,
  type PublishDialogInput,
  UnlinkAssociationModal,
} from '../../../src/ui/publish-dialog';
import { actionsFor, PublishReportModal } from '../../../src/ui/publish-report-modal';
import type { PublishOutcome } from '../../../src/publish/publish-types';
import { PublicError } from '../../../src/wechat/errors';

const input: Readonly<PublishDialogInput> = Object.freeze({
  action: 'UPDATE',
  appId: 'wxSYNTHETIC123456',
  title: 'Synthetic article',
  digest: 'Synthetic digest',
  themeId: 'native',
  themeVersion: '1.0.0',
  contentHash: 'CONTENT_HASH',
  themeHash: 'THEME_HASH',
  coverHash: 'COVER_HASH',
  imageCount: 2,
  coverLabel: 'cover.png',
});

describe('publish confirmation and report models', () => {
  it('shows a focused editorial summary without implementation details', () => {
    const model = buildPublishDialogModel(input);

    expect(model).toMatchObject({
      action: 'UPDATE',
      title: 'Synthetic article',
      theme: 'native@1.0.0',
      imageCount: 2,
      coverLabel: 'cover.png',
      sendsArticle: true,
      formalPublish: false,
    });
    expect(model).not.toHaveProperty('accountSuffix');
    expect(model).not.toHaveProperty('hashes');
    expect(model).not.toHaveProperty('destinations');
    expect(JSON.stringify(model)).not.toMatch(/secret|access.?token/iu);

    const modal = new PublishConfirmationModal({} as never, model, () => undefined);
    modal.open();
    expect(modal.contentEl.textContent).toContain('Synthetic article');
    expect(modal.contentEl.textContent).toContain('native@1.0.0');
    expect(modal.contentEl.textContent).toContain('cover.png');
    expect(modal.contentEl.textContent).toContain('2 张');
    expect(modal.contentEl.textContent).not.toMatch(/CONTENT_HASH|THEME_HASH|COVER_HASH|api\.weixin\.com|123456/u);
    expect(modal.contentEl.textContent).toContain('不会正式群发');
  });

  it('never offers automatic retry for ambiguous create', () => {
    const outcome: Readonly<PublishOutcome> = Object.freeze({
      taskId: 'TASK_1', state: 'AMBIGUOUS', action: 'CREATE', mediaId: null,
      error: new PublicError({
        code: 'DRAFT_COMMIT_AMBIGUOUS', stage: 'DRAFT_CREATE', errcode: null,
        errmsg: 'timed out', rid: null, remoteEffect: 'UNKNOWN', retryable: false,
        nextAction: 'Reconcile.',
      }),
      hasUnsyncedChanges: false,
    });

    expect(actionsFor(outcome)).not.toContain('RETRY');
    expect(actionsFor(outcome)).toContain('RECONCILE');

    const report = new PublishReportModal({} as never, outcome, { RECONCILE: () => undefined });
    report.open();
    expect(report.titleEl.textContent).toBe('同步结果待确认');
    expect(report.contentEl.textContent).toContain('请先核对公众号草稿箱');
    expect(report.contentEl.textContent).toContain('核对草稿箱');
    expect(report.contentEl.textContent).not.toMatch(
      /timed out|AMBIGUOUS|DRAFT_COMMIT_AMBIGUOUS|UNKNOWN|errcode|errmsg|rid|access_token/u,
    );
  });

  it('explains that unlink only changes local metadata', () => {
    const modal = new UnlinkAssociationModal({} as never, 'article.md', () => undefined);
    modal.open();

    expect(modal.contentEl.textContent).toContain('只删除 article.md 中由插件维护的草稿关联字段');
    expect(modal.contentEl.textContent).toContain('不会删除公众号后台草稿');
  });

  it('offers contextual recovery for a missing remote draft without raw error details', () => {
    const outcome: Readonly<PublishOutcome> = Object.freeze({
      taskId: 'TASK_MISSING', state: 'FAILED', action: null, mediaId: 'OLD_MEDIA_ID',
      error: new PublicError({
        code: 'REMOTE_DRAFT_MISSING', stage: 'DRAFT_READ', errcode: 40007,
        errmsg: 'invalid media_id OLD_MEDIA_ID', rid: 'RAW_RID', remoteEffect: 'NONE',
        retryable: false, nextAction: 'unlink local association',
      }),
      hasUnsyncedChanges: false,
    });

    expect(actionsFor(outcome)).toEqual(['UNLINK_LOCAL', 'CLOSE']);
    const report = new PublishReportModal({} as never, outcome, {
      UNLINK_LOCAL: () => undefined,
    });
    report.open();
    expect(report.contentEl.textContent).toContain('公众号草稿已不存在');
    expect(report.contentEl.textContent).toContain('解除旧关联');
    expect(report.contentEl.textContent).not.toMatch(/OLD_MEDIA_ID|RAW_RID|40007|media_id/u);
  });

  it('routes account failures to settings and describes unchanged drafts accurately', () => {
    const accountFailure: Readonly<PublishOutcome> = Object.freeze({
      taskId: 'TASK_TOKEN', state: 'FAILED', action: 'CREATE', mediaId: null,
      error: new PublicError({
        code: 'WECHAT_ACCOUNT_NOT_CONFIGURED', stage: 'TOKEN', errcode: null,
        errmsg: 'raw secret message', rid: null, remoteEffect: 'NONE', retryable: false,
        nextAction: 'configure secret',
      }),
      hasUnsyncedChanges: false,
    });
    expect(actionsFor(accountFailure)).toEqual(['OPEN_SETTINGS', 'CLOSE']);
    const accountReport = new PublishReportModal({} as never, accountFailure, {
      OPEN_SETTINGS: () => undefined,
    });
    accountReport.open();
    expect(accountReport.contentEl.textContent).toContain('检查公众号设置');
    expect(accountReport.contentEl.textContent).not.toContain('raw secret message');

    const skipped: Readonly<PublishOutcome> = Object.freeze({
      taskId: 'TASK_SKIP', state: 'LOCAL_COMMITTED', action: 'SKIP', mediaId: 'MEDIA_ID',
      error: null, hasUnsyncedChanges: false,
    });
    const skipReport = new PublishReportModal({} as never, skipped);
    skipReport.open();
    expect(skipReport.titleEl.textContent).toBe('内容未变化');
    expect(skipReport.contentEl.textContent).toContain('无需重复同步');
  });

  it('offers a safe retry for a transient token request instead of treating it as configuration', () => {
    const transientTokenFailure: Readonly<PublishOutcome> = Object.freeze({
      taskId: 'TASK_TRANSIENT_TOKEN', state: 'FAILED', action: 'CREATE', mediaId: null,
      error: new PublicError({
        code: 'WECHAT_TRANSPORT_FAILED', stage: 'TOKEN', errcode: null,
        errmsg: 'temporary network failure', rid: null, remoteEffect: 'NONE', retryable: true,
        nextAction: 'retry',
      }),
      hasUnsyncedChanges: false,
    });

    expect(actionsFor(transientTokenFailure)).toEqual(['RETRY', 'CLOSE']);
  });

  it.each([
    [40013, '当前公众号 AppID 无效，请在插件设置中重新核对。'],
    [40125, '当前 AppSecret 无效或与 AppID 不匹配，请重新保存。'],
    [40164, '当前请求出口 IP（198.51.100.7）不在公众号白名单中，请更新后重试。'],
  ])('explains token configuration rejection %s without raw API details', (errcode, message) => {
    const rejected: Readonly<PublishOutcome> = Object.freeze({
      taskId: `TASK_TOKEN_${errcode}`, state: 'FAILED', action: 'CREATE', mediaId: null,
      error: new PublicError({
        code: 'WECHAT_API_ERROR', stage: 'TOKEN', errcode,
        errmsg: errcode === 40164
          ? 'invalid ip 198.51.100.7 ipv6 ::ffff:198.51.100.7, not in whitelist rid: RAW_RID'
          : `raw wechat rejection ${errcode}`,
        rid: 'RAW_RID', remoteEffect: 'NONE', retryable: false, nextAction: 'raw action',
      }),
      hasUnsyncedChanges: false,
    });

    const report = new PublishReportModal({} as never, rejected);
    report.open();

    expect(report.contentEl.textContent).toContain(message);
    expect(report.contentEl.textContent).not.toMatch(/raw wechat|RAW_RID|40013|40125|40164/u);
  });

  it.each([
    ['UPLOAD_BODY_IMAGE', '正文图片上传失败，请检查图片格式和公众号素材接口权限。'],
    ['UPLOAD_COVER', '文章封面上传失败，请更换封面或检查公众号素材接口权限。'],
    ['DRAFT_CREATE', '文章未能保存到公众号草稿箱，请稍后重试。'],
    ['DRAFT_UPDATE', '公众号草稿未能更新，请稍后重试。'],
  ] as const)('explains safe publish failure stage %s without raw API details', (stage, message) => {
    const rejected: Readonly<PublishOutcome> = Object.freeze({
      taskId: `TASK_${stage}`, state: 'FAILED', action: 'CREATE', mediaId: null,
      error: new PublicError({
        code: 'WECHAT_API_ERROR', stage, errcode: 45009,
        errmsg: 'raw wechat rejection with access_token=SECRET', rid: 'RAW_RID',
        remoteEffect: 'NONE', retryable: false, nextAction: 'raw action',
      }),
      hasUnsyncedChanges: false,
    });

    const report = new PublishReportModal({} as never, rejected);
    report.open();

    expect(report.contentEl.textContent).toContain(message);
    expect(report.contentEl.textContent).not.toMatch(/raw wechat|RAW_RID|45009|access_token|SECRET/u);
  });
});
