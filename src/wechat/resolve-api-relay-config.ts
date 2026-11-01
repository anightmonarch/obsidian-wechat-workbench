import type { WeChatConnectionMode } from '../settings/model';
import type { WeChatApiRelayConfig } from './api-relay-transport';

export function resolveWeChatApiRelayConfig(
  mode: WeChatConnectionMode,
  bundled: Readonly<WeChatApiRelayConfig>,
): Readonly<WeChatApiRelayConfig> {
  if (mode === 'public_relay') {
    return Object.freeze({
      baseUrl: bundled.baseUrl.trim(),
      accessKey: bundled.accessKey.trim(),
      secret: bundled.secret.trim(),
    });
  }
  return Object.freeze({ baseUrl: '', accessKey: '', secret: '' });
}
