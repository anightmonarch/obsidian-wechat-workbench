import { describe, expect, it, vi } from 'vitest';

import {
  CoverPickerError,
  CoverPickerModal,
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
  notePath: 'article.md',
  contextHash: 'CONTEXT_HASH',
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
    expect(session.errorMessage).toBe('智能封面生成失败，请检查图片服务设置后再试。');
    expect(session.errorMessage).not.toContain('provider unavailable');
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

  it('shows the prepared cover without exposing the internal vault path', async () => {
    const session = new CoverPickerSession(model, {
      prepareLocal: vi.fn(async () => prepared),
      generateAi: vi.fn(),
      confirm: vi.fn(async () => undefined),
    });
    await session.selectLocal('first-image');
    const modal = new CoverPickerModal({} as never, session);

    modal.open();

    expect(modal.contentEl.textContent).toContain('封面预览已准备');
    expect(modal.contentEl.textContent).not.toContain(prepared.vaultPath);
  });

  it('prevents a second generation request while one is still running', async () => {
    let release: (value: typeof prepared) => void = () => undefined;
    const generateAi = vi.fn(() => new Promise<typeof prepared>(resolve => { release = resolve; }));
    const session = new CoverPickerSession(model, {
      prepareLocal: vi.fn(async () => prepared), generateAi, confirm: vi.fn(),
    });

    const first = session.generateAi();
    await expect(session.generateAi()).rejects.toMatchObject({ code: 'COVER_OPERATION_IN_PROGRESS' });
    release(prepared);
    await first;

    expect(generateAi).toHaveBeenCalledOnce();
    expect(session.selected).toBe(prepared);
  });
});
