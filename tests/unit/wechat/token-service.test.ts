import { describe, expect, it, vi } from 'vitest';

import type { HttpResponse, HttpTransport } from '../../../src/wechat/http-transport';
import { TokenService, type TokenSettingsPort } from '../../../src/wechat/token-service';

class MemorySecrets {
  readonly values = new Map<string, string>();
  get(kind: 'appSecret' | 'accessToken'): string | null { return this.values.get(kind) ?? null; }
  set(kind: 'appSecret' | 'accessToken', value: string): void { this.values.set(kind, value); }
  clear(kind: 'accessToken'): void { this.values.delete(kind); }
}

class MemorySettings implements TokenSettingsPort {
  appId = 'SYNTHETIC_APP_ID';
  accessTokenExpiresAt: number | null = null;
  async saveAccessTokenMetadata(expiresAt: number | null): Promise<void> {
    this.accessTokenExpiresAt = expiresAt;
  }
}

describe('TokenService', () => {
  it('reuses a token until sixty seconds before expiry', async () => {
    const now = 1_000_000;
    const secrets = new MemorySecrets();
    secrets.set('accessToken', 'SYNTHETIC_TOKEN_ONE');
    const settings = new MemorySettings();
    settings.accessTokenExpiresAt = now + 61_000;
    const request = vi.fn();
    const http: HttpTransport = { request };
    const service = new TokenService(secrets, settings, http, () => now);

    await expect(service.getValidToken()).resolves.toBe('SYNTHETIC_TOKEN_ONE');
    expect(request).not.toHaveBeenCalled();
  });

  it('calls only stable_token and stores the refreshed token and expiry separately', async () => {
    const now = 2_000_000;
    const secrets = new MemorySecrets();
    secrets.set('appSecret', 'SYNTHETIC_APP_SECRET');
    const settings = new MemorySettings();
    const request = vi.fn(async () => ({
      status: 200,
      headers: Object.freeze({}),
      body: { access_token: 'SYNTHETIC_TOKEN_TWO', expires_in: 7200 }, // TEST_TOKEN_FIXTURE
    }));
    const service = new TokenService(secrets, settings, { request }, () => now);

    await expect(service.getValidToken()).resolves.toBe('SYNTHETIC_TOKEN_TWO');

    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      url: 'https://api.weixin.qq.com/cgi-bin/stable_token',
      headers: { 'Content-Type': 'application/json' },
      json: {
        grant_type: 'client_credential',
        appid: 'SYNTHETIC_APP_ID',
        secret: 'SYNTHETIC_APP_SECRET',
        force_refresh: false,
      },
    });
    expect(secrets.get('accessToken')).toBe('SYNTHETIC_TOKEN_TWO');
    expect(settings.accessTokenExpiresAt).toBe(now + 7_200_000);
  });

  it('collapses concurrent refreshes per account', async () => {
    const secrets = new MemorySecrets();
    secrets.set('appSecret', 'SYNTHETIC_APP_SECRET');
    const settings = new MemorySettings();
    let resolveRequest: ((value: { status: number; headers: Readonly<Record<string, string>>; body: unknown }) => void) | undefined;
    const request = vi.fn(() => new Promise<Readonly<HttpResponse<unknown>>>(resolve => {
      resolveRequest = resolve;
    }));
    const service = new TokenService(secrets, settings, { request }, () => 3_000_000);

    const first = service.getValidToken();
    const second = service.getValidToken();
    resolveRequest?.({
      status: 200,
      headers: Object.freeze({}),
      body: { access_token: 'SYNTHETIC_SHARED_TOKEN', expires_in: 7200 }, // TEST_TOKEN_FIXTURE
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      'SYNTHETIC_SHARED_TOKEN', 'SYNTHETIC_SHARED_TOKEN',
    ]);
    expect(request).toHaveBeenCalledOnce();
  });

  it('maps a nonzero WeChat error without retaining submitted credentials', async () => {
    const secrets = new MemorySecrets();
    secrets.set('appSecret', 'SYNTHETIC_APP_SECRET');
    const settings = new MemorySettings();
    const service = new TokenService(secrets, settings, {
      request: vi.fn(async () => ({
        status: 200, headers: Object.freeze({}),
        body: { errcode: 40013, errmsg: 'invalid appid', rid: 'SYNTHETIC_RID' },
      })),
    }, () => 4_000_000);

    await expect(service.getValidToken()).rejects.toMatchObject({
      stage: 'TOKEN', errcode: 40013, rid: 'SYNTHETIC_RID', remoteEffect: 'NONE',
    });
    expect(secrets.get('accessToken')).toBeNull();
  });
});
