import type { HttpTransport } from '../wechat/http-transport';

export interface AiModelCatalogPort {
  list(baseUrl: string, apiKey: string): Promise<readonly string[]>;
}

function catalogUrl(baseUrl: string): string {
  return new URL('models', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

function modelIds(body: unknown): readonly string[] {
  const root = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
  const data = Array.isArray(root.data) ? root.data : [];
  return Object.freeze(data.flatMap(item => {
    const record = typeof item === 'object' && item !== null ? item as Record<string, unknown> : null;
    const id = typeof record?.id === 'string' ? record.id.trim() : '';
    return id.length > 0 ? [id] : [];
  }).slice(0, 100));
}

export class OpenAiModelCatalog implements AiModelCatalogPort {
  constructor(private readonly http: HttpTransport) {}

  async list(baseUrl: string, apiKey: string): Promise<readonly string[]> {
    const response = await this.http.request({
      method: 'GET',
      url: catalogUrl(baseUrl),
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`模型列表请求失败（HTTP ${response.status}）。`);
    return modelIds(response.body);
  }
}
