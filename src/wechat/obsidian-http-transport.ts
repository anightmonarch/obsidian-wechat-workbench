import { requestUrl } from 'obsidian';

import type { HttpRequest, HttpResponse, HttpTransport } from './http-transport';

function requestBody(request: Readonly<HttpRequest>): string | ArrayBuffer | undefined {
  if (request.json !== undefined) return JSON.stringify(request.json);
  if (request.body === undefined) return undefined;
  return request.body.buffer.slice(
    request.body.byteOffset,
    request.body.byteOffset + request.body.byteLength,
  );
}

function responseBody(text: string): unknown {
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export class ObsidianHttpTransport implements HttpTransport {
  constructor(private readonly send: typeof requestUrl = requestUrl) {}

  async request(request: Readonly<HttpRequest>): Promise<Readonly<HttpResponse<unknown>>> {
    const response = await this.send({
      url: request.url,
      method: request.method,
      headers: { ...request.headers },
      body: requestBody(request),
      throw: false,
    });
    return Object.freeze({
      status: response.status,
      headers: Object.freeze({ ...response.headers }),
      body: responseBody(response.text),
    });
  }
}
