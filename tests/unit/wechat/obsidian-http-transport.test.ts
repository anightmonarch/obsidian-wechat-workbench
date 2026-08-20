import { describe, expect, it, vi } from 'vitest';

import { ObsidianHttpTransport } from '../../../src/wechat/obsidian-http-transport';

describe('ObsidianHttpTransport', () => {
  it('sends JSON through Obsidian requestUrl without DNS pinning', async () => {
    const requestUrl = vi.fn(async () => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      json: { errcode: 40013, errmsg: 'invalid appid' },
    }));
    const transport = new ObsidianHttpTransport(requestUrl as never);

    const response = await transport.request({
      method: 'POST',
      url: 'https://api.weixin.qq.com/cgi-bin/stable_token',
      headers: { 'Content-Type': 'application/json' },
      json: { appid: 'wxSYNTHETIC', secret: 'SYNTHETIC_SECRET' },
    });

    expect(requestUrl).toHaveBeenCalledWith({
      url: 'https://api.weixin.qq.com/cgi-bin/stable_token',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appid: 'wxSYNTHETIC', secret: 'SYNTHETIC_SECRET' }),
      throw: false,
    });
    expect(response).toMatchObject({ status: 200, body: { errcode: 40013 } });
  });
});
