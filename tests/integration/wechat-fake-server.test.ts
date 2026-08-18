import { createServer, request as nodeRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import type { HttpRequest, HttpTransport } from '../../src/wechat/http-transport';
import { WeChatClient } from '../../src/wechat/wechat-client';
import type { WeChatDraftArticle } from '../../src/wechat/wechat-types';

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error === undefined ? resolve() : reject(error));
  })));
});

describe('WeChat fake protocol server', () => {
  it('exercises add, get, update, and batchget through real HTTP serialization', async () => {
    const observed: Array<{ path: string; body: unknown }> = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', chunk => chunks.push(chunk as Buffer));
      request.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        observed.push({ path: request.url ?? '', body: text.length === 0 ? null : JSON.parse(text) as unknown });
        response.setHeader('Content-Type', 'application/json');
        if (request.url?.startsWith('/cgi-bin/draft/add') === true) response.end('{"media_id":"TEST_DRAFT_MEDIA_ID"}');
        else if (request.url?.startsWith('/cgi-bin/draft/update') === true) response.end('{"errcode":0}');
        else if (request.url?.startsWith('/cgi-bin/draft/get') === true) response.end('{"news_item":[{"title":"Synthetic article","content":"<p>Body</p>"}],"update_time":1}');
        else response.end('{"total_count":1,"item_count":1,"item":[{"media_id":"TEST_DRAFT_MEDIA_ID","content":{"news_item":[]},"update_time":1}]}');
      });
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const transport: HttpTransport = {
      request: async (input: Readonly<HttpRequest>) => {
        const original = new URL(input.url);
        const body = input.json === undefined
          ? Buffer.from(input.body ?? new Uint8Array())
          : Buffer.from(JSON.stringify(input.json), 'utf8');
        return new Promise((resolve, reject) => {
          const request = nodeRequest({
            hostname: '127.0.0.1',
            port,
            path: `${original.pathname}${original.search}`,
            method: input.method,
            headers: { ...input.headers, 'Content-Length': String(body.byteLength) },
          }, response => {
            const chunks: Buffer[] = [];
            response.on('data', chunk => chunks.push(chunk as Buffer));
            response.on('end', () => {
              resolve({
                status: response.statusCode ?? 0,
                headers: Object.freeze({}),
                body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
              });
            });
          });
          request.on('error', reject);
          request.end(body);
        });
      },
    };
    const client = new WeChatClient(transport);
    const article: WeChatDraftArticle = {
      title: 'Synthetic article', author: '', digest: '',
      html: '<section class="wechat-article"><p>Body</p></section>',
      contentSourceUrl: '', coverMediaId: 'TEST_COVER_MEDIA_ID',
    };

    await client.addDraft(article, 'TEST_ACCESS_TOKEN');
    await client.updateDraft('TEST_DRAFT_MEDIA_ID', article, 'TEST_ACCESS_TOKEN');
    await client.getDraft('TEST_DRAFT_MEDIA_ID', 'TEST_ACCESS_TOKEN');
    await client.listRecentDrafts(0, 20, 'TEST_ACCESS_TOKEN');

    expect(observed.map(item => new URL(`http://fake${item.path}`).pathname)).toEqual([
      '/cgi-bin/draft/add', '/cgi-bin/draft/update', '/cgi-bin/draft/get', '/cgi-bin/draft/batchget',
    ]);
    expect(observed[0]?.body).toMatchObject({ articles: [{ title: 'Synthetic article' }] });
  });
});
