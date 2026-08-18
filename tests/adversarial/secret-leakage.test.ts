import { describe, expect, it } from 'vitest';

import { redactSensitiveText, toPublicError } from '../../src/wechat/errors';

const sensitiveValue = ['ultra', 'sensitive', 'value', '123456'].join('-');

describe('adversarial secret leakage corpus', () => {
  it.each([
    `Authorization: Bearer ${sensitiveValue}`,
    `{"Authorization":"Bearer ${sensitiveValue}"}`,
    `Authorization = Bearer ${sensitiveValue}`,
    `https://api.weixin.qq.com/token?access_token=${sensitiveValue}&x=1`,
    `accessToken=${sensitiveValue}`,
    `api_key=${sensitiveValue}`,
    `{"appsecret":"${sensitiveValue}"}`,
    `secret=${sensitiveValue}`,
  ])('redacts credential-shaped text: %s', input => {
    const output = redactSensitiveText(input);

    expect(output).not.toContain(sensitiveValue);
    expect(output).toContain('[REDACTED_SECRET]');
  });

  it('never carries a raw transport credential into a public error', () => {
    const error = toPublicError(new Error(
      `request Authorization: Bearer ${sensitiveValue} failed`,
    ), 'TOKEN');

    expect(JSON.stringify(error)).not.toContain(sensitiveValue);
    expect(error.message).not.toContain(sensitiveValue);
  });
});
