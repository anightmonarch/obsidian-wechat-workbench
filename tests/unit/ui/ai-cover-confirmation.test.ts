import { describe, expect, it, vi } from 'vitest';

import {
  AiCoverConfirmationModal,
  buildAiCoverDisclosure,
} from '../../../src/ui/ai-cover-confirmation';

describe('AI cover disclosure', () => {
  it('discloses only title and digest, never the article body', () => {
    const disclosure = buildAiCoverDisclosure({
      title: 'Article title',
      digest: 'Article digest',
    }, {
      imageApiProtocol: 'openai-compatible',
      imageApiEndpoint: 'https://images.example.test/v1/images/generations',
      imageApiModel: 'synthetic-image-model',
    });

    expect(disclosure).toMatchObject({
      protocol: 'OpenAI 兼容',
      endpoint: 'https://images.example.test/v1/images/generations',
      model: 'synthetic-image-model',
      sentFields: ['title', 'digest'],
      payload: { supplementalPrompt: '' },
    });
    expect(JSON.stringify(disclosure)).not.toContain('bodyExcerpt');
    expect(JSON.stringify(disclosure)).not.toMatch(/vaultPath|wechat-account|appid|appsecret/iu);
  });

  it('requires an explicit modal action before invoking generation', () => {
    const confirm = vi.fn();
    const modal = new AiCoverConfirmationModal({} as never, buildAiCoverDisclosure({
      title: 'Title', digest: '',
    }, {
      imageApiProtocol: 'openai-compatible',
      imageApiEndpoint: 'https://images.example.test/v1/images/generations', imageApiModel: 'synthetic-image-model',
    }), confirm);

    modal.open();
    expect(confirm).not.toHaveBeenCalled();
    expect(modal.contentEl.textContent).toContain('https://images.example.test/v1/images/generations');
    expect(modal.contentEl.textContent).toContain('可能产生第三方费用');

    const generate = [...modal.contentEl.querySelectorAll('button')]
      .find(button => button.textContent === '确认并生成');
    generate?.click();
    expect(confirm).toHaveBeenCalledWith('');
  });

  it('keeps the optional prompt in the modal session and passes it only on confirmation', () => {
    const confirm = vi.fn();
    const modal = new AiCoverConfirmationModal({} as never, buildAiCoverDisclosure({
      title: 'Title', digest: '', supplementalPrompt: '暖色、留白、编辑感',
    }, {
      imageApiProtocol: 'openai-compatible',
      imageApiEndpoint: 'https://images.example.test/v1/images/generations', imageApiModel: 'synthetic-image-model',
    }), confirm);

    modal.open();
    const prompt = modal.contentEl.querySelector<HTMLTextAreaElement>('[data-testid="ai-cover-supplemental-prompt"]');
    expect(prompt?.value).toBe('暖色、留白、编辑感');
    prompt!.value = '电影感、蓝色调';
    prompt!.dispatchEvent(new Event('input'));
    modal.contentEl.querySelector<HTMLButtonElement>('button.mod-cta')?.click();

    expect(confirm).toHaveBeenCalledWith('电影感、蓝色调');
  });

  it('discloses the supplemental field only when it will be sent', () => {
    const disclosure = buildAiCoverDisclosure({
      title: 'Title', digest: '', supplementalPrompt: '蓝色调',
    }, {
      imageApiProtocol: 'openai-compatible',
      imageApiEndpoint: 'https://images.example.test/v1/images/generations', imageApiModel: 'synthetic-image-model',
    });

    expect(disclosure.sentFields).toContain('supplementalPrompt');
  });
});
