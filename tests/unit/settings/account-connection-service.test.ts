import { describe, expect, it, vi } from 'vitest';

import type { PluginSettings } from '../../../src/settings/model';
import { accountHashForAppId } from '../../../src/settings/account';

import { DEFAULT_SETTINGS } from '../../../src/settings/model';
import { AccountConnectionService } from '../../../src/settings/account-connection-service';
import { PublicError } from '../../../src/wechat/errors';

const APP_ID = 'wx-public-id';
const ACCOUNT_HASH = accountHashForAppId(APP_ID);

function createService() {
  const settings = {
    current: { ...DEFAULT_SETTINGS, appId: APP_ID },
    update: vi.fn(async (patch: Partial<PluginSettings>) => {
      settings.current = { ...settings.current, ...patch };
      return settings.current;
    }),
  };
  const secrets = {
    get: vi.fn((kind: string) => kind === 'appSecret' ? 'stored-secret' : null),
    set: vi.fn(),
    clear: vi.fn(),
  };
  const tokens = {
    getValidToken: vi.fn(async () => 'SYNTHETIC_TOKEN'),
    clear: vi.fn(async () => undefined),
  };
  const service = new AccountConnectionService(
    {
      get: () => settings.current,
      update: settings.update,
    },
    secrets,
    tokens,
    () => 1_000,
  );
  return { service, settings, secrets, tokens };
}

describe('AccountConnectionService', () => {
  it('derives connected only from a matching successful verification record', () => {
    const { service, settings } = createService();
    settings.current = {
      ...settings.current,
      accountVerification: Object.freeze({
        accountHash: ACCOUNT_HASH ?? '',
        outcome: 'SUCCESS',
        verifiedAt: 1_000,
        errorCode: null,
        errcode: null,
      }),
    };

    expect(service.snapshot()).toMatchObject({ state: 'CONNECTED', verifiedAt: 1_000 });

    settings.current = { ...settings.current, appId: 'wx-other', accountVerification: null };
    expect(service.snapshot().state).toBe('UNVERIFIED');
  });

  it('rolls back a refreshed token when verification-record persistence fails', async () => {
    const { service, settings, tokens } = createService();
    settings.update.mockRejectedValueOnce(new Error('synthetic save failure'));

    await expect(service.verify()).rejects.toMatchObject({
      code: 'ACCOUNT_VERIFICATION_SAVE_FAILED',
    });
    expect(tokens.clear).toHaveBeenCalledOnce();
  });

  it('disconnects local credentials but preserves display name and app id', async () => {
    const { service, settings, secrets } = createService();
    settings.current.accountDisplayName = 'Commit 日记';

    await service.disconnect();

    expect(secrets.clear).toHaveBeenCalledWith('appSecret');
    expect(secrets.clear).toHaveBeenCalledWith('accessToken');
    expect(settings.current).toMatchObject({
      accountDisplayName: 'Commit 日记',
      appId: APP_ID,
      accountVerification: null,
    });
  });

  it('blocks verification without a complete local account', async () => {
    const { service, settings, secrets, tokens } = createService();
    secrets.get.mockReturnValue(null);

    await expect(service.verify()).rejects.toMatchObject({
      code: 'WECHAT_ACCOUNT_NOT_CONFIGURED',
    });
    expect(tokens.getValidToken).not.toHaveBeenCalled();
    expect(settings.current.appId).toBe(APP_ID);
  });

  it('keeps a public IPv6 whitelist hint transient and rejects private addresses', async () => {
    const current = createService();
    current.tokens.getValidToken.mockRejectedValueOnce(new PublicError({
      code: 'WECHAT_API_ERROR', stage: 'TOKEN', errcode: 40164,
      errmsg: 'invalid ip 2606:4700:4700::1111', rid: null,
      remoteEffect: 'NONE', retryable: false, nextAction: 'check whitelist',
    }));

    const failed = await current.service.verify();

    expect(failed.whitelistIp).toBe('2606:4700:4700::1111');
    expect(current.service.snapshot().whitelistIp).toBe('2606:4700:4700::1111');
    expect(current.settings.current.accountVerification).toMatchObject({
      outcome: 'FAILURE', errcode: 40164,
    });
    expect(JSON.stringify(current.settings.current.accountVerification))
      .not.toContain('2606:4700:4700::1111');

    const privateCurrent = createService();
    privateCurrent.tokens.getValidToken.mockRejectedValueOnce(new PublicError({
      code: 'WECHAT_API_ERROR', stage: 'TOKEN', errcode: 40164,
      errmsg: 'invalid ip 192.168.1.10', rid: null,
      remoteEffect: 'NONE', retryable: false, nextAction: 'check whitelist',
    }));
    expect((await privateCurrent.service.verify()).whitelistIp).toBeNull();
  });
});
