import { describe, expect, it, vi } from 'vitest';

import {
  AiCoverConfirmationModal,
  buildAiCoverDisclosure,
} from '../../../src/ui/ai-cover-confirmation';

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
    expect(modal.contentEl.textContent).not.toContain('https://images.example.test/v1/images/generations');
    expect(modal.contentEl.textContent).not.toContain('可能产生第三方费用');

    const generate = [...modal.contentEl.querySelectorAll('button')]
      .find(button => button.textContent === '生成');
    generate?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(generateCover).toHaveBeenCalledWith({
      supplementalPrompt: '', includeTitle: false, includeDigest: false, presetId: 'editorial-tech',
    });
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
    expect(generateCover).toHaveBeenCalledWith({
      supplementalPrompt: '电影感、蓝色调', includeTitle: false, includeDigest: false, presetId: 'editorial-tech',
    });
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
    expect(generateCover).toHaveBeenCalledWith({
      supplementalPrompt: '', includeTitle: false, includeDigest: false, presetId: 'cinematic-poster',
    });
  });

  it('discloses the supplemental field only when it will be sent', () => {
    const disclosure = buildAiCoverDisclosure({
      title: 'Title', digest: '', supplementalPrompt: '蓝色调',
    }, provider);

    expect(disclosure.sentFields).toContain('supplementalPrompt');
  });
});
