import { describe, expect, it, vi } from 'vitest';

import {
  AiCoverConfirmationModal,
  buildAiCoverDisclosure,
} from '../../../src/ui/ai-cover-confirmation';

describe('AI cover disclosure', () => {
  it('shows exactly what will be sent and excludes local/account context', () => {
    const disclosure = buildAiCoverDisclosure({
      title: 'Article title',
      digest: 'Article digest',
      plainText: `Body text ${'字'.repeat(2_000)}`,
    }, {
      imageApiProtocol: 'openai-compatible',
      imageApiBaseUrl: 'https://images.example.test',
      imageApiModel: 'synthetic-image-model',
    });

    expect(disclosure).toMatchObject({
      protocol: 'OpenAI 兼容',
      baseUrl: 'https://images.example.test',
      model: 'synthetic-image-model',
      sentFields: ['title', 'digest', 'bodyExcerpt'],
    });
    expect([...disclosure.payload.bodyExcerpt]).toHaveLength(1_500);
    expect(JSON.stringify(disclosure)).not.toMatch(/vaultPath|wechat-account|appid|appsecret/iu);
  });

  it('requires an explicit modal action before invoking generation', () => {
    const confirm = vi.fn();
    const modal = new AiCoverConfirmationModal({} as never, buildAiCoverDisclosure({
      title: 'Title', digest: '', plainText: 'Body',
    }, {
      imageApiProtocol: 'openai-compatible',
      imageApiBaseUrl: 'https://images.example.test', imageApiModel: 'synthetic-image-model',
    }), confirm);

    modal.open();
    expect(confirm).not.toHaveBeenCalled();
    expect(modal.contentEl.textContent).toContain('https://images.example.test');
    expect(modal.contentEl.textContent).toContain('可能产生第三方费用');

    const generate = [...modal.contentEl.querySelectorAll('button')]
      .find(button => button.textContent === '确认并生成');
    generate?.click();
    expect(confirm).toHaveBeenCalledOnce();
  });
});
