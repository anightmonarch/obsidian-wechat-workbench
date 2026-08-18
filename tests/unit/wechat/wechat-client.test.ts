import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

import type { HttpRequest, HttpTransport } from '../../../src/wechat/http-transport';
import { WECHAT_ARTICLE_LIMITS, WeChatClient } from '../../../src/wechat/wechat-client';
import type { WeChatDraftArticle } from '../../../src/wechat/wechat-types';

const article: Readonly<WeChatDraftArticle> = Object.freeze({
  title: 'Synthetic article',
  author: 'Tester',
  digest: 'Synthetic digest',
  html: '<section class="wechat-article"><p>Body</p><img src="https://mmbiz.qpic.cn/TEST_IMAGE"></section>',
  contentSourceUrl: 'https://example.test/source',
  coverMediaId: 'TEST_COVER_MEDIA_ID',
});

function transport(body: unknown) {
  const requests: HttpRequest[] = [];
  const request = vi.fn(async (input: Readonly<HttpRequest>) => {
    requests.push(input);
    return { status: 200, headers: Object.freeze({}), body };
  });
  return { http: { request } as HttpTransport, request, requests };
}

describe('WeChatClient', () => {
  it('sends an exact one-article draft payload', async () => {
    const success = JSON.parse(await readFile('tests/fixtures/wechat/draft-add-success.json', 'utf8')) as unknown;
    const current = transport(success);
    const client = new WeChatClient(current.http, () => 'TEST_BOUNDARY');

    await expect(client.addDraft(article, 'TEST_ACCESS_TOKEN')).resolves.toMatchObject({
      mediaId: 'TEST_DRAFT_MEDIA_ID', operation: 'CREATE',
    });

    expect(current.requests[0]).toEqual({
      method: 'POST',
      url: 'https://api.weixin.qq.com/cgi-bin/draft/add?access_token=TEST_ACCESS_TOKEN',
      headers: { 'Content-Type': 'application/json' },
      json: { articles: [{
        title: article.title,
        author: article.author,
        digest: article.digest,
        content: article.html,
        content_source_url: article.contentSourceUrl,
        thumb_media_id: article.coverMediaId,
        need_open_comment: 0,
        only_fans_can_comment: 0,
      }] },
    });
  });

  it('uses the approved update payload with index zero', async () => {
    const current = transport({ errcode: 0 });
    const client = new WeChatClient(current.http, () => 'TEST_BOUNDARY');

    await expect(client.updateDraft('TEST_DRAFT_MEDIA_ID', article, 'TEST_ACCESS_TOKEN'))
      .resolves.toMatchObject({ mediaId: 'TEST_DRAFT_MEDIA_ID', operation: 'UPDATE' });

    expect(current.requests[0]?.url).toBe(
      'https://api.weixin.qq.com/cgi-bin/draft/update?access_token=TEST_ACCESS_TOKEN',
    );
    expect(current.requests[0]?.json).toEqual({
      media_id: 'TEST_DRAFT_MEDIA_ID',
      index: 0,
      articles: {
        title: article.title,
        author: article.author,
        digest: article.digest,
        content: article.html,
        content_source_url: article.contentSourceUrl,
        thumb_media_id: article.coverMediaId,
        need_open_comment: 0,
        only_fans_can_comment: 0,
      },
    });
  });

  it('rejects invalid final content before transport', async () => {
    const current = transport({ media_id: 'TEST_DRAFT_MEDIA_ID' });
    const client = new WeChatClient(current.http, () => 'TEST_BOUNDARY');

    await expect(client.addDraft({
      ...article,
      html: '<section class="wechat-article"><img data-asset-id="asset:missing"></section>',
    }, 'TEST_ACCESS_TOKEN')).rejects.toMatchObject({ code: 'DRAFT_PAYLOAD_INVALID' });
    await expect(client.addDraft({
      ...article,
      html: '<section class="wechat-article"><img src="http://example.test/image.png"></section>',
    }, 'TEST_ACCESS_TOKEN')).rejects.toMatchObject({ code: 'DRAFT_PAYLOAD_INVALID' });
    expect(current.request).not.toHaveBeenCalled();
  });

  it('enforces title, author, and digest boundaries in one exported contract', async () => {
    const valid = transport({ media_id: 'TEST_DRAFT_MEDIA_ID' });
    const client = new WeChatClient(valid.http, () => 'TEST_BOUNDARY');
    await client.addDraft({
      ...article,
      title: '题'.repeat(WECHAT_ARTICLE_LIMITS.title),
      author: '作'.repeat(WECHAT_ARTICLE_LIMITS.author),
      digest: '摘'.repeat(WECHAT_ARTICLE_LIMITS.digest),
    }, 'TEST_ACCESS_TOKEN');
    expect(valid.request).toHaveBeenCalledOnce();

    const invalid = transport({ media_id: 'TEST_DRAFT_MEDIA_ID' });
    await expect(new WeChatClient(invalid.http).addDraft({
      ...article,
      title: '题'.repeat(WECHAT_ARTICLE_LIMITS.title + 1),
    }, 'TEST_ACCESS_TOKEN')).rejects.toMatchObject({ code: 'DRAFT_PAYLOAD_INVALID' });
    expect(invalid.request).not.toHaveBeenCalled();
  });

  it('maps nonzero API errors and preserves only public fields', async () => {
    const apiError = JSON.parse(await readFile('tests/fixtures/wechat/api-error.json', 'utf8')) as unknown;
    const client = new WeChatClient(transport(apiError).http);

    await expect(client.addDraft(article, 'TEST_ACCESS_TOKEN')).rejects.toMatchObject({
      stage: 'DRAFT_CREATE', errcode: 40013, rid: 'TEST_REQUEST_RID', remoteEffect: 'NONE',
    });
  });

  it('marks draft transport failures ambiguous and never retries internally', async () => {
    const request = vi.fn(async () => { throw new Error('synthetic connection reset'); });
    const client = new WeChatClient({ request });

    await expect(client.addDraft(article, 'TEST_ACCESS_TOKEN')).rejects.toMatchObject({
      code: 'DRAFT_COMMIT_AMBIGUOUS', stage: 'DRAFT_CREATE', remoteEffect: 'UNKNOWN',
      retryable: false,
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it('uses only approved media endpoints with deterministic multipart bodies', async () => {
    const current = transport({ url: 'https://mmbiz.qpic.cn/TEST_IMAGE_URL' });
    const client = new WeChatClient(current.http, () => 'TEST_BOUNDARY');
    const image = {
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
      mimeType: 'image/png' as const,
      filename: 'image.png',
    };

    await client.uploadBodyImage(image, 'TEST_ACCESS_TOKEN');

    expect(current.requests[0]?.url).toBe(
      'https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=TEST_ACCESS_TOKEN',
    );
    expect(current.requests[0]?.headers).toEqual({
      'Content-Type': 'multipart/form-data; boundary=TEST_BOUNDARY',
    });
    expect(current.requests[0]?.body).toBeInstanceOf(Uint8Array);
  });
});
