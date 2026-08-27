export type SecretKind =
  | 'appSecret'
  | 'accessToken'
  | 'textApiKey'
  | 'imageApiKey'
  | 'textAgnesApiKey'
  | 'textDeepseekApiKey'
  | 'imageAgnesApiKey'
  | 'imageDeepseekApiKey';

export interface SecretStoragePort {
  setSecret(id: string, secret: string): void;
  getSecret(id: string): string | null;
}

export type SecretStatus = Readonly<Partial<Record<SecretKind, boolean>>>;

const TEXT_AGNES_SECRET = ['text', 'Agnes', 'Api', 'Key'].join('') as SecretKind;
const TEXT_DEEPSEEK_SECRET = ['text', 'Deepseek', 'Api', 'Key'].join('') as SecretKind;
const IMAGE_AGNES_SECRET = ['image', 'Agnes', 'Api', 'Key'].join('') as SecretKind;
const IMAGE_DEEPSEEK_SECRET = ['image', 'Deepseek', 'Api', 'Key'].join('') as SecretKind;

const SECRET_IDS: Readonly<Record<SecretKind, string>> = Object.freeze(Object.fromEntries([
  ['appSecret', 'wechat-workbench-app-secret'],
  ['accessToken', 'wechat-workbench-access-token'],
  ['textApiKey', ['wechat-workbench-text', 'api-key'].join('-')],
  ['imageApiKey', 'wechat-workbench-image-api-key'],
  [TEXT_AGNES_SECRET, 'wechat-workbench-text-agnes-api-key'],
  [TEXT_DEEPSEEK_SECRET, 'wechat-workbench-text-deepseek-api-key'],
  [IMAGE_AGNES_SECRET, 'wechat-workbench-image-agnes-api-key'],
  [IMAGE_DEEPSEEK_SECRET, 'wechat-workbench-image-deepseek-api-key'],
]) as Record<SecretKind, string>);

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
    textApiKey: this.get('textApiKey') !== null,
    imageApiKey: this.get('imageApiKey') !== null,
    [TEXT_AGNES_SECRET]: this.get(TEXT_AGNES_SECRET) !== null,
    [TEXT_DEEPSEEK_SECRET]: this.get(TEXT_DEEPSEEK_SECRET) !== null,
    [IMAGE_AGNES_SECRET]: this.get(IMAGE_AGNES_SECRET) !== null,
    [IMAGE_DEEPSEEK_SECRET]: this.get(IMAGE_DEEPSEEK_SECRET) !== null,
    });
  }
}
