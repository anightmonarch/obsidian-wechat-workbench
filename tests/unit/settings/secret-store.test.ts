import { describe, expect, it } from 'vitest';

import { SecretStore, type SecretStoragePort } from '../../../src/settings/secret-store';

class MemorySecretStorage implements SecretStoragePort {
  readonly values = new Map<string, string>();

  setSecret(id: string, secret: string): void {
    this.values.set(id, secret);
  }

  getSecret(id: string): string | null {
    return this.values.get(id) ?? null;
  }
}

describe('SecretStore', () => {
  it('uses fixed lowercase SecretStorage ids', () => {
    const storage = new MemorySecretStorage();
    const secrets = new SecretStore(storage);

    secrets.set('appSecret', 'synthetic-secret');
    secrets.set('accessToken', 'synthetic-token');
    secrets.set('textApiKey', 'synthetic-text-key');
    secrets.set('imageApiKey', 'synthetic-key');

    expect(storage.values).toEqual(new Map([
      ['wechat-workbench-app-secret', 'synthetic-secret'],
      ['wechat-workbench-access-token', 'synthetic-token'],
      ['wechat-workbench-text-api-key', 'synthetic-text-key'],
      ['wechat-workbench-image-api-key', 'synthetic-key'],
    ]));
  });

  it('reports only configured status and never exposes values', () => {
    const storage = new MemorySecretStorage();
    const secrets = new SecretStore(storage);
    secrets.set('appSecret', 'synthetic-secret');

    expect(secrets.status()).toEqual({
      appSecret: true,
      accessToken: false,
      textApiKey: false,
      imageApiKey: false,
      textAgnesApiKey: false,
      textDeepseekApiKey: false,
      imageAgnesApiKey: false,
      imageDeepseekApiKey: false,
    });
  });

  it('clears a secret by replacing it with an empty value', () => {
    const storage = new MemorySecretStorage();
    const secrets = new SecretStore(storage);
    secrets.set('accessToken', 'synthetic-token');

    secrets.clear('accessToken');

    expect(secrets.get('accessToken')).toBeNull();
    expect(storage.values.get('wechat-workbench-access-token')).toBe('');
  });
});
