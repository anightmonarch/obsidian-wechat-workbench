import { describe, expect, it, vi } from 'vitest';

import { NetworkPolicy, type DnsResolverPort } from '../../../src/security/network-policy';
import {
  RemoteImageFetcher,
  type PinnedHttpResponse,
  type PinnedHttpTransport,
} from '../../../src/security/remote-image-fetcher';

const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);

function policy(): NetworkPolicy {
  const dns: DnsResolverPort = {
    lookupAll: vi.fn(async hostname => {
      if (hostname === 'private.example') return [{ address: '127.0.0.1', family: 4 as const }];
      return [{ address: '93.184.216.34', family: 4 as const }];
    }),
  };
  return new NetworkPolicy(dns);
}

function response(overrides: Partial<PinnedHttpResponse> = {}): PinnedHttpResponse {
  return {
    status: 200,
    headers: Object.freeze({ 'content-type': 'image/png', 'content-length': String(png.byteLength) }),
    body: png,
    ...overrides,
  };
}

describe('RemoteImageFetcher', () => {
  it('returns a validated image after policy-pinned transport', async () => {
    const request = vi.fn(async () => response());
    const transport: PinnedHttpTransport = { request };
    const image = await new RemoteImageFetcher(policy(), transport)
      .fetch('https://public.example/image.png');

    expect(image.mimeType).toBe('image/png');
    expect(image.finalUrl).toBe('https://public.example/image.png');
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      hostname: 'public.example', address: '93.184.216.34', tlsServername: 'public.example',
    }), expect.any(Number));
  });

  it('revalidates and blocks every redirect target', async () => {
    const request = vi.fn(async () => response({
      status: 302,
      headers: Object.freeze({ location: 'http://private.example/private.png' }),
      body: new Uint8Array(),
    }));

    await expect(new RemoteImageFetcher(policy(), { request })
      .fetch('https://public.example/public.png'))
      .rejects.toMatchObject({ code: 'REMOTE_REDIRECT_BLOCKED' });
    expect(request).toHaveBeenCalledOnce();
  });

  it('rejects MIME spoofing and oversized declared bodies', async () => {
    await expect(new RemoteImageFetcher(policy(), {
      request: vi.fn(async () => response({ body: jpeg })),
    }).fetch('https://public.example/spoof.png'))
      .rejects.toMatchObject({ code: 'REMOTE_IMAGE_TYPE_MISMATCH' });

    await expect(new RemoteImageFetcher(policy(), {
      request: vi.fn(async () => response({
        headers: Object.freeze({
          'content-type': 'image/png',
          'content-length': String(10 * 1024 * 1024 + 1),
        }),
      })),
    }).fetch('https://public.example/large.png'))
      .rejects.toMatchObject({ code: 'REMOTE_IMAGE_TOO_LARGE' });
  });

  it('stops after three redirects', async () => {
    let count = 0;
    const request = vi.fn(async () => {
      count += 1;
      return response({
        status: 302,
        headers: Object.freeze({ location: `https://public.example/${count}.png` }),
        body: new Uint8Array(),
      });
    });

    await expect(new RemoteImageFetcher(policy(), { request })
      .fetch('https://public.example/start.png'))
      .rejects.toMatchObject({ code: 'REMOTE_REDIRECT_LIMIT' });
    expect(request).toHaveBeenCalledTimes(4);
  });
});
