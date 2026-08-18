import { describe, expect, it, vi } from 'vitest';

import { NetworkPolicy, type DnsResolverPort } from '../../../src/security/network-policy';

function resolver(records: Readonly<Record<string, readonly { address: string; family: 4 | 6 }[]>>): DnsResolverPort {
  return {
    lookupAll: vi.fn(async (hostname: string) => records[hostname] ?? []),
  };
}

describe('NetworkPolicy', () => {
  it.each([
    'http://127.0.0.1/a',
    'http://[::1]/a',
    'http://169.254.169.254/a',
    'http://10.0.0.1/a',
    'http://172.16.0.1/a',
    'http://192.168.1.1/a',
    'http://100.64.0.1/a',
    'http://192.0.2.1/a',
    'http://[fc00::1]/a',
    'http://[fe80::1]/a',
    'http://[2001:db8::1]/a',
  ])('blocks non-public target %s', async url => {
    await expect(new NetworkPolicy(resolver({})).resolveAndValidate(url))
      .rejects.toMatchObject({ code: 'REMOTE_URL_BLOCKED' });
  });

  it('fails closed when any DNS result is non-public', async () => {
    const policy = new NetworkPolicy(resolver({
      'mixed.example': [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.2', family: 4 },
      ],
    }));

    await expect(policy.resolveAndValidate('https://mixed.example/image.png'))
      .rejects.toMatchObject({ code: 'REMOTE_URL_BLOCKED' });
  });

  it('pins a deterministic public address while retaining hostname and TLS metadata', async () => {
    const policy = new NetworkPolicy(resolver({
      'public.example': [
        { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
        { address: '93.184.216.34', family: 4 },
      ],
    }));

    const target = await policy.resolveAndValidate('https://PUBLIC.example:443/a/../image.png#fragment');

    expect(target).toEqual({
      url: 'https://public.example/image.png',
      protocol: 'https:',
      hostname: 'public.example',
      port: 443,
      address: '93.184.216.34',
      family: 4,
      tlsServername: 'public.example',
    });
  });

  it.each([
    'file:///tmp/a.png',
    'ftp://public.example/a.png',
    'https://user:pass@public.example/a.png',
  ])('rejects unsupported or credential-bearing URL %s', async url => {
    await expect(new NetworkPolicy(resolver({
      'public.example': [{ address: '93.184.216.34', family: 4 }],
    })).resolveAndValidate(url)).rejects.toMatchObject({ code: 'REMOTE_URL_BLOCKED' });
  });
});
