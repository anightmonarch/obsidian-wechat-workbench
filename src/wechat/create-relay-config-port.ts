import type { WeChatConnectionMode } from '../settings/model';
import type { WeChatApiRelayConfigPort } from './api-relay-transport';
import { resolveWeChatApiRelayConfig } from './resolve-api-relay-config';

export function createWeChatRelayConfigPort(
  getMode: () => WeChatConnectionMode,
  getRelayBaseUrl: () => string,
  getRelayAccessKey: () => string,
  getRelaySecret: () => string,
): WeChatApiRelayConfigPort {
  return {
    get: () =>
      resolveWeChatApiRelayConfig(getMode(), getRelayBaseUrl(), getRelayAccessKey(), getRelaySecret()),
  };
}
