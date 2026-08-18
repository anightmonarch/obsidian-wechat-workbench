import { TextDecoder } from 'node:util';
import { describe, expect, it } from 'vitest';

import { encodeMultipart } from '../../../src/wechat/multipart';

describe('encodeMultipart', () => {
  it('uses deterministic CRLF framing and quoted safe filenames', () => {
    const encoded = encodeMultipart([
      { name: 'media', filename: 'cover image.png', contentType: 'image/png', data: Uint8Array.from([1, 2, 3]) },
      { name: 'description', data: '{"title":"cover"}' },
    ], 'TEST_BOUNDARY');
    const text = new TextDecoder('latin1').decode(encoded);

    expect(text).toBe([
      '--TEST_BOUNDARY',
      'Content-Disposition: form-data; name="media"; filename="cover image.png"',
      'Content-Type: image/png',
      '',
      '\u0001\u0002\u0003',
      '--TEST_BOUNDARY',
      'Content-Disposition: form-data; name="description"',
      '',
      '{"title":"cover"}',
      '--TEST_BOUNDARY--',
      '',
    ].join('\r\n'));
  });

  it('rejects header injection and invalid boundaries', () => {
    expect(() => encodeMultipart([{ name: 'media\r\nX-Evil: yes', data: 'x' }], 'TEST_BOUNDARY'))
      .toThrow('Invalid multipart field name');
    expect(() => encodeMultipart([{ name: 'media', filename: 'x\n.png', data: 'x' }], 'TEST_BOUNDARY'))
      .toThrow('Invalid multipart filename');
    expect(() => encodeMultipart([{ name: 'media', data: 'x' }], 'bad boundary'))
      .toThrow('Invalid multipart boundary');
  });
});
