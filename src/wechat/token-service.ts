import type { HttpTransport } from './http-transport';
import { PublicError, toPublicError, weChatApiError } from './errors';
import { accountHashForAppId } from '../settings/account';

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/stable_token';
const REFRESH_MARGIN_MS = 60_000;

export interface TokenSecretPort {
  get(kind: 'appSecret' | 'accessToken'): string | null;
  set(kind: 'appSecret' | 'accessToken', value: string): void;
  clear(kind: 'accessToken'): void;
}

export interface TokenSettingsPort {
  appId: string;
  accessTokenExpiresAt: number | null;
  saveAccessTokenMetadata(expiresAt: number | null): Promise<void>;
}

interface StableTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
  errcode?: unknown;
  errmsg?: unknown;
  rid?: unknown;
}

function responseObject(value: unknown): StableTokenResponse {
  return typeof value === 'object' && value !== null ? value : {};
}

export class TokenService {
  private readonly refreshes = new Map<string, Promise<string>>();

  constructor(
    private readonly secrets: TokenSecretPort,
    private readonly settings: TokenSettingsPort,
    private readonly http: HttpTransport,
    private readonly now: () => number = Date.now,
  ) {}

  async getValidToken(
    expectedAccountHash: string | null = null,
    options: Readonly<{ forceRefresh?: boolean }> = {},
  ): Promise<string> {
    this.assertExpectedAccount(expectedAccountHash);
    const forceRefresh = options.forceRefresh ?? false;
    const cached = this.secrets.get('accessToken');
    const expiresAt = this.settings.accessTokenExpiresAt;
    if (!forceRefresh && cached !== null && expiresAt !== null
      && expiresAt > this.now() + REFRESH_MARGIN_MS) return cached;

    const account = this.settings.appId.trim();
    if (account.length === 0) throw this.configurationError('微信公众号 AppID 未配置。');
    const existing = this.refreshes.get(account);
    if (existing !== undefined) return existing;
    const refresh = this.refresh(account, expectedAccountHash, forceRefresh).finally(() => {
      if (this.refreshes.get(account) === refresh) this.refreshes.delete(account);
    });
    this.refreshes.set(account, refresh);
    return refresh;
  }

  async clear(): Promise<void> {
    this.secrets.clear('accessToken');
    await this.settings.saveAccessTokenMetadata(null);
  }

  private async refresh(
    appId: string,
    expectedAccountHash: string | null,
    forceRefresh: boolean,
  ): Promise<string> {
    const appSecret = this.secrets.get('appSecret');
    if (appSecret === null) throw this.configurationError('微信公众号 AppSecret 未配置。');

    try {
      const response = await this.http.request({
        method: 'POST',
        url: TOKEN_URL,
        headers: { 'Content-Type': 'application/json' },
        json: {
          grant_type: 'client_credential',
          appid: appId,
          secret: appSecret,
          force_refresh: forceRefresh,
        },
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`WeChat token endpoint returned HTTP ${response.status}.`);
      }
      const body = responseObject(response.body);
      if (typeof body.errcode === 'number' && body.errcode !== 0) {
        throw weChatApiError('TOKEN', {
          errcode: body.errcode,
          errmsg: body.errmsg,
          rid: body.rid,
        });
      }
      if (typeof body.access_token !== 'string' || body.access_token.length === 0
        || typeof body.expires_in !== 'number' || body.expires_in <= 0) {
        throw new Error('WeChat token response is malformed.');
      }
      this.assertExpectedAccount(expectedAccountHash);
      this.secrets.set('accessToken', body.access_token);
      try {
        await this.settings.saveAccessTokenMetadata(this.now() + body.expires_in * 1000);
      } catch (error) {
        this.secrets.clear('accessToken');
        throw error;
      }
      return body.access_token;
    } catch (error) {
      throw toPublicError(error, 'TOKEN');
    }
  }

  private configurationError(message: string): PublicError {
    return new PublicError({
      code: 'WECHAT_ACCOUNT_NOT_CONFIGURED',
      stage: 'TOKEN',
      errcode: null,
      errmsg: message,
      rid: null,
      remoteEffect: 'NONE',
      retryable: false,
      nextAction: '在插件设置中配置本地公众号账号。',
    });
  }

  private assertExpectedAccount(expectedAccountHash: string | null): void {
    if (expectedAccountHash === null) return;
    if (accountHashForAppId(this.settings.appId) === expectedAccountHash) return;
    throw new PublicError({
      code: 'WECHAT_ACCOUNT_CHANGED',
      stage: 'TOKEN',
      errcode: null,
      errmsg: 'The configured WeChat account changed after confirmation.',
      rid: null,
      remoteEffect: 'NONE',
      retryable: false,
      nextAction: 'Close the old confirmation dialog and prepare the draft again.',
    });
  }
}
