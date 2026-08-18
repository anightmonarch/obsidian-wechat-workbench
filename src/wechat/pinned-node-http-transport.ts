import { Buffer } from 'node:buffer';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingHttpHeaders, IncomingMessage, ClientRequest } from 'node:http';

import { NetworkPolicy, type ValidatedTarget } from '../security/network-policy';
import type { HttpRequest, HttpResponse, HttpTransport } from './http-transport';

const CONNECT_TIMEOUT_MS = 5_000;
const READ_TIMEOUT_MS = 15_000;
const TOTAL_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

export interface TargetPolicyPort {
  resolveAndValidate(url: string): Promise<Readonly<ValidatedTarget>>;
}

export class HttpResponseTooLargeError extends Error {
  readonly code = 'HTTP_RESPONSE_TOO_LARGE';

  constructor() {
    super('HTTP response exceeds 32 MiB.');
    this.name = 'HttpResponseTooLargeError';
  }
}

function headers(input: IncomingHttpHeaders): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(input)) {
    if (typeof value === 'string') result[name.toLowerCase()] = value;
    else if (Array.isArray(value)) result[name.toLowerCase()] = value.join(', ');
  }
  return Object.freeze(result);
}

function requestBytes(request: Readonly<HttpRequest>): Uint8Array | null {
  if (request.json !== undefined) return new TextEncoder().encode(JSON.stringify(request.json));
  return request.body === undefined ? null : request.body;
}

function parsedBody(bytes: Uint8Array): unknown {
  if (bytes.byteLength === 0) return {};
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

export class PinnedNodeHttpTransport implements HttpTransport {
  constructor(
    private readonly policy: TargetPolicyPort = new NetworkPolicy(),
    private readonly maxResponseBytes = MAX_RESPONSE_BYTES,
    private readonly totalTimeoutMs = TOTAL_TIMEOUT_MS,
  ) {}

  request(request: Readonly<HttpRequest>): Promise<Readonly<HttpResponse<unknown>>> {
    return new Promise((resolve, reject) => {
      let active: ClientRequest | null = null;
      let settled = false;
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(totalTimer);
        callback();
      };
      const totalTimer = window.setTimeout(() => {
        active?.destroy(new Error('HTTP request timed out.'));
        finish(() => reject(new Error('HTTP request timed out.')));
      }, this.totalTimeoutMs);

      void this.policy.resolveAndValidate(request.url).then(target => {
        if (settled) return;
        const original = new URL(target.url);
        const body = requestBytes(request);
        const hostHeader = original.port.length > 0 ? original.host : original.hostname;
        const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
        const req = send({
          protocol: target.protocol,
          hostname: target.address,
          family: target.family,
          port: target.port,
          method: request.method,
          path: `${original.pathname}${original.search}`,
          headers: {
            Host: hostHeader,
            ...request.headers,
            ...(body === null ? {} : { 'Content-Length': String(body.byteLength) }),
          },
          ...(target.tlsServername === null ? {} : {
            servername: target.tlsServername,
            rejectUnauthorized: true,
          }),
        }, response => {
          void this.readResponse(response).then(
            value => finish(() => resolve(value)),
            error => {
              req.destroy(error instanceof Error ? error : new Error(String(error)));
              finish(() => reject(error instanceof Error ? error : new Error(String(error))));
            },
          );
        });
        active = req;
        req.once('socket', socket => {
          const connectTimer = window.setTimeout(() => {
            socket.destroy(new Error('HTTP connection timed out.'));
          }, CONNECT_TIMEOUT_MS);
          const event = target.protocol === 'https:' ? 'secureConnect' : 'connect';
          socket.once(event, () => window.clearTimeout(connectTimer));
          socket.once('close', () => window.clearTimeout(connectTimer));
        });
        req.once('error', error => finish(() => reject(error)));
        if (body !== null) req.write(Buffer.from(body));
        req.end();
      }, error => finish(() => reject(error instanceof Error ? error : new Error(String(error)))));
    });
  }

  private readResponse(response: IncomingMessage): Promise<Readonly<HttpResponse<unknown>>> {
    return new Promise((resolve, reject) => {
      const responseHeaders = headers(response.headers);
      const declared = Number(responseHeaders['content-length'] ?? 0);
      if (Number.isFinite(declared) && declared > this.maxResponseBytes) {
        const error = new HttpResponseTooLargeError();
        reject(error);
        response.destroy(error);
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.setTimeout(READ_TIMEOUT_MS, () => response.destroy(new Error('HTTP response read timed out.')));
      response.on('data', (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > this.maxResponseBytes) {
          response.destroy(new HttpResponseTooLargeError());
          return;
        }
        chunks.push(chunk);
      });
      response.once('error', reject);
      response.once('end', () => {
        try {
          resolve(Object.freeze({
            status: response.statusCode ?? 0,
            headers: responseHeaders,
            body: parsedBody(new Uint8Array(Buffer.concat(chunks))),
          }));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }
}
