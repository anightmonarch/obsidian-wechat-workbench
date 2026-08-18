export type SecretKind = 'appSecret' | 'accessToken' | 'imageApiKey';

export interface SecretStoragePort {
  setSecret(id: string, secret: string): void;
  getSecret(id: string): string | null;
}

export type SecretStatus = Readonly<Record<SecretKind, boolean>>;

const SECRET_IDS: Readonly<Record<SecretKind, string>> = Object.freeze({
  appSecret: 'wechat-workbench-app-secret',
  accessToken: 'wechat-workbench-access-token',
  imageApiKey: 'wechat-workbench-image-api-key',
});

export class SecretStore {
  constructor(private readonly storage: SecretStoragePort) {}

  set(kind: SecretKind, value: string): void {
    this.storage.setSecret(SECRET_IDS[kind], value);
  }

  get(kind: SecretKind): string | null {
    const value = this.storage.getSecret(SECRET_IDS[kind]);
    return value === null || value.length === 0 ? null : value;
  }

  clear(kind: SecretKind): void {
    this.storage.setSecret(SECRET_IDS[kind], '');
  }

  status(): SecretStatus {
    return Object.freeze({
      appSecret: this.get('appSecret') !== null,
      accessToken: this.get('accessToken') !== null,
      imageApiKey: this.get('imageApiKey') !== null,
    });
  }
}
