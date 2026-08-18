import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { clearTimeout as cancelTimer, setTimeout as scheduleTimer } from 'node:timers';

import { detectImageMime, type SupportedImageMime } from '../media/image-format';
import { NetworkPolicy, NetworkPolicyError, type ValidatedTarget } from './network-policy';

const MAX_REDIRECTS = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const CONNECT_TIMEOUT_MS = 5_000;
const READ_TIMEOUT_MS = 15_000;
const TOTAL_TIMEOUT_MS = 20_000;

export interface PinnedHttpResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
}

export interface PinnedHttpTransport {
  request(target: Readonly<ValidatedTarget>, timeoutMs?: number): Promise<Readonly<PinnedHttpResponse>>;
}

export interface ValidatedImage {
  sourceUrl: string;
  finalUrl: string;
  mimeType: SupportedImageMime;
  bytes: Uint8Array;
  contentHash: string;
}

export class RemoteImageError extends Error {
  constructor(readonly code: string, message: string, readonly source: string | null) {
    super(message);
    this.name = 'RemoteImageError';
  }
}

function headerMap(headers: IncomingHttpHeaders): Readonly<Record<string, string>> {
  const mapped: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === 'string') mapped[name.toLowerCase()] = value;
    else if (Array.isArray(value)) mapped[name.toLowerCase()] = value.join(', ');
  }
  return Object.freeze(mapped);
}

function readResponse(response: IncomingMessage): Promise<Readonly<PinnedHttpResponse>> {
  return new Promise((resolve, reject) => {
    const headers = headerMap(response.headers);
    const declared = Number(headers['content-length'] ?? 0);
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      response.destroy(new RemoteImageError('REMOTE_IMAGE_TOO_LARGE', 'Remote image exceeds 10 MiB.', null));
      reject(new RemoteImageError('REMOTE_IMAGE_TOO_LARGE', 'Remote image exceeds 10 MiB.', null));
      return;
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    response.setTimeout(READ_TIMEOUT_MS, () => {
      response.destroy(new Error('Remote image read timed out.'));
    });
    response.on('data', (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_BYTES) {
        response.destroy(new RemoteImageError('REMOTE_IMAGE_TOO_LARGE', 'Remote image exceeds 10 MiB.', null));
        return;
      }
      chunks.push(new Uint8Array(chunk));
    });
    response.on('end', () => resolve(Object.freeze({
      status: response.statusCode ?? 0,
      headers,
      body: new Uint8Array(Buffer.concat(chunks.map(chunk => Buffer.from(chunk)))),
    })));
    response.on('error', reject);
  });
}

export class NodePinnedHttpTransport implements PinnedHttpTransport {
  async request(
    target: Readonly<ValidatedTarget>,
    timeoutMs = TOTAL_TIMEOUT_MS,
  ): Promise<Readonly<PinnedHttpResponse>> {
    return new Promise((resolve, reject) => {
      const original = new URL(target.url);
      const hostHeader = original.port.length > 0 ? original.host : original.hostname;
      const options = {
        protocol: target.protocol,
        hostname: target.address,
        family: target.family,
        port: target.port,
        method: 'GET',
        path: `${original.pathname}${original.search}`,
        headers: { Host: hostHeader, Accept: 'image/png,image/jpeg,image/gif,image/webp' },
        ...(target.tlsServername === null ? {} : { servername: target.tlsServername, rejectUnauthorized: true }),
      };
      const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
      const req = request(options, response => {
        void readResponse(response).then(resolve, reject);
      });
      const totalTimer = scheduleTimer(() => {
        req.destroy(new Error('Remote image request timed out.'));
      }, timeoutMs);
      req.once('close', () => cancelTimer(totalTimer));
      req.once('socket', socket => {
        const connectTimer = scheduleTimer(() => {
          socket.destroy(new Error('Remote image connection timed out.'));
        }, CONNECT_TIMEOUT_MS);
        const event = target.protocol === 'https:' ? 'secureConnect' : 'connect';
        socket.once(event, () => cancelTimer(connectTimer));
        socket.once('close', () => cancelTimer(connectTimer));
      });
      req.once('error', reject);
      req.end();
    });
  }
}

function failure(code: string, message: string, source: string | null): never {
  throw new RemoteImageError(code, message, source);
}

function expectedMime(value: string | undefined): SupportedImageMime | null {
  const mime = value?.split(';', 1)[0]?.trim().toLowerCase();
  return mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/gif' || mime === 'image/webp'
    ? mime
    : null;
}

export class RemoteImageFetcher {
  constructor(
    private readonly policy: NetworkPolicy = new NetworkPolicy(),
    private readonly transport: PinnedHttpTransport = new NodePinnedHttpTransport(),
  ) {}

  async fetch(sourceUrl: string): Promise<Readonly<ValidatedImage>> {
    const deadline = Date.now() + TOTAL_TIMEOUT_MS;
    let current = sourceUrl;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      let protocol: string;
      try { protocol = new URL(current).protocol; } catch {
        return failure('REMOTE_IMAGE_URL_INVALID', 'Remote image URL is invalid.', current);
      }
      if (protocol !== 'https:') {
        return failure(
          redirects > 0 ? 'REMOTE_REDIRECT_BLOCKED' : 'REMOTE_IMAGE_INSECURE',
          'Remote images and redirects must use HTTPS.',
          current,
        );
      }
      let target: Readonly<ValidatedTarget>;
      try {
        target = await this.beforeDeadline(this.policy.resolveAndValidate(current), deadline);
      } catch (error) {
        if (redirects > 0 && error instanceof NetworkPolicyError) {
          return failure('REMOTE_REDIRECT_BLOCKED', 'Remote image redirect target is blocked.', current);
        }
        throw error;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) return failure('REMOTE_IMAGE_TIMEOUT', 'Remote image request timed out.', current);
      const response = await this.beforeDeadline(this.transport.request(target, remaining), deadline);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.location;
        if (location === undefined) return failure('REMOTE_REDIRECT_INVALID', 'Remote redirect has no location.', current);
        if (redirects === MAX_REDIRECTS) {
          return failure('REMOTE_REDIRECT_LIMIT', 'Remote image exceeded three redirects.', current);
        }
        current = new URL(location, target.url).toString();
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        return failure('REMOTE_IMAGE_HTTP_ERROR', `Remote image returned HTTP ${response.status}.`, current);
      }
      const declaredLength = Number(response.headers['content-length'] ?? 0);
      if ((Number.isFinite(declaredLength) && declaredLength > MAX_BYTES)
        || response.body.byteLength > MAX_BYTES) {
        return failure('REMOTE_IMAGE_TOO_LARGE', 'Remote image exceeds 10 MiB.', current);
      }
      const headerMime = expectedMime(response.headers['content-type']);
      const detectedMime = detectImageMime(response.body);
      if (headerMime === null || detectedMime === null || headerMime !== detectedMime) {
        return failure('REMOTE_IMAGE_TYPE_MISMATCH', 'Remote image MIME type does not match its bytes.', current);
      }
      return Object.freeze({
        sourceUrl,
        finalUrl: target.url,
        mimeType: detectedMime,
        bytes: response.body,
        contentHash: createHash('sha256').update(response.body).digest('hex'),
      });
    }
    return failure('REMOTE_REDIRECT_LIMIT', 'Remote image exceeded three redirects.', current);
  }

  private async beforeDeadline<T>(operation: Promise<T>, deadline: number): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return failure('REMOTE_IMAGE_TIMEOUT', 'Remote image request timed out.', null);
    return new Promise<T>((resolve, reject) => {
      const timer = scheduleTimer(() => reject(new RemoteImageError(
        'REMOTE_IMAGE_TIMEOUT', 'Remote image request timed out.', null,
      )), remaining);
      void operation.then(value => {
        cancelTimer(timer);
        resolve(value);
      }, error => {
        cancelTimer(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }
}
