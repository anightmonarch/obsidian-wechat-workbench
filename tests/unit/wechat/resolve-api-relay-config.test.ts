import { describe, expect, it } from 'vitest';
import { resolveWeChatApiRelayConfig } from '../../../src/wechat/resolve-api-relay-config';
import { createWeChatRelayConfigPort } from '../../../src/wechat/create-relay-config-port';
import {
  WECHAT_PROXY_KEY_HEADER,
  WECHAT_PROXY_SECRET_HEADER,
  WeChatApiRelayTransport,
} from '../../../src/wechat/api-relay-transport';
import type { HttpRequest, HttpResponse, HttpTransport } from '../../../src/wechat/http-transport';

const FIXTURE_BUNDLED = Object.freeze({
  baseUrl: 'http://121.196.229.165:18080',
  accessKey: 'wxp_test_fixture',
  secret: 'secret-fixture-value',
});

class CaptureTransport implements HttpTransport {
  last: HttpRequest | null = null;
  async request(request: Readonly<HttpRequest>): Promise<Readonly<HttpResponse<unknown>>> {
    this.last = request;
    return Object.freeze({ status: 200, headers: Object.freeze({}), body: {} });
  }
}

describe('resolveWeChatApiRelayConfig', () => {
  it('returns empty config for local (no rewrite, no headers)', () => {
    expect(resolveWeChatApiRelayConfig('local', FIXTURE_BUNDLED)).toEqual({
      baseUrl: '',
      accessKey: '',
      secret: '',
    });
  });

  it('returns bundled constants for public_relay', () => {
    expect(resolveWeChatApiRelayConfig('public_relay', FIXTURE_BUNDLED)).toEqual(FIXTURE_BUNDLED);
  });

  it('local transport leaves api.weixin.qq.com untouched and omits proxy headers', async () => {
    const inner = new CaptureTransport();
    const cfg = resolveWeChatApiRelayConfig('local', FIXTURE_BUNDLED);
    const transport = new WeChatApiRelayTransport(inner, { get: () => cfg });
    await transport.request({ method: 'GET', url: 'https://api.weixin.qq.com/cgi-bin/token' });
    expect(inner.last?.url).toBe('https://api.weixin.qq.com/cgi-bin/token');
    expect(inner.last?.headers?.[WECHAT_PROXY_KEY_HEADER]).toBeUndefined();
    expect(inner.last?.headers?.[WECHAT_PROXY_SECRET_HEADER]).toBeUndefined();
  });

  it('public_relay transport rewrites origin and attaches bundled headers', async () => {
    const inner = new CaptureTransport();
    const cfg = resolveWeChatApiRelayConfig('public_relay', FIXTURE_BUNDLED);
    const transport = new WeChatApiRelayTransport(inner, { get: () => cfg });
    await transport.request({
      method: 'POST',
      url: 'https://api.weixin.qq.com/cgi-bin/stable_token',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(inner.last?.url).toBe('http://121.196.229.165:18080/cgi-bin/stable_token');
    expect(inner.last?.headers?.[WECHAT_PROXY_KEY_HEADER]).toBe('wxp_test_fixture');
    expect(inner.last?.headers?.[WECHAT_PROXY_SECRET_HEADER]).toBe('secret-fixture-value');
  });
});

describe('createWeChatRelayConfigPort', () => {
  it('createWeChatRelayConfigPort tracks live mode changes', () => {
    let mode: 'local' | 'public_relay' = 'local';
    const port = createWeChatRelayConfigPort(() => mode, FIXTURE_BUNDLED);
    expect(port.get().baseUrl).toBe('');
    mode = 'public_relay';
    expect(port.get().baseUrl).toBe(FIXTURE_BUNDLED.baseUrl);
  });
});
