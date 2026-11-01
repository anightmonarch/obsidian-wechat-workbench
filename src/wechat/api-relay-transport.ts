import type { HttpRequest, HttpResponse, HttpTransport } from './http-transport';

export const WECHAT_API_ORIGIN = 'https://api.weixin.qq.com';
export const WECHAT_PROXY_KEY_HEADER = 'X-WeChat-Proxy-Key';
export const WECHAT_PROXY_SECRET_HEADER = 'X-WeChat-Proxy-Secret';

export interface WeChatApiRelayConfig {
  baseUrl: string;
  accessKey: string;
  secret: string;
}

export interface WeChatApiRelayConfigPort {
  get(): Readonly<WeChatApiRelayConfig>;
}

function rewriteWeChatApiUrl(apiUrl: string, baseUrl: string): string {
  const source = new URL(apiUrl);
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  return new URL(`${source.pathname.replace(/^\//u, '')}${source.search}`, base).toString();
}

/**
 * Rewrites api.weixin.qq.com calls through an optional fixed-IP relay and attaches
 * shared-secret headers. Direct WeChat calls are unchanged when baseUrl is empty.
 */
export class WeChatApiRelayTransport implements HttpTransport {
  constructor(
    private readonly inner: HttpTransport,
    private readonly config: WeChatApiRelayConfigPort,
  ) {}

  request(request: Readonly<HttpRequest>): Promise<Readonly<HttpResponse<unknown>>> {
    const cfg = this.config.get();
    const baseUrl = cfg.baseUrl.trim();
    if (baseUrl.length === 0) return this.inner.request(request);

    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return this.inner.request(request);
    }
    if (url.hostname.toLowerCase() !== 'api.weixin.qq.com') {
      return this.inner.request(request);
    }

    const headers: Record<string, string> = { ...(request.headers ?? {}) };
    const accessKey = cfg.accessKey.trim();
    const secret = cfg.secret.trim();
    if (accessKey.length > 0) headers[WECHAT_PROXY_KEY_HEADER] = accessKey;
    if (secret.length > 0) headers[WECHAT_PROXY_SECRET_HEADER] = secret;

    return this.inner.request({
      ...request,
      url: rewriteWeChatApiUrl(request.url, baseUrl),
      headers,
    });
  }
}
