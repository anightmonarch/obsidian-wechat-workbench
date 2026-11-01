import type { WeChatConnectionMode } from '../settings/model';
import type { WeChatApiRelayConfig, WeChatApiRelayConfigPort } from './api-relay-transport';
import { resolveWeChatApiRelayConfig } from './resolve-api-relay-config';

export function createWeChatRelayConfigPort(
  getMode: () => WeChatConnectionMode,
  bundled: Readonly<WeChatApiRelayConfig>,
): WeChatApiRelayConfigPort {
  return {
    get: () => resolveWeChatApiRelayConfig(getMode(), bundled),
  };
}
