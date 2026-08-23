import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';

export interface DnsAddress {
  address: string;
  family: 4 | 6;
}

export interface DnsResolverPort {
  lookupAll(hostname: string): Promise<readonly DnsAddress[]>;
}

const DOH_HOSTNAME = 'cloudflare-dns.com';
const DOH_ENDPOINTS = Object.freeze([
  Object.freeze({ address: '1.1.1.1', family: 4 as const }),
  Object.freeze({ address: '1.0.0.1', family: 4 as const }),
]);
const DOH_TIMEOUT_MS = 5_000;
const DOH_MAX_RESPONSE_BYTES = 256 * 1024;

export class NodeDnsResolver implements DnsResolverPort {
  async lookupAll(hostname: string): Promise<readonly DnsAddress[]> {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records
      .filter((record): record is DnsAddress => record.family === 4 || record.family === 6)
      .map(record => ({ address: record.address, family: record.family }));
  }
}

interface DnsJsonResponse {
  Answer?: unknown;
}

function parseAnswers(value: unknown, family: 4 | 6): readonly DnsAddress[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  const answers = (value as DnsJsonResponse).Answer;
  if (!Array.isArray(answers)) return [];
  return answers.flatMap(answer => {
    if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return [];
    const record = answer as Record<string, unknown>;
    const address = record.data;
    const type = record.type;
    const expectedType = family === 4 ? 1 : 28;
    return typeof address === 'string' && type === expectedType && isIP(address) === family
      ? [{ address, family }]
      : [];
  });
}

function readJson(response: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > DOH_MAX_RESPONSE_BYTES) {
        response.destroy(new Error('DNS response exceeds the size limit.'));
        return;
      }
      chunks.push(chunk);
    });
    response.once('error', reject);
    response.once('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

function requestDnsJson(
  endpoint: (typeof DOH_ENDPOINTS)[number],
  hostname: string,
  family: 4 | 6,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const type = family === 4 ? 1 : 28;
    const path = `/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`;
    const request = httpsRequest({
      hostname: endpoint.address,
      family: endpoint.family,
      port: 443,
      method: 'GET',
      path,
      headers: {
        Accept: 'application/dns-json',
        Host: DOH_HOSTNAME,
      },
      servername: DOH_HOSTNAME,
      rejectUnauthorized: true,
    }, response => {
      if ((response.statusCode ?? 0) !== 200) {
        response.resume();
        reject(new Error(`DNS-over-HTTPS returned HTTP ${response.statusCode ?? 0}.`));
        return;
      }
      void readJson(response).then(resolve, reject);
    });
    request.setTimeout(DOH_TIMEOUT_MS, () => request.destroy(new Error('DNS-over-HTTPS timed out.')));
    request.once('error', reject);
    request.end();
  });
}

export class CloudflareDnsOverHttpsResolver implements DnsResolverPort {
  async lookupAll(hostname: string): Promise<readonly DnsAddress[]> {
    const records: DnsAddress[] = [];
    for (const family of [4, 6] as const) {
      let resolved = false;
      for (const endpoint of DOH_ENDPOINTS) {
        try {
          const response = await requestDnsJson(endpoint, hostname, family);
          records.push(...parseAnswers(response, family));
          resolved = true;
          break;
        } catch {
          // Try the second pinned public resolver before failing this family.
        }
      }
      if (!resolved) continue;
    }
    return Object.freeze(records);
  }
}

function isProxySynthetic(address: string): boolean {
  const parts = address.split('.').map(Number);
  return parts.length === 4 && parts[0] === 198 && parts[1] === 18
    && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255);
}

export class ProxyAwareDnsResolver implements DnsResolverPort {
  constructor(
    private readonly system: DnsResolverPort = new NodeDnsResolver(),
    private readonly fallback: DnsResolverPort = new CloudflareDnsOverHttpsResolver(),
  ) {}

  async lookupAll(hostname: string): Promise<readonly DnsAddress[]> {
    let records: readonly DnsAddress[];
    try {
      records = await this.system.lookupAll(hostname);
    } catch {
      return this.safeFallback(hostname);
    }
    if (records.length === 0 || records.every(record => isProxySynthetic(record.address))) {
      return this.safeFallback(hostname);
    }
    return records;
  }

  private async safeFallback(hostname: string): Promise<readonly DnsAddress[]> {
    try {
      return await this.fallback.lookupAll(hostname);
    } catch {
      return [];
    }
  }
}
