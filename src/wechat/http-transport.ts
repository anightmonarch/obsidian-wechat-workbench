export type HttpMethod = 'GET' | 'POST';

export interface HttpRequest {
  method: HttpMethod;
  url: string;
  headers?: Readonly<Record<string, string>>;
  json?: unknown;
  body?: Uint8Array;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: T;
}

export interface HttpTransport {
  request(request: Readonly<HttpRequest>): Promise<Readonly<HttpResponse<unknown>>>;
}
