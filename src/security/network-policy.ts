import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { ProxyAwareDnsResolver, type DnsAddress, type DnsResolverPort } from './dns-resolver';

export type { DnsAddress, DnsResolverPort } from './dns-resolver';

export interface ValidatedTarget {
  url: string;
  protocol: 'http:' | 'https:';
  hostname: string;
  port: number;
  address: string;
  family: 4 | 6;
  tlsServername: string | null;
}

export class NetworkPolicyError extends Error {
  constructor(readonly code: 'REMOTE_URL_BLOCKED', message: string) {
    super(message);
    this.name = 'NetworkPolicyError';
  }
}

function blocked(message: string): never {
  throw new NetworkPolicyError('REMOTE_URL_BLOCKED', message);
}

function publicAddress(address: string): boolean {
  try {
    if (ipaddr.IPv6.isIPv6(address)) {
      const parsed = ipaddr.IPv6.parse(address);
      return parsed.isIPv4MappedAddress()
        ? parsed.toIPv4Address().range() === 'unicast'
        : parsed.range() === 'unicast';
    }
    return ipaddr.IPv4.parse(address).range() === 'unicast';
  } catch {
    return false;
  }
}

function withoutBrackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function selectedAddress(records: readonly DnsAddress[]): DnsAddress {
  if (records.length === 0) return blocked('Remote hostname did not resolve.');
  if (records.some(record => !publicAddress(record.address))) {
    return blocked('Remote hostname resolved to a non-public address.');
  }
  return [...records].sort((left, right) => (
    left.family - right.family || left.address.localeCompare(right.address)
  ))[0] as DnsAddress;
}

export class NetworkPolicy {
  constructor(private readonly dns: DnsResolverPort = new ProxyAwareDnsResolver()) {}

  async resolveAndValidate(rawUrl: string): Promise<Readonly<ValidatedTarget>> {
    let url: URL;
    try { url = new URL(rawUrl); } catch { return blocked('Remote image URL is invalid.'); }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return blocked('Only HTTP and HTTPS remote images are supported.');
    }
    if (url.username.length > 0 || url.password.length > 0) {
      return blocked('Credential-bearing remote image URLs are blocked.');
    }
    url.hash = '';
    const hostname = withoutBrackets(url.hostname).toLowerCase();
    const literalFamily = isIP(hostname);
    let pinned: DnsAddress;
    if (literalFamily === 4 || literalFamily === 6) {
      if (!publicAddress(hostname)) return blocked('Remote image IP address is not public.');
      pinned = { address: hostname, family: literalFamily };
    } else {
      try {
        pinned = selectedAddress(await this.dns.lookupAll(hostname));
      } catch (error) {
        if (error instanceof NetworkPolicyError) throw error;
        return blocked('Remote hostname resolution failed.');
      }
    }
    const defaultPort = url.protocol === 'https:' ? 443 : 80;
    return Object.freeze({
      url: url.toString(),
      protocol: url.protocol,
      hostname,
      port: url.port.length > 0 ? Number(url.port) : defaultPort,
      address: pinned.address,
      family: pinned.family,
      tlsServername: url.protocol === 'https:' ? hostname : null,
    });
  }
}
