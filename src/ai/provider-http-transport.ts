import { NetworkPolicy } from '../security/network-policy';
import {
  PinnedNodeHttpTransport,
  type TargetPolicyPort,
} from '../wechat/pinned-node-http-transport';
import { TimeoutHttpTransport } from '../wechat/timeout-http-transport';
import type { HttpTransport } from '../wechat/http-transport';

export function createAiProviderHttpTransport(
  policy: TargetPolicyPort | undefined,
  timeoutMs: number,
): HttpTransport {
  return new TimeoutHttpTransport(
    new PinnedNodeHttpTransport(policy ?? new NetworkPolicy(), undefined, timeoutMs),
    timeoutMs,
  );
}
