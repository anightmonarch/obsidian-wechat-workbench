import { describe, expect, it, vi } from 'vitest';

import {
  CoverPickerError,
  CoverPickerModal,
  CoverPickerSession,
  type CoverPickerModel,
} from '../../src/ui/cover-picker-modal';

const model: Readonly<CoverPickerModel> = Object.freeze({
  options: Object.freeze([
    Object.freeze({ kind: 'first-image' as const, label: '文章首图（默认）', sourcePath: 'assets/first.png', enabled: true }),
    Object.freeze({ kind: 'upload' as const, label: '上传本地图片', sourcePath: null, enabled: true }),
    Object.freeze({ kind: 'ai' as const, label: '智能生成封面', sourcePath: null, enabled: true }),
  ]),
  aiEnabled: true,
  aiDisabledReason: null,
});
const prepared = Object.freeze({
  source: 'dynamic-first-image' as const,
  persistence: 'SET_EXPLICIT_COVER' as const,
  notePath: 'article.md',
  contextHash: 'CONTEXT_HASH',
  vaultPath: '.wechat-workbench/covers/article/cover-12345678.png',
  mimeType: 'image/png' as const,
  contentHash: 'COVER_HASH',
  previewDataUrl: 'data:image/png;base64,TEST',
});

describe('cover picker session', () => {
  it('renders exactly the three approved sources and opens a native file picker', async () => {
    const session = new CoverPickerSession(model, {
      prepareSelection: vi.fn(async () => prepared),
      prepareUpload: vi.fn(async () => prepared),
      generateAi: vi.fn(),
      confirm: vi.fn(),
    });
    const modal = new CoverPickerModal({} as never, session);
    modal.open();
    document.body.append(modal.contentEl);

    expect(modal.contentEl.textContent).toContain('文章首图（默认）');
    expect(modal.contentEl.textContent).toContain('上传本地图片');
    expect(modal.contentEl.textContent).toContain('智能生成封面');
    expect(modal.contentEl.querySelectorAll('.wechat-workbench__cover-options button')).toHaveLength(1);
    expect(modal.contentEl.querySelector<HTMLInputElement>('input[type="file"]')).toMatchObject({
      accept: 'image/png,image/jpeg,image/webp',
      multiple: false,
    });
    expect(modal.contentEl.querySelector('input[type="text"]')).toBeNull();
    expect(modal.contentEl.textContent).not.toContain('Vault 内图片路径');
    expect(modal.contentEl.querySelector('.wechat-workbench__cover-picker-grid')).not.toBeNull();
    expect(modal.contentEl.querySelectorAll('.wechat-workbench__cover-source-card')).toHaveLength(3);
  });

  it('keeps the native file input mounted after opening the system picker', async () => {
    const session = new CoverPickerSession(model, {
      prepareSelection: vi.fn(async () => prepared),
      prepareUpload: vi.fn(async () => prepared),
      generateAi: vi.fn(),
      confirm: vi.fn(),
    });
    const modal = new CoverPickerModal({} as never, session);
    modal.open();
    document.body.append(modal.contentEl);

    const input = modal.contentEl.querySelector<HTMLInputElement>('input[type="file"]');
    const choose = [...modal.contentEl.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent === '使用本地图片');
    expect(input).not.toBeNull();
    expect(choose).not.toBeUndefined();
    const nativeClick = vi.spyOn(input!, 'click').mockImplementation(() => undefined);

    choose!.click();

    expect(nativeClick).toHaveBeenCalledOnce();
    expect(input!.isConnected).toBe(true);
  });

  it('keeps local options available when AI generation fails', async () => {
    const session = new CoverPickerSession(model, {
      prepareSelection: vi.fn(async () => prepared),
      prepareUpload: vi.fn(async () => prepared),
      generateAi: vi.fn(async () => { throw new Error('provider unavailable'); }),
      confirm: vi.fn(async () => undefined),
    });

    await session.generateAi();

    expect(session.options).toContainEqual(expect.objectContaining({ kind: 'first-image', enabled: true }));
    expect(session.errorCode).toBe('AI_COVER_GENERATION_FAILED');
    expect(session.errorMessage).toBe('图片服务请求失败，请检查网络或 Endpoint 后重试。');
    expect(session.errorMessage).not.toContain('provider unavailable');
    expect(session.selected).toBeNull();
  });

  it('does not turn an explicit AI generation cancellation into a provider failure', async () => {
    const session = new CoverPickerSession(model, {
      prepareSelection: vi.fn(async () => prepared),
      prepareUpload: vi.fn(async () => prepared),
      generateAi: vi.fn(async () => {
        throw new CoverPickerError('AI_COVER_CANCELLED', '已取消生成智能封面。');
      }),
      confirm: vi.fn(),
    });

    await session.generateAi();

    expect(session.errorMessage).toBeNull();
    expect(session.selected).toBeNull();
  });

  it('keeps the previous AI candidate when a regeneration fails', async () => {
    const generated = Object.freeze({ ...prepared, source: 'ai-generated' as const });
    let calls = 0;
    const generateAi = vi.fn(async () => {
      calls += 1;
      if (calls === 2) throw new Error('temporary provider failure');
      return generated;
    });
    const session = new CoverPickerSession(model, {
      prepareSelection: vi.fn(async () => prepared),
      prepareUpload: vi.fn(async () => prepared), generateAi, confirm: vi.fn(),
    });

    await session.generateAi();
    await session.generateAi();

    expect(session.selected).toBe(generated);
    expect(session.errorCode).toBe('AI_COVER_GENERATION_FAILED');
  });

  it('does not confirm an unselected or failed generated cover', async () => {
    const confirm = vi.fn(async () => undefined);
    const session = new CoverPickerSession(model, {
      prepareSelection: vi.fn(async () => prepared),
      prepareUpload: vi.fn(async () => prepared),
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
      prepareSelection: vi.fn(async () => prepared),
      prepareUpload: vi.fn(async () => prepared), generateAi: vi.fn(), confirm,
    });

    await session.selectLocal('first-image');
    await session.confirm();

    expect(confirm).toHaveBeenCalledWith(prepared);
  });

  it('keeps generated candidates in the modal session until adoption and can restore the article first image', async () => {
    const generated = Object.freeze({ ...prepared, source: 'ai-generated' as const });
    const firstImage = Object.freeze({ ...prepared, source: 'dynamic-first-image' as const, persistence: 'CLEAR_EXPLICIT_COVER' as const, vaultPath: null });
    const confirm = vi.fn(async () => undefined);
    const prepareSelection = vi.fn(async (option: Readonly<{ kind: string }>) => option.kind === 'first-image' ? firstImage : generated);
    const generateAi = vi.fn(async () => generated);
    const session = new CoverPickerSession(model, {
      prepareSelection,
      prepareUpload: vi.fn(async () => generated),
      generateAi,
      confirm,
    });

    await session.generateAi();
    expect(session.selected).toBe(generated);
    await session.selectLocal('first-image');
    expect(session.selected).toBe(firstImage);
    await session.confirm();

    expect(generateAi).toHaveBeenCalledOnce();
    expect(prepareSelection).toHaveBeenCalledWith(expect.objectContaining({ kind: 'first-image' }));
    expect(confirm).toHaveBeenCalledWith(firstImage);
  });

  it('shows the prepared cover without exposing the internal vault path', async () => {
    const session = new CoverPickerSession(model, {
      prepareSelection: vi.fn(async () => prepared),
      prepareUpload: vi.fn(async () => prepared),
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
      prepareSelection: vi.fn(async () => prepared),
      prepareUpload: vi.fn(async () => prepared), generateAi, confirm: vi.fn(),
    });

    const first = session.generateAi();
    await expect(session.generateAi()).rejects.toMatchObject({ code: 'COVER_OPERATION_IN_PROGRESS' });
    release(prepared);
    await first;

    expect(generateAi).toHaveBeenCalledOnce();
    expect(session.selected).toBe(prepared);
  });

  it('reuses the current-session prompt when regenerating an AI cover', async () => {
    const generated = Object.freeze({ ...prepared, source: 'ai-generated' as const });
    const generateAi = vi.fn(async (prompt: string) => {
      expect(prompt).toBe('蓝色调、留白');
      return generated;
    });
    const session = new CoverPickerSession(model, {
      prepareSelection: vi.fn(async () => prepared),
      prepareUpload: vi.fn(async () => prepared), generateAi, confirm: vi.fn(),
    });

    session.setSupplementalPrompt('蓝色调、留白');
    await session.generateAi();
    await session.generateAi();

    expect(generateAi).toHaveBeenCalledTimes(2);
    expect(session.selected).toBe(generated);
  });
});
