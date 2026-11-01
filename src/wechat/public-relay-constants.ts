import type { WeChatApiRelayConfig } from './api-relay-transport';

/** Public fixed egress IP origin. Safe in source / UI tip copy. */
export const PUBLIC_WECHAT_RELAY_BASE_URL = 'http://121.196.229.165:18080';
export const PUBLIC_WECHAT_RELAY_EGRESS_IP = '121.196.229.165';

/**
 * Bundled shared secret for public_relay.
 * Honesty: extractable from distributed main.js. Rate limit + monitoring are the real controls.
 * Real values are injected at production build via esbuild define; never commit real secrets.
 */
declare const __WECHAT_PUBLIC_RELAY_ACCESS_KEY__: string;
declare const __WECHAT_PUBLIC_RELAY_SECRET__: string;

function definedOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export const BUNDLED_PUBLIC_RELAY: Readonly<WeChatApiRelayConfig> = Object.freeze({
  baseUrl: PUBLIC_WECHAT_RELAY_BASE_URL,
  accessKey: definedOrEmpty(
    typeof __WECHAT_PUBLIC_RELAY_ACCESS_KEY__ === 'undefined'
      ? ''
      : __WECHAT_PUBLIC_RELAY_ACCESS_KEY__,
  ),
  secret: definedOrEmpty(
    typeof __WECHAT_PUBLIC_RELAY_SECRET__ === 'undefined'
      ? ''
      : __WECHAT_PUBLIC_RELAY_SECRET__,
  ),
});
