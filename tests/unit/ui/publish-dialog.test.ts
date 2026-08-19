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
    expect(report.contentEl.textContent).toContain('timed out');
    expect(report.contentEl.textContent).not.toContain('access_token');
  });

  it('explains that unlink only changes local metadata', () => {
    const modal = new UnlinkAssociationModal({} as never, 'article.md', () => undefined);
    modal.open();

    expect(modal.contentEl.textContent).toContain('只删除 article.md 中由插件维护的草稿关联字段');
    expect(modal.contentEl.textContent).toContain('不会删除公众号后台草稿');
  });
});
