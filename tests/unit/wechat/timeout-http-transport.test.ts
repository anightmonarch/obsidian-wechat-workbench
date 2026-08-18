import { describe, expect, it, vi } from 'vitest';

import { TimeoutHttpTransport } from '../../../src/wechat/timeout-http-transport';

describe('TimeoutHttpTransport', () => {
  it('rejects a transport that never settles', async () => {
    const request = vi.fn(() => new Promise<never>(() => undefined));
    const transport = new TimeoutHttpTransport({ request }, 5);

    await expect(transport.request({ method: 'GET', url: 'https://example.test' }))
      .rejects.toMatchObject({ code: 'HTTP_REQUEST_TIMEOUT' });
    expect(request).toHaveBeenCalledOnce();
  });
});
