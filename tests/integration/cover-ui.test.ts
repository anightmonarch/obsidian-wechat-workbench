import { describe, expect, it, vi } from 'vitest';

import {
  CoverPickerError,
  CoverPickerSession,
  type CoverPickerModel,
} from '../../src/ui/cover-picker-modal';

const model: Readonly<CoverPickerModel> = Object.freeze({
  localOptions: Object.freeze([
    Object.freeze({ kind: 'article', label: '文章封面', sourcePath: 'assets/article.png', enabled: true }),
    Object.freeze({ kind: 'first-image', label: '正文首图', sourcePath: 'assets/first.png', enabled: true }),
  ]),
  aiEnabled: true,
  aiDisabledReason: null,
});
const prepared = Object.freeze({
  source: 'first-local-image' as const,
  vaultPath: '.wechat-workbench/covers/article/cover-12345678.png',
  mimeType: 'image/png' as const,
  contentHash: 'COVER_HASH',
  previewDataUrl: 'data:image/png;base64,TEST',
});

describe('cover picker session', () => {
  it('keeps local options available when AI generation fails', async () => {
    const session = new CoverPickerSession(model, {
      prepareLocal: vi.fn(async () => prepared),
      generateAi: vi.fn(async () => { throw new Error('provider unavailable'); }),
      confirm: vi.fn(async () => undefined),
    });

    await session.generateAi();

    expect(session.options).toContainEqual(expect.objectContaining({ kind: 'first-image', enabled: true }));
    expect(session.errorCode).toBe('AI_COVER_GENERATION_FAILED');
    expect(session.selected).toBeNull();
  });

  it('does not confirm an unselected or failed generated cover', async () => {
    const confirm = vi.fn(async () => undefined);
    const session = new CoverPickerSession(model, {
      prepareLocal: vi.fn(async () => prepared),
      generateAi: vi.fn(async () => { throw new Error('provider unavailable'); }),
      confirm,
    });

    await session.generateAi();
    const error = await session.confirm().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CoverPickerError);
    expect(error).toMatchObject({ code: 'COVER_CONFIRMATION_REQUIRED' });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('confirms only the prepared crop selected by the user', async () => {
    const confirm = vi.fn(async () => undefined);
    const session = new CoverPickerSession(model, {
      prepareLocal: vi.fn(async () => prepared), generateAi: vi.fn(), confirm,
    });

    await session.selectLocal('first-image');
    await session.confirm();

    expect(confirm).toHaveBeenCalledWith(prepared);
  });
});
