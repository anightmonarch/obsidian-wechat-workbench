import { createServer } from 'node:http';
import type { RequestListener } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';

import { createAiProviderHttpTransport } from '../../../src/ai/provider-http-transport';

async function listeningServer(handler: RequestListener) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Test server address missing.');
  return { server, port: address.port };
}

function policy(port: number) {
  return {
    resolveAndValidate: async (url: string) => ({
      url, protocol: 'http:' as const, hostname: 'example.test', port,
      address: '127.0.0.1', family: 4 as const, tlsServername: null,
    }),
  };
}

describe('AI provider HTTP transport', () => {
  it('uses the image-generation deadline for both pinned and outer transport boundaries', async () => {
    const current = await listeningServer((_request, response) => {
      window.setTimeout(() => response.end('{}'), 50);
    });
    try {
      const transport = createAiProviderHttpTransport(policy(current.port), 100);

      await expect(transport.request({ method: 'POST', url: 'http://example.test/generate', json: {} }))
        .resolves.toMatchObject({ status: 200 });
    } finally {
      await new Promise<void>((resolve, reject) => {
        current.server.close(error => error === undefined ? resolve() : reject(error));
      });
    }
  });
});
