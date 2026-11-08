import { describe, expect, it } from 'vitest';
import { resolveWeChatApiRelayConfig } from '../../../src/wechat/resolve-api-relay-config';
import { createWeChatRelayConfigPort } from '../../../src/wechat/create-relay-config-port';
import {
  WECHAT_PROXY_KEY_HEADER,
  WECHAT_PROXY_SECRET_HEADER,
  WeChatApiRelayTransport,
} from '../../../src/wechat/api-relay-transport';
import type { HttpRequest, HttpResponse, HttpTransport } from '../../../src/wechat/http-transport';

const USER_RELAY = Object.freeze({
  url: 'https://relay.example.test:18443',
  accessKey: 'wxp_user_fixture',
  secret: 'secret-user-value',
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
    expect(resolveWeChatApiRelayConfig('local', USER_RELAY.url, USER_RELAY.accessKey, USER_RELAY.secret)).toEqual({
      baseUrl: '',
      accessKey: '',
      secret: '',
    });
  });

  it('returns the user-configured relay for relay mode', () => {
    expect(resolveWeChatApiRelayConfig('relay', USER_RELAY.url, USER_RELAY.accessKey, USER_RELAY.secret)).toEqual({
      baseUrl: USER_RELAY.url,
      accessKey: USER_RELAY.accessKey,
      secret: USER_RELAY.secret,
    });
  });

  it('falls back to direct when relay mode has no base URL', () => {
    expect(resolveWeChatApiRelayConfig('relay', '   ', USER_RELAY.accessKey, USER_RELAY.secret)).toEqual({
      baseUrl: '',
      accessKey: '',
      secret: '',
    });
  });

  it('local transport leaves api.weixin.qq.com untouched and omits proxy headers', async () => {
    const inner = new CaptureTransport();
    const cfg = resolveWeChatApiRelayConfig('local', USER_RELAY.url, USER_RELAY.accessKey, USER_RELAY.secret);
    const transport = new WeChatApiRelayTransport(inner, { get: () => cfg });
    await transport.request({ method: 'GET', url: 'https://api.weixin.qq.com/cgi-bin/token' });
    expect(inner.last?.url).toBe('https://api.weixin.qq.com/cgi-bin/token');
    expect(inner.last?.headers?.[WECHAT_PROXY_KEY_HEADER]).toBeUndefined();
    expect(inner.last?.headers?.[WECHAT_PROXY_SECRET_HEADER]).toBeUndefined();
  });

  it('relay transport rewrites origin to the user relay and attaches user headers', async () => {
    const inner = new CaptureTransport();
    const cfg = resolveWeChatApiRelayConfig('relay', USER_RELAY.url, USER_RELAY.accessKey, USER_RELAY.secret);
    const transport = new WeChatApiRelayTransport(inner, { get: () => cfg });
    await transport.request({
      method: 'POST',
      url: 'https://api.weixin.qq.com/cgi-bin/stable_token',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(inner.last?.url).toBe('https://relay.example.test:18443/cgi-bin/stable_token');
    expect(inner.last?.headers?.[WECHAT_PROXY_KEY_HEADER]).toBe(USER_RELAY.accessKey);
    expect(inner.last?.headers?.[WECHAT_PROXY_SECRET_HEADER]).toBe(USER_RELAY.secret);
  });
});

describe('createWeChatRelayConfigPort', () => {
  it('tracks live mode and user-configured relay fields', () => {
    let mode: 'local' | 'relay' = 'local';
    let url = '';
    let accessKey = '';
    let secret = '';
    const port = createWeChatRelayConfigPort(
      () => mode,
      () => url,
      () => accessKey,
      () => secret,
    );
    expect(port.get().baseUrl).toBe('');
    mode = 'relay';
    url = USER_RELAY.url;
    accessKey = USER_RELAY.accessKey;
    secret = USER_RELAY.secret;
    expect(port.get()).toEqual({
      baseUrl: USER_RELAY.url,
      accessKey: USER_RELAY.accessKey,
      secret: USER_RELAY.secret,
    });
  });
});
