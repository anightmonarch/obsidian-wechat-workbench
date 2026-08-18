import { createServer } from 'node:http';
import type { RequestListener } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';

import { PinnedNodeHttpTransport } from '../../../src/wechat/pinned-node-http-transport';

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

describe('PinnedNodeHttpTransport', () => {
  it('destroys the active socket when the total deadline expires', async () => {
    let closed: () => void = () => undefined;
    const socketClosed = new Promise<void>(resolve => { closed = resolve; });
    const current = await listeningServer((request, _response) => {
      request.socket.once('close', () => closed());
    });
    try {
      const transport = new PinnedNodeHttpTransport(policy(current.port), 1024, 20);

      await expect(transport.request({ method: 'POST', url: 'http://example.test/hang', json: {} }))
        .rejects.toThrow(/timed out/i);
      await expect(socketClosed).resolves.toBeUndefined();
    } finally {
      current.server.close();
    }
  });

  it('rejects a declared oversized response before JSON parsing', async () => {
    const current = await listeningServer((_request, response) => {
      response.writeHead(200, { 'Content-Length': '100' });
      response.end('{}');
    });
    try {
      const transport = new PinnedNodeHttpTransport(policy(current.port), 8, 1_000);

      await expect(transport.request({ method: 'GET', url: 'http://example.test/large' }))
        .rejects.toMatchObject({ code: 'HTTP_RESPONSE_TOO_LARGE' });
    } finally {
      current.server.close();
    }
  });
});
