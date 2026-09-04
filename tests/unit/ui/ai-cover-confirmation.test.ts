import { describe, expect, it, vi } from 'vitest';

import {
  AiCoverConfirmationModal,
  aiCoverFailureMessage,
  buildAiCoverDisclosure,
  buildCodexCoverDisclosure,
} from '../../../src/ui/ai-cover-confirmation';
import { CoverGenerationError } from '../../../src/cover/openai-image-generator';

describe('AI cover disclosure', () => {
  const candidate = Object.freeze({
    source: 'ai-generated' as const,
    persistence: 'SET_EXPLICIT_COVER' as const,
    notePath: 'article.md',
    contextHash: 'context',
    vaultPath: null,
    mimeType: 'image/png' as const,
    contentHash: 'cover',
    previewDataUrl: 'data:image/png;base64,COVER',
    bytes: new Uint8Array([1]),
  });
  const provider = Object.freeze({
    provider: 'agnes' as const,
    requestFormat: 'agnes-images' as const,
    endpoint: 'https://images.example.test/v1/images/generations',
    model: 'synthetic-image-model',
  });
  it('discloses only title and digest, never the article body', () => {
    const disclosure = buildAiCoverDisclosure({
      title: 'Article title',
      digest: 'Article digest',
    }, provider);

    expect(disclosure).toMatchObject({
      provider: 'Agnes',
      endpoint: 'https://images.example.test/v1/images/generations',
      model: 'synthetic-image-model',
      sentFields: ['title', 'digest'],
      payload: { supplementalPrompt: '' },
    });
    expect(JSON.stringify(disclosure)).not.toContain('bodyExcerpt');
    expect(JSON.stringify(disclosure)).not.toMatch(/vaultPath|wechat-account|appid|appsecret/iu);
  });

  it('generates inside the modal and keeps it open for preview', async () => {
    const generateCover = vi.fn(async () => candidate);
    const adopt = vi.fn(async () => undefined);
    const modal = new AiCoverConfirmationModal({} as never, buildAiCoverDisclosure({
      title: 'Title', digest: '',
    }, provider), generateCover, adopt);

    modal.open();
    expect(generateCover).not.toHaveBeenCalled();
    expect(modal.contentEl.textContent).toContain('封面图是否包含');
    expect(modal.contentEl.textContent).toContain('标题');
    expect(modal.contentEl.textContent).toContain('摘要');
    const presets = modal.contentEl.querySelector<HTMLSelectElement>('[data-testid="ai-cover-preset"]');
    expect(presets?.options).toHaveLength(10);
    expect(presets?.value).toBe('editorial-tech');
    const configRow = modal.contentEl.querySelector('.wechat-workbench__cover-generation-config');
    expect(configRow?.children[0]?.textContent).toContain('封面主题');
    expect(configRow?.children[1]?.textContent).toContain('封面图是否包含');
    expect(modal.contentEl.textContent).toContain('Agnes');
    expect(modal.contentEl.textContent).toContain('https://images.example.test/v1/images/generations');
    expect(modal.contentEl.textContent).toContain('可能产生第三方费用');

    const generate = [...modal.contentEl.querySelectorAll('button')]
      .find(button => button.textContent === '生成');
    generate?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(generateCover).toHaveBeenCalledWith(expect.objectContaining({
      supplementalPrompt: '', includeTitle: false, includeDigest: false, presetId: 'editorial-tech',
    }));
    expect(generateCover.mock.calls[0]?.[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(modal.contentEl.querySelector<HTMLImageElement>('img[alt="智能生成封面预览"]')?.src)
      .toContain('data:image/png;base64,COVER');
    expect([...modal.contentEl.querySelectorAll('button')].map(button => button.textContent))
      .toEqual(expect.arrayContaining(['取消', '重新生成', '采用']));
  });

  it('keeps the optional prompt in the modal session and passes it only on confirmation', async () => {
    const generateCover = vi.fn(async () => candidate);
    const modal = new AiCoverConfirmationModal({} as never, buildAiCoverDisclosure({
      title: 'Title', digest: '', supplementalPrompt: '暖色、留白、编辑感',
    }, provider), generateCover, vi.fn(async () => undefined));

    modal.open();
    const prompt = modal.contentEl.querySelector<HTMLTextAreaElement>('[data-testid="ai-cover-supplemental-prompt"]');
    expect(prompt?.value).toBe('暖色、留白、编辑感');
    prompt!.value = '电影感、蓝色调';
    prompt!.dispatchEvent(new Event('input'));
    modal.contentEl.querySelector<HTMLButtonElement>('button.mod-cta')?.click();

    await Promise.resolve();
    await Promise.resolve();
    expect(generateCover).toHaveBeenCalledWith(expect.objectContaining({
      supplementalPrompt: '电影感、蓝色调', includeTitle: false, includeDigest: false, presetId: 'editorial-tech',
    }));
    expect(generateCover.mock.calls[0]?.[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('allows users to exclude the title and digest from the generation context', async () => {
    const generateCover = vi.fn(async () => candidate);
    const modal = new AiCoverConfirmationModal({} as never, buildAiCoverDisclosure({
      title: 'Title', digest: 'Digest',
    }, provider), generateCover, vi.fn(async () => undefined));

    modal.open();
    modal.contentEl.querySelector<HTMLInputElement>('[data-testid="ai-cover-include-title"]')!.checked = false;
    modal.contentEl.querySelector<HTMLInputElement>('[data-testid="ai-cover-include-digest"]')!.checked = false;
    const preset = modal.contentEl.querySelector<HTMLSelectElement>('[data-testid="ai-cover-preset"]')!;
    preset.value = 'cinematic-poster';
    preset.dispatchEvent(new Event('change'));
    modal.contentEl.querySelector<HTMLButtonElement>('button.mod-cta')?.click();

    await Promise.resolve();
    await Promise.resolve();
    expect(generateCover).toHaveBeenCalledWith(expect.objectContaining({
      supplementalPrompt: '', includeTitle: false, includeDigest: false, presetId: 'cinematic-poster',
    }));
    expect(generateCover.mock.calls[0]?.[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('cancels an in-flight generation when the modal closes and locks backend switching while busy', async () => {
    let generationSignal: AbortSignal | undefined;
    const generateCover = vi.fn((selection: { signal?: AbortSignal }) => {
      generationSignal = selection.signal;
      return new Promise<never>(() => undefined);
    });
    const disclosure = buildCodexCoverDisclosure({ title: 'Title', digest: '' });
    const modal = new AiCoverConfirmationModal(
      {} as never,
      disclosure,
      generateCover,
      vi.fn(async () => undefined),
      () => undefined,
      { defaultBackend: 'codex', disclosureFor: () => disclosure },
    );

    modal.open();
    vi.spyOn(modal, 'close').mockImplementation(() => modal.onClose());
    modal.contentEl.querySelector<HTMLButtonElement>('button.mod-cta')?.click();
    await Promise.resolve();

    expect(modal.contentEl.querySelector<HTMLSelectElement>('[data-testid="ai-cover-backend"]')?.disabled)
      .toBe(true);
    expect(modal.contentEl.querySelector<HTMLSelectElement>('[data-testid="ai-cover-preset"]')?.disabled)
      .toBe(true);
    expect(modal.contentEl.querySelector<HTMLTextAreaElement>('[data-testid="ai-cover-supplemental-prompt"]')?.disabled)
      .toBe(true);
    const cancelGeneration = [...modal.contentEl.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent === '取消生成');
    expect(cancelGeneration?.disabled).toBe(false);
    cancelGeneration?.click();
    expect(generationSignal?.aborted).toBe(true);
  });

  it('discloses the supplemental field only when it will be sent', () => {
    const disclosure = buildAiCoverDisclosure({
      title: 'Title', digest: '', supplementalPrompt: '蓝色调',
    }, provider);

    expect(disclosure.sentFields).toContain('supplementalPrompt');
  });

  it('switches the cover backend for only the current request and discloses the selected source', async () => {
    const generateCover = vi.fn(async () => candidate);
    const apiDisclosure = buildAiCoverDisclosure({ title: 'Title', digest: '' }, provider);
    const codexDisclosure = buildCodexCoverDisclosure({ title: 'Title', digest: '' });
    const modal = new AiCoverConfirmationModal(
      {} as never,
      codexDisclosure,
      generateCover,
      vi.fn(async () => undefined),
      () => undefined,
      {
        defaultBackend: 'codex',
        disclosureFor: backend => backend === 'codex' ? codexDisclosure : apiDisclosure,
      },
    );

    modal.open();
    const backend = modal.contentEl.querySelector<HTMLSelectElement>('[data-testid="ai-cover-backend"]');
    expect(backend?.value).toBe('codex');
    expect(modal.contentEl.textContent).toContain('本地 Codex');
    expect(modal.contentEl.textContent).toContain('当前登录 Codex 账号');

    backend!.value = 'api';
    backend!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(modal.contentEl.textContent).toContain('Agnes');
    modal.contentEl.querySelector<HTMLButtonElement>('button.mod-cta')?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(generateCover).toHaveBeenCalledWith(expect.objectContaining({ backend: 'api' }));
  });

  it.each([
    ['IMAGE_PROVIDER_KEY_MISSING', '请先在插件设置中保存当前图片供应商的 API Key。'],
    ['IMAGE_PROVIDER_AUTH_REJECTED', '图片服务拒绝鉴权，请检查当前供应商的 API Key。'],
    ['IMAGE_PROVIDER_RATE_LIMITED', '图片服务请求过于频繁，请稍后手动重试。'],
    ['IMAGE_PROVIDER_REJECTED', '图片服务拒绝当前模型或请求参数，请检查模型权限、账户额度和模型名称。'],
    ['IMAGE_PROVIDER_TIMEOUT', '图片服务响应超时，请手动重试。'],
    ['IMAGE_PROVIDER_RESPONSE_TOO_LARGE', '图片服务响应超过安全上限，请更换模型后重试。'],
    ['IMAGE_PROVIDER_OUTPUT_INVALID', '图片服务返回的结果格式不兼容，请更换模型或联系供应商。'],
    ['REMOTE_IMAGE_TIMEOUT', '图片已生成，但下载生成结果超时，请手动重试。'],
    ['REMOTE_IMAGE_REQUEST_FAILED', '图片已生成，但生成结果无法安全下载，请手动重试或更换模型。'],
    ['CODEX_NOT_FOUND', '未检测到本地 Codex，请先安装 Codex CLI 或在插件设置中指定路径。'],
    ['CODEX_NOT_AUTHENTICATED', '本地 Codex 尚未登录，请先在终端完成登录。'],
    ['CODEX_IMAGEGEN_UNAVAILABLE', '当前本地 Codex 不支持图像生成，请更新 Codex 后重试。'],
    ['CODEX_TIMEOUT', '本地 Codex 生成超时，请手动重试。'],
    ['CODEX_IMAGE_NOT_FOUND', '本地 Codex 未生成可用图片，请调整要求后重试。'],
  ])('maps %s to an actionable safe message', (code, message) => {
    expect(aiCoverFailureMessage(new CoverGenerationError(code, 'private provider detail'))).toBe(message);
  });

  it('shows the classified generation failure instead of reporting every failure as configuration', async () => {
    const modal = new AiCoverConfirmationModal({} as never, buildAiCoverDisclosure({
      title: 'Title', digest: '',
    }, provider), vi.fn(async () => {
      throw new CoverGenerationError('IMAGE_PROVIDER_REJECTED', 'provider returned HTTP 402');
    }), vi.fn(async () => undefined));

    modal.open();
    modal.contentEl.querySelector<HTMLButtonElement>('button.mod-cta')?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(modal.contentEl.textContent).toContain('检查模型权限、账户额度和模型名称');
    expect(modal.contentEl.textContent).not.toContain('provider returned HTTP 402');
  });
});
