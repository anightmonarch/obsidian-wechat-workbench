import { describe, expect, it, vi } from 'vitest';

import { ProxyAwareDnsResolver, type DnsResolverPort } from '../../../src/security/dns-resolver';

describe('ProxyAwareDnsResolver', () => {
  it('uses the public fallback when the system resolver returns only proxy-synthetic addresses', async () => {
    const fallbackLookup = vi.fn(async () => [{ address: '104.18.2.115', family: 4 as const }]);
    const fallback: DnsResolverPort = { lookupAll: fallbackLookup };
    const actual = new ProxyAwareDnsResolver(
      { lookupAll: vi.fn(async () => [{ address: '198.18.0.24', family: 4 as const }]) },
      fallback,
    );

    await expect(actual.lookupAll('openrouter.ai')).resolves.toEqual([
      { address: '104.18.2.115', family: 4 },
    ]);
    expect(fallbackLookup).toHaveBeenCalledWith('openrouter.ai');
  });

  it('does not replace a private or mixed system result with a public fallback', async () => {
    const fallbackLookup = vi.fn(async () => [{ address: '104.18.2.115', family: 4 as const }]);
    const fallback: DnsResolverPort = { lookupAll: fallbackLookup };
    const actual = new ProxyAwareDnsResolver(
      { lookupAll: vi.fn(async () => [
        { address: '198.18.0.24', family: 4 as const },
        { address: '10.0.0.8', family: 4 as const },
      ]) },
      fallback,
    );

    await expect(actual.lookupAll('attacker.example')).resolves.toEqual([
      { address: '198.18.0.24', family: 4 },
      { address: '10.0.0.8', family: 4 },
    ]);
    expect(fallbackLookup).not.toHaveBeenCalled();
  });

  it('fails closed when both system and fallback resolution fail', async () => {
    const system: DnsResolverPort = {
      lookupAll: vi.fn(async () => { throw new Error('system DNS unavailable'); }),
    };
    const fallback: DnsResolverPort = {
      lookupAll: vi.fn(async () => { throw new Error('DoH unavailable'); }),
    };
    const actual = new ProxyAwareDnsResolver(system, fallback);

    await expect(actual.lookupAll('unavailable.example')).resolves.toEqual([]);
  });
});
