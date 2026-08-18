import type { HttpRequest, HttpResponse, HttpTransport } from './http-transport';

export class HttpTimeoutError extends Error {
  readonly code = 'HTTP_REQUEST_TIMEOUT';

  constructor() {
    super('HTTP request timed out.');
    this.name = 'HttpTimeoutError';
  }
}

export class TimeoutHttpTransport implements HttpTransport {
  constructor(private readonly inner: HttpTransport, private readonly timeoutMs = 30_000) {}

  request(request: Readonly<HttpRequest>): Promise<Readonly<HttpResponse<unknown>>> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new HttpTimeoutError());
      }, this.timeoutMs);
      void this.inner.request(request).then(response => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(response);
      }, error => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }
}
