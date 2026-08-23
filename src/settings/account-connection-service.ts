import type { AccountVerificationRecord, PluginSettings } from './model';
import { accountHashForAppId } from './account';
import { PublicError } from '../wechat/errors';
import ipaddr from 'ipaddr.js';

export type AccountConnectionState =
  | 'UNCONFIGURED'
  | 'UNVERIFIED'
  | 'VERIFYING'
  | 'CONNECTED'
  | 'FAILED';

export interface AccountConnectionSettingsPort {
  get(): Readonly<PluginSettings>;
  update(patch: Partial<PluginSettings>): Promise<Readonly<PluginSettings>>;
}

export interface AccountConnectionSecretPort {
  get(kind: 'appSecret'): string | null;
  set(kind: 'appSecret', value: string): void;
  clear(kind: 'appSecret' | 'accessToken'): void;
}

export interface AccountTokenVerifierPort {
  getValidToken(
    expectedAccountHash: null,
    options: Readonly<{ forceRefresh: true }>,
  ): Promise<string>;
  clear(): Promise<void>;
}

export interface AccountConnectionSnapshot {
  state: AccountConnectionState;
  verifiedAt: number | null;
  errorCode: string | null;
  errcode: number | null;
  whitelistIp: string | null;
}

function isPublicIp(value: string): boolean {
  try {
    if (ipaddr.IPv6.isIPv6(value)) {
      const parsed = ipaddr.IPv6.parse(value);
      return parsed.isIPv4MappedAddress()
        ? parsed.toIPv4Address().range() === 'unicast'
        : parsed.range() === 'unicast';
    }
    return ipaddr.IPv4.parse(value).range() === 'unicast';
  } catch {
    return false;
  }
}

function firstPublicIp(value: string): string | null {
  for (const candidate of value.match(/[0-9a-f:.]+/giu) ?? []) {
    if ((candidate.includes('.') || candidate.includes(':')) && isPublicIp(candidate)) {
      return candidate;
    }
  }
  return null;
}

export class AccountConnectionService {
  private verification: Promise<AccountConnectionSnapshot> | null = null;
  private transient: AccountConnectionSnapshot | null = null;
  private whitelistIp: string | null = null;

  constructor(
    private readonly settings: AccountConnectionSettingsPort,
    private readonly secrets: AccountConnectionSecretPort,
    private readonly tokens: AccountTokenVerifierPort,
    private readonly now: () => number = Date.now,
  ) {}

  snapshot(): AccountConnectionSnapshot {
    if (this.transient !== null) return this.transient;
    const current = this.settings.get();
    const configured = current.appId.trim().length > 0
      && this.secrets.get('appSecret') !== null;
    if (!configured) return Object.freeze({
      state: 'UNCONFIGURED',
      verifiedAt: null,
      errorCode: null,
      errcode: null,
      whitelistIp: null,
    });
    const record = current.accountVerification;
    const accountHash = accountHashForAppId(current.appId);
    const matches = record !== null && record.accountHash === accountHash;
    return Object.freeze({
      state: matches
        ? record.outcome === 'SUCCESS' ? 'CONNECTED' : 'FAILED'
        : 'UNVERIFIED',
      verifiedAt: matches ? record.verifiedAt : null,
      errorCode: matches ? record.errorCode : null,
      errcode: matches ? record.errcode : null,
      whitelistIp: matches && record?.outcome === 'FAILURE' ? this.whitelistIp : null,
    });
  }

  async save(input: Readonly<{ displayName: string; appId: string; appSecret: string }>): Promise<Readonly<PluginSettings>> {
    const displayName = input.displayName.trim();
    const appId = input.appId.trim();
    if (appId.length === 0) {
      throw new PublicError({
        code: 'ACCOUNT_APPID_REQUIRED',
        stage: 'LOCAL_STATE',
        errcode: null,
        errmsg: '微信公众号 AppID 不能为空。',
        rid: null,
        remoteEffect: 'NONE',
        retryable: false,
        nextAction: '输入公众号 AppID 后再保存。',
      });
    }
    const previous = this.settings.get();
    const accountChanged = appId !== previous.appId;
    const secretChanged = input.appSecret.trim().length > 0;
    if (accountChanged && !secretChanged && this.secrets.get('appSecret') === null) {
      throw new PublicError({
        code: 'ACCOUNT_SECRET_REQUIRED',
        stage: 'LOCAL_STATE',
        errcode: null,
        errmsg: '更换 AppID 后需要输入新的 AppSecret。',
        rid: null,
        remoteEffect: 'NONE',
        retryable: false,
        nextAction: '输入新账号的 AppSecret。',
      });
    }
    if (secretChanged) {
      this.secrets.set('appSecret', input.appSecret.trim());
      this.secrets.clear('accessToken');
    }
    this.whitelistIp = null;
    const updated = await this.settings.update({
      accountDisplayName: displayName,
      appId,
      accountHash: accountHashForAppId(appId),
      accessTokenExpiresAt: null,
      accountVerification: null,
    });
    this.transient = null;
    return updated;
  }

  async verify(): Promise<AccountConnectionSnapshot> {
    if (this.verification !== null) return this.verification;
    const current = this.settings.get();
    if (current.appId.trim().length === 0 || this.secrets.get('appSecret') === null) {
      throw new PublicError({
        code: 'WECHAT_ACCOUNT_NOT_CONFIGURED',
        stage: 'TOKEN',
        errcode: null,
        errmsg: '微信公众号账号尚未配置完整。',
        rid: null,
        remoteEffect: 'NONE',
        retryable: false,
        nextAction: '在插件设置中保存 AppID 和 AppSecret。',
      });
    }
    const operation = (async () => {
      this.transient = {
        state: 'VERIFYING',
        verifiedAt: null,
        errorCode: null,
        errcode: null,
        whitelistIp: null,
      };
      this.whitelistIp = null;
      try {
        await this.tokens.getValidToken(null, { forceRefresh: true });
        const record: AccountVerificationRecord = Object.freeze({
          accountHash: accountHashForAppId(current.appId) ?? '',
          outcome: 'SUCCESS',
          verifiedAt: this.now(),
          errorCode: null,
          errcode: null,
        });
        try {
          await this.settings.update({ accountVerification: record });
        } catch {
          await this.tokens.clear();
          throw new PublicError({
            code: 'ACCOUNT_VERIFICATION_SAVE_FAILED',
            stage: 'LOCAL_STATE',
            errcode: null,
            errmsg: '连接已验证，但本地状态保存失败，请重新验证。',
            rid: null,
            remoteEffect: 'NONE',
            retryable: false,
            nextAction: '重新点击验证连接。',
          });
        }
        const snapshot = { ...this.snapshot(), state: 'CONNECTED' } as const;
        this.transient = null;
        return Object.freeze(snapshot);
      } catch (error) {
        if (error instanceof PublicError && error.code === 'ACCOUNT_VERIFICATION_SAVE_FAILED') {
          throw error;
        }
        const publicError = error instanceof PublicError
          ? error
          : new PublicError({
            code: 'WECHAT_TRANSPORT_FAILED',
            stage: 'TOKEN',
            errcode: null,
            errmsg: 'Unknown verification failure.',
            rid: null,
            remoteEffect: 'NONE',
            retryable: true,
            nextAction: 'Check the network and retry.',
          });
        const record: AccountVerificationRecord = Object.freeze({
          accountHash: accountHashForAppId(current.appId) ?? '',
          outcome: 'FAILURE',
          verifiedAt: this.now(),
          errorCode: publicError.code,
          errcode: publicError.errcode,
        });
        await this.settings.update({ accountVerification: record });
        const snapshot = {
          ...this.snapshot(),
          state: 'FAILED',
          whitelistIp: firstPublicIp(publicError.errmsg),
        } as const;
        this.whitelistIp = snapshot.whitelistIp;
        this.transient = null;
        return Object.freeze(snapshot);
      }
    })().catch(error => {
      this.transient = null;
      throw error;
    });
    this.verification = operation.finally(() => {
      this.verification = null;
    });
    return this.verification;
  }

  async disconnect(): Promise<void> {
    this.secrets.clear('appSecret');
    this.secrets.clear('accessToken');
    await this.settings.update({
      accessTokenExpiresAt: null,
      accountVerification: null,
    });
    this.transient = null;
    this.whitelistIp = null;
  }
}
