import { createHash } from 'node:crypto';

export function accountHashForAppId(appId: string): string | null {
  const normalized = appId.trim();
  return normalized.length === 0
    ? null
    : createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
