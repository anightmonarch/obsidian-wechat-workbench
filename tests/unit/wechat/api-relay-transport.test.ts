import { describe, expect, it, vi } from 'vitest';

import {
  WECHAT_PROXY_KEY_HEADER,
  WECHAT_PROXY_SECRET_HEADER,
  WeChatApiRelayTransport,
} from '../../../src/wechat/api-relay-transport';
import type { HttpRequest, HttpResponse, HttpTransport } from '../../../src/wechat/http-transport';

class CaptureTransport implements HttpTransport {
  last: HttpRequest | null = null;

  async request(request: Readonly<HttpRequest>): Promise<Readonly<HttpResponse<unknown>>> {
    this.last = request;
    return Object.freeze({ status: 200, headers: Object.freeze({}), body: {} });
  }
}

describe('WeChatApiRelayTransport', () => {
  it('passes through when baseUrl is empty', async () => {
    const inner = new CaptureTransport();
    const transport = new WeChatApiRelayTransport(inner, {
      get: () => ({ baseUrl: '', accessKey: 'ak', secret: 'sk' }),
    });
    await transport.request({
      method: 'GET',
      url: 'https://api.weixin.qq.com/cgi-bin/token',
    });
    expect(inner.last?.url).toBe('https://api.weixin.qq.com/cgi-bin/token');
    expect(inner.last?.headers?.[WECHAT_PROXY_KEY_HEADER]).toBeUndefined();
  });

  it('rewrites api.weixin.qq.com origin and attaches proxy headers', async () => {
    const inner = new CaptureTransport();
    const transport = new WeChatApiRelayTransport(inner, {
      get: () => ({
        baseUrl: 'http://121.196.229.165:18080',
        accessKey: 'wxp_test',
        secret: 'secret-value',
      }),
    });
    await transport.request({
      method: 'POST',
      url: 'https://api.weixin.qq.com/cgi-bin/stable_token',
      headers: { 'Content-Type': 'application/json' },
      json: { grant_type: 'client_credential' },
    });
    expect(inner.last?.url).toBe('http://121.196.229.165:18080/cgi-bin/stable_token');
    expect(inner.last?.headers?.[WECHAT_PROXY_KEY_HEADER]).toBe('wxp_test');
    expect(inner.last?.headers?.[WECHAT_PROXY_SECRET_HEADER]).toBe('secret-value');
    expect(inner.last?.headers?.['Content-Type']).toBe('application/json');
  });

  it('does not rewrite non-WeChat hosts', async () => {
    const inner = new CaptureTransport();
    const transport = new WeChatApiRelayTransport(inner, {
      get: () => ({
        baseUrl: 'http://121.196.229.165:18080',
        accessKey: 'wxp_test',
        secret: 'secret-value',
      }),
    });
    await transport.request({
      method: 'GET',
      url: 'https://example.com/x',
    });
    expect(inner.last?.url).toBe('https://example.com/x');
    expect(inner.last?.headers?.[WECHAT_PROXY_KEY_HEADER]).toBeUndefined();
  });
});
