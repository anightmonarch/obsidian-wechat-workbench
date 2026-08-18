import { describe, expect, it } from 'vitest';

import { redactSensitiveText, toPublicError } from '../../../src/wechat/errors';

describe('WeChat public errors', () => {
  it('redacts tokens, secrets, authorization headers, and JSON credentials', () => {
    const raw = [
      'https://api.weixin.qq.com/x?access_token=SYNTHETIC_QUERY_TOKEN',
      'secret=SYNTHETIC_FORM_SECRET',
      'Authorization: Bearer SYNTHETIC_BEARER', // TEST_BEARER_FIXTURE
      '{"secret":"SYNTHETIC_JSON_SECRET","access_token":"SYNTHETIC_JSON_TOKEN"}',
    ].join(' ');

    const redacted = redactSensitiveText(raw);

    expect(redacted).not.toMatch(/SYNTHETIC_(?:QUERY|FORM|BEARER|JSON)/u);
    expect(redacted).toContain('[REDACTED_SECRET]');
  });

  it('exposes a stable safe error shape without raw request data', () => {
    const error = toPublicError(
      new Error('request failed access_token=SYNTHETIC_QUERY_TOKEN secret=SYNTHETIC_FORM_SECRET'),
      'TOKEN',
    );
    const serialized = JSON.stringify(error);

    expect(error).toMatchObject({
      stage: 'TOKEN', remoteEffect: 'NONE', retryable: true,
    });
    expect(serialized).not.toMatch(/SYNTHETIC_(?:QUERY|FORM)/u);
    expect(serialized).not.toMatch(/headers|requestBody/iu);
  });
});
