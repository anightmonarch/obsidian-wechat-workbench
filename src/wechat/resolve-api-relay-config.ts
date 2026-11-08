import type { WeChatConnectionMode } from '../settings/model';
import type { WeChatApiRelayConfig } from './api-relay-transport';

/**
 * Resolves the relay configuration from user-provided settings. The distribution
 * never bundles a relay address or shared credentials; an empty base URL falls
 * back to direct WeChat API calls.
 */
export function resolveWeChatApiRelayConfig(
  mode: WeChatConnectionMode,
  relayBaseUrl: string,
  relayAccessKey: string,
  relaySecret: string,
): Readonly<WeChatApiRelayConfig> {
  const baseUrl = relayBaseUrl.trim();
  if (mode === 'relay' && baseUrl.length > 0) {
    return Object.freeze({
      baseUrl,
      accessKey: relayAccessKey.trim(),
      secret: relaySecret.trim(),
    });
  }
  return Object.freeze({ baseUrl: '', accessKey: '', secret: '' });
}
