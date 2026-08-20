import { randomUUID } from 'node:crypto';

import type { UploadImage, MediaUploadPort } from '../publish/asset-upload-service';
import { parseArticleRoot } from '../render/canonicalize';
import { PublicError, toPublicError, type WeChatStage, weChatApiError } from './errors';
import type { HttpRequest, HttpTransport } from './http-transport';
import { encodeMultipart } from './multipart';
import {
  WECHAT_ARTICLE_LIMITS,
  type DraftReceipt,
  type RemoteDraft,
  type RemoteDraftPage,
  type WeChatDraftArticle,
} from './wechat-types';

const API_ORIGIN = 'https://api.weixin.qq.com';

export { WECHAT_ARTICLE_LIMITS } from './wechat-types';

type BoundaryFactory = () => string;

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function apiUrl(path: string, accessToken: string, query: Readonly<Record<string, string>> = {}): string {
  const url = new URL(path, API_ORIGIN);
  url.searchParams.set('access_token', accessToken);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.toString();
}

function invalidPayload(message: string): PublicError {
  return new PublicError({
    code: 'DRAFT_PAYLOAD_INVALID',
    stage: 'DRAFT_CREATE',
    errcode: null,
    errmsg: message,
    rid: null,
    remoteEffect: 'NONE',
    retryable: false,
    nextAction: 'Fix the article preflight issue before publishing.',
  });
}

function textLength(value: string): number {
  return [...value].length;
}

function validateArticle(article: Readonly<WeChatDraftArticle>): void {
  if (article.title.trim().length === 0 || textLength(article.title) > WECHAT_ARTICLE_LIMITS.title) {
    throw invalidPayload(`Title must contain 1-${WECHAT_ARTICLE_LIMITS.title} characters.`);
  }
  if (textLength(article.author) > WECHAT_ARTICLE_LIMITS.author) {
    throw invalidPayload(`Author must contain at most ${WECHAT_ARTICLE_LIMITS.author} characters.`);
  }
  if (textLength(article.digest) > WECHAT_ARTICLE_LIMITS.digest) {
    throw invalidPayload(`Digest must contain at most ${WECHAT_ARTICLE_LIMITS.digest} characters.`);
  }
  if (article.coverMediaId.trim().length === 0) throw invalidPayload('Cover media ID is required.');
  if (article.contentSourceUrl.length > 0) {
    try {
      if (new URL(article.contentSourceUrl).protocol !== 'https:') {
        throw invalidPayload('Content source URL must be HTTPS.');
      }
    } catch (error) {
      if (error instanceof PublicError) throw error;
      throw invalidPayload('Content source URL is invalid.');
    }
  }

  let root: HTMLElement;
  try { root = parseArticleRoot(article.html); } catch { throw invalidPayload('Article HTML root is invalid.'); }
  if (root.querySelector('[data-asset-id]') !== null) throw invalidPayload('Article contains unresolved asset slots.');
  if ((root.textContent ?? '').trim().length === 0 && root.querySelector('img') === null) {
    throw invalidPayload('Article body is empty after sanitization.');
  }
  for (const image of root.querySelectorAll('img')) {
    const source = image.getAttribute('src');
    try {
      if (source === null || new URL(source).protocol !== 'https:') {
        throw invalidPayload('Every final article image must use HTTPS.');
      }
    } catch (error) {
      if (error instanceof PublicError) throw error;
      throw invalidPayload('Final article image URL is invalid.');
    }
  }
}

function articlePayload(article: Readonly<WeChatDraftArticle>): Record<string, unknown> {
  validateArticle(article);
  return {
    title: article.title,
    author: article.author,
    digest: article.digest,
    content: article.html,
    content_source_url: article.contentSourceUrl,
    thumb_media_id: article.coverMediaId,
    need_open_comment: 0,
    only_fans_can_comment: 0,
  };
}

function apiError(body: Record<string, unknown>, stage: WeChatStage): PublicError | null {
  return typeof body.errcode === 'number' && body.errcode !== 0
    ? weChatApiError(stage, { errcode: body.errcode, errmsg: body.errmsg, rid: body.rid })
    : null;
}

function approvedWechatImageUrl(value: unknown, stage: WeChatStage): string {
  if (typeof value !== 'string') {
    throw toPublicError(new Error('WeChat image upload response is malformed.'), stage);
  }
  try {
    const url = new URL(value);
    const hostApproved = url.hostname === 'mmbiz.qpic.cn' || url.hostname.endsWith('.mmbiz.qpic.cn');
    const sensitiveQuery = [...url.searchParams.keys()].some(key => /token|secret|key/iu.test(key));
    if (!hostApproved || sensitiveQuery
      || url.username.length > 0 || url.password.length > 0) {
      throw new Error('WeChat image URL is outside the approved CDN boundary.');
    }
    if (url.protocol === 'http:') url.protocol = 'https:';
    if (url.protocol !== 'https:') {
      throw new Error('WeChat image URL is outside the approved CDN boundary.');
    }
    return url.toString();
  } catch (error) {
    throw toPublicError(error, stage);
  }
}

export class WeChatClient implements MediaUploadPort {
  constructor(
    private readonly http: HttpTransport,
    private readonly boundary: BoundaryFactory = () => `wechat-workbench-${randomUUID()}`,
  ) {}

  async uploadBodyImage(image: Readonly<UploadImage>, accessToken: string): Promise<Readonly<{ url: string }>> {
    const body = await this.multipartRequest(
      '/cgi-bin/media/uploadimg', image, accessToken, 'UPLOAD_BODY_IMAGE',
    );
    return Object.freeze({ url: approvedWechatImageUrl(body.url, 'UPLOAD_BODY_IMAGE') });
  }

  async uploadCover(
    image: Readonly<UploadImage>,
    accessToken: string,
  ): Promise<Readonly<{ mediaId: string; url?: string }>> {
    const body = await this.multipartRequest(
      '/cgi-bin/material/add_material', image, accessToken, 'UPLOAD_COVER', { type: 'image' },
    );
    if (typeof body.media_id !== 'string' || body.media_id.length === 0) {
      throw toPublicError(new Error('WeChat cover upload response is malformed.'), 'UPLOAD_COVER');
    }
    return Object.freeze({
      mediaId: body.media_id,
      ...(typeof body.url === 'string' ? { url: approvedWechatImageUrl(body.url, 'UPLOAD_COVER') } : {}),
    });
  }

  async addDraft(
    article: Readonly<WeChatDraftArticle>,
    accessToken: string,
  ): Promise<Readonly<DraftReceipt>> {
    const body = await this.jsonRequest('/cgi-bin/draft/add', {
      articles: [articlePayload(article)],
    }, accessToken, 'DRAFT_CREATE');
    if (typeof body.media_id !== 'string' || body.media_id.length === 0) {
      throw toPublicError(new Error('WeChat draft create response is malformed.'), 'DRAFT_CREATE');
    }
    return Object.freeze({ mediaId: body.media_id, operation: 'CREATE' as const });
  }

  async updateDraft(
    mediaId: string,
    article: Readonly<WeChatDraftArticle>,
    accessToken: string,
  ): Promise<Readonly<DraftReceipt>> {
    if (mediaId.trim().length === 0) throw invalidPayload('Draft media ID is required for update.');
    await this.jsonRequest('/cgi-bin/draft/update', {
      media_id: mediaId,
      index: 0,
      articles: articlePayload(article),
    }, accessToken, 'DRAFT_UPDATE');
    return Object.freeze({ mediaId, operation: 'UPDATE' as const });
  }

  async getDraft(mediaId: string, accessToken: string): Promise<Readonly<RemoteDraft> | null> {
    try {
      const body = await this.jsonRequest('/cgi-bin/draft/get', { media_id: mediaId }, accessToken, 'DRAFT_READ');
      return this.remoteDraft(mediaId, body);
    } catch (error) {
      if (error instanceof PublicError && error.errcode === 40007) return null;
      throw error;
    }
  }

  async listRecentDrafts(
    offset: number,
    count: number,
    accessToken: string,
  ): Promise<Readonly<RemoteDraftPage>> {
    const body = await this.jsonRequest('/cgi-bin/draft/batchget', {
      offset,
      count,
      no_content: 0,
    }, accessToken, 'DRAFT_READ');
    const rawItems = Array.isArray(body.item) ? body.item : [];
    const items = rawItems.map(value => {
      const item = record(value);
      return this.remoteDraft(
        typeof item.media_id === 'string' ? item.media_id : '',
        record(item.content),
        typeof item.update_time === 'number' ? item.update_time : 0,
      );
    });
    return Object.freeze({
      totalCount: typeof body.total_count === 'number' ? body.total_count : items.length,
      itemCount: typeof body.item_count === 'number' ? body.item_count : items.length,
      items: Object.freeze(items),
    });
  }

  private async jsonRequest(
    path: string,
    json: unknown,
    accessToken: string,
    stage: WeChatStage,
  ): Promise<Record<string, unknown>> {
    return this.request({
      method: 'POST',
      url: apiUrl(path, accessToken),
      headers: { 'Content-Type': 'application/json' },
      json,
    }, stage);
  }

  private async multipartRequest(
    path: string,
    image: Readonly<UploadImage>,
    accessToken: string,
    stage: WeChatStage,
    query: Readonly<Record<string, string>> = {},
  ): Promise<Record<string, unknown>> {
    const boundary = this.boundary();
    return this.request({
      method: 'POST',
      url: apiUrl(path, accessToken, query),
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: encodeMultipart([{
        name: 'media',
        filename: image.filename,
        contentType: image.mimeType,
        data: image.bytes,
      }], boundary),
    }, stage);
  }

  private async request(request: Readonly<HttpRequest>, stage: WeChatStage): Promise<Record<string, unknown>> {
    try {
      const response = await this.http.request(request);
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`WeChat API returned HTTP ${response.status}.`);
      }
      const body = record(response.body);
      const error = apiError(body, stage);
      if (error !== null) throw error;
      return body;
    } catch (error) {
      if (error instanceof PublicError) throw error;
      const publicError = toPublicError(error, stage);
      if (stage === 'DRAFT_CREATE' || stage === 'DRAFT_UPDATE') {
        throw new PublicError({
          ...publicError,
          code: 'DRAFT_COMMIT_AMBIGUOUS',
          remoteEffect: 'UNKNOWN',
          retryable: false,
          nextAction: 'Do not retry automatically; reconcile with the WeChat draft box.',
        });
      }
      throw publicError;
    }
  }

  private remoteDraft(mediaId: string, body: Record<string, unknown>, updateTime = 0): Readonly<RemoteDraft> {
    const articles = Array.isArray(body.news_item)
      ? body.news_item.map(value => Object.freeze(record(value)))
      : [];
    return Object.freeze({
      mediaId,
      articles: Object.freeze(articles),
      updateTime: typeof body.update_time === 'number' ? body.update_time : updateTime,
    });
  }
}
