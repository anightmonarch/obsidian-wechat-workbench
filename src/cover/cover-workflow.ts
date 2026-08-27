import { createHash } from 'node:crypto';

import { aiSecretKind } from '../settings/ai-service-settings';
import { resolveAiService, type AiProviderSettings } from '../settings/model';
import { posix } from 'node:path';

import type { NoteSnapshot } from '../domain/article';
import type { RenderArtifact } from '../domain/artifact';
import type { BinaryFilePort, VaultFileRef } from '../domain/ports';
import { detectImageMime, imageDataUrl, type SupportedImageMime } from '../media/image-format';
import type { FrontmatterMutationPort } from '../publish/publish-state-store';
import { publishPayloadHash } from '../publish/publish-content';
import type { CoverGenerator } from './cover-generator';
import { CoverService } from './cover-service';
import type { RemoteGeneratedImagePort } from './openai-image-generator';

export type PreparedCoverSource =
  | 'dynamic-first-image'
  | 'local-upload'
  | 'ai-generated';

export type VisibleCoverKind = 'first-image' | 'upload' | 'ai';

export interface PreparedCover {
  source: PreparedCoverSource;
  persistence: 'CLEAR_EXPLICIT_COVER' | 'SET_EXPLICIT_COVER';
  notePath: string;
  contextHash: string;
  vaultPath: string | null;
  mimeType: 'image/png';
  contentHash: string;
  previewDataUrl: string;
  bytes?: Uint8Array;
}

export interface CoverPickerOption {
  kind: VisibleCoverKind;
  label: string;
  sourcePath: string | null;
  enabled: boolean;
  disabledReason?: string | null;
}

export interface CoverPickerModel {
  options: readonly Readonly<CoverPickerOption>[];
  aiEnabled: boolean;
  aiDisabledReason: string | null;
}

export interface CoverImageProcessorPort {
  process(bytes: Uint8Array): Uint8Array;
}

export interface GeneratedCoverStoragePort {
  save(notePath: string, bytes: Uint8Array): Promise<string>;
}

export interface CoverWorkflowSettings {
  globalDefaultCoverPath: string;
  aiProviders?: Readonly<AiProviderSettings>;
  /** @deprecated schema v4 compatibility during migration. */
  imageApiProtocol?: 'openai-compatible' | 'anthropic';
  /** @deprecated schema v4 compatibility during migration. */
  imageApiEndpoint?: string;
  /** @deprecated schema v4 compatibility during migration. */
  imageApiModel?: string;
}

export interface PreparedPublishCover {
  source: 'explicit' | 'first-local-image' | 'first-remote-image';
  vaultPath: string;
  bytes: Uint8Array;
  mimeType: SupportedImageMime;
  contentHash: string;
}

export interface PublishCoverResolverPort {
  prepareForPublish(
    file: VaultFileRef,
    artifact: Readonly<RenderArtifact>,
  ): Promise<Readonly<PreparedPublishCover>>;
}

export interface CoverWorkflowSettingsPort {
  get(): Readonly<CoverWorkflowSettings>;
}

export interface CoverSecretPort {
  get(kind?: 'imageAgnesApiKey' | 'imageDeepseekApiKey'): string | null;
  has(kind?: 'imageAgnesApiKey' | 'imageDeepseekApiKey'): boolean;
}

export class CoverPathError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'CoverPathError';
  }
}

function imageService(settings: Readonly<CoverWorkflowSettings>): Readonly<{
  provider: 'agnes' | 'deepseek';
  requestFormat: 'agnes-images' | 'openai-images';
  endpoint: string;
  model: string;
}> | null {
  if (settings.aiProviders !== undefined) {
    const resolved = resolveAiService({ aiProviders: settings.aiProviders }, 'image');
    if (resolved === null || (resolved.requestFormat !== 'agnes-images' && resolved.requestFormat !== 'openai-images')) return null;
    return Object.freeze({
      provider: resolved.provider,
      requestFormat: resolved.requestFormat,
      endpoint: resolved.endpoint,
      model: resolved.model,
    });
  }
  if (settings.imageApiProtocol === 'anthropic' || !settings.imageApiEndpoint || !settings.imageApiModel) return null;
  return Object.freeze({ provider: 'agnes', requestFormat: 'agnes-images', endpoint: settings.imageApiEndpoint, model: settings.imageApiModel });
}

function safeVaultPath(value: string): string {
  let decoded = value.trim().replaceAll('\\', '/');
    try { decoded = decodeURI(decoded); } catch { throw new CoverPathError('COVER_PATH_ENCODING_INVALID', 'Cover path encoding is invalid.'); }
  if (decoded.length === 0 || decoded.includes('\0') || decoded.startsWith('/')
    || /^[a-z][a-z0-9+.-]*:/iu.test(decoded)
    || decoded.split('/').includes('..')) {
    throw new CoverPathError('COVER_PATH_UNSAFE', 'Cover path must stay inside the current Vault.');
  }
  const normalized = posix.normalize(decoded).replace(/^\.\//u, '');
  if (normalized === '.' || normalized.startsWith('../')) {
    throw new CoverPathError('COVER_PATH_UNSAFE', 'Cover path must stay inside the current Vault.');
  }
  if (normalized.split('/').includes('..')) {
    throw new CoverPathError('COVER_PATH_UNSAFE', 'Cover path must stay inside the current Vault.');
  }
  return normalized;
}

function option(
  kind: CoverPickerOption['kind'],
  label: string,
  sourcePath: string | null,
): Readonly<CoverPickerOption> {
  return Object.freeze({ kind, label, sourcePath, enabled: kind === 'upload' || sourcePath !== null });
}

export class CoverWorkflow {
  private readonly sources = new CoverService();

  constructor(
    private readonly files: BinaryFilePort,
    private readonly images: CoverImageProcessorPort,
    private readonly storage: GeneratedCoverStoragePort,
    private readonly generator: CoverGenerator,
    private readonly frontmatter: FrontmatterMutationPort,
  private readonly settings: CoverWorkflowSettingsPort,
    private readonly secret: CoverSecretPort,
    private readonly remoteImages: RemoteGeneratedImagePort,
  ) {}

  model(
    snapshot: Readonly<NoteSnapshot>,
    artifact: Readonly<RenderArtifact>,
  ): Readonly<CoverPickerModel> {
    const settings = this.settings.get();
    const service = imageService(settings);
    const firstImage = this.sources.firstImage(artifact)?.source ?? null;
    const keyConfigured = service !== null && this.secret.has(
      settings.aiProviders === undefined ? undefined : aiSecretKind('image', service.provider),
    );
    const aiEnabled = service !== null && keyConfigured;
    const aiDisabledReason = aiEnabled ? null : settings.aiProviders === undefined && settings.imageApiProtocol === 'anthropic'
      ? 'Anthropic 当前只支持封面策划，未提供图片输出。'
      : service === null
      ? '当前图片模型未配置'
      : '当前图片模型的 API Key 未配置';
    return Object.freeze({
      options: Object.freeze([
        option('first-image', '文章首图（默认）', firstImage),
        option('upload', '上传本地图片', null),
        Object.freeze({
          kind: 'ai',
          label: '智能生成封面',
          sourcePath: service?.model ?? null,
          enabled: aiEnabled,
          disabledReason: aiDisabledReason,
        }),
      ]),
      aiEnabled,
      aiDisabledReason,
    });
  }

  async prepareSelection(
    file: VaultFileRef,
    snapshot: Readonly<NoteSnapshot>,
    artifact: Readonly<RenderArtifact>,
    kind: CoverPickerOption['kind'],
  ): Promise<Readonly<PreparedCover>> {
    if (kind === 'first-image') return this.prepareFirstImage(file, artifact);
    if (kind === 'upload') {
    throw new CoverPathError('COVER_UPLOAD_REQUIRES_BYTES', '上传封面需要先选择本地图片文件。');
    }
    return this.prepareAi(file, artifact);
  }

  async prepareFirstImage(
    file: VaultFileRef,
    artifact: Readonly<RenderArtifact>,
  ): Promise<Readonly<PreparedCover>> {
    const first = this.sources.firstImage(artifact);
    if (first === null) {
      return Object.freeze({
        source: 'dynamic-first-image' as const,
        persistence: 'CLEAR_EXPLICIT_COVER' as const,
        notePath: file.path,
        contextHash: publishPayloadHash(artifact),
        vaultPath: null,
        mimeType: 'image/png' as const,
        contentHash: createHash('sha256').update(`empty-cover:${publishPayloadHash(artifact)}`).digest('hex'),
        previewDataUrl: '',
      });
    }
    const fetched = first.vaultPath.startsWith('https://')
      ? await this.remoteImages.fetch(first.vaultPath)
      : await this.readLocalImage(file, first.vaultPath);
    const bytes = 'bytes' in fetched ? new Uint8Array(fetched.bytes) : fetched;
    return this.processAndPrepare(
      file,
      bytes,
      'dynamic-first-image',
      publishPayloadHash(artifact),
      'CLEAR_EXPLICIT_COVER',
    );
  }

  async prepareUpload(
    file: VaultFileRef,
    bytes: Uint8Array,
    contextHash: string,
  ): Promise<Readonly<PreparedCover>> {
    if (bytes.byteLength === 0) throw new CoverPathError('COVER_UPLOAD_EMPTY', '上传的封面是空的。');
    if (detectImageMime(bytes) === null) {
      throw new CoverPathError('COVER_UPLOAD_UNSUPPORTED', '上传的封面不是支持的图片格式。');
    }
    return this.processAndPrepare(file, bytes, 'local-upload', contextHash);
  }

  private async readLocalImage(file: VaultFileRef, source: string): Promise<Uint8Array> {
    const requested = safeVaultPath(source);
    const linked = await this.files.resolveLink(requested, file.path);
    const resolved = safeVaultPath(linked ?? requested);
    return this.files.readBinary(resolved);
  }

  private async processAndPrepare(
    file: VaultFileRef,
    bytes: Uint8Array,
    source: PreparedCoverSource,
    contextHash: string,
    persistence: PreparedCover['persistence'] = 'SET_EXPLICIT_COVER',
  ): Promise<Readonly<PreparedCover>> {
    if (persistence === 'CLEAR_EXPLICIT_COVER') {
      const processed = this.images.process(bytes);
      const contentHash = createHash('sha256').update(processed).digest('hex');
      return Object.freeze({
        source,
        persistence,
        notePath: file.path,
        contextHash,
        vaultPath: null,
        mimeType: 'image/png' as const,
        contentHash,
        previewDataUrl: imageDataUrl(processed, 'image/png'),
        bytes: Uint8Array.from(processed),
      });
    }
    const processed = this.images.process(bytes);
    const contentHash = createHash('sha256').update(processed).digest('hex');
    return Object.freeze({
      source,
      persistence,
      notePath: file.path,
      contextHash,
      vaultPath: null,
      mimeType: 'image/png' as const,
      contentHash,
      previewDataUrl: imageDataUrl(processed, 'image/png'),
      bytes: Uint8Array.from(processed),
    });
  }

  async prepareAi(
    file: VaultFileRef,
    artifact: Readonly<RenderArtifact>,
    supplementalPrompt = '',
    selection: Readonly<{ includeTitle: boolean; includeDigest: boolean; presetId?: string }> = {
      includeTitle: true,
      includeDigest: true,
    },
    signal?: AbortSignal,
  ): Promise<Readonly<PreparedCover>> {
    const settings = this.settings.get();
    const service = imageService(settings);
    if (settings.aiProviders === undefined && settings.imageApiProtocol === 'anthropic') {
      const error = new Error('Anthropic 当前只支持封面策划，未提供图片输出。') as Error & { code?: string };
      error.code = 'AI_PROVIDER_IMAGE_UNSUPPORTED';
      throw error;
    }
    if (service === null) throw new Error('图片模型尚未配置。');
    if (service.requestFormat !== 'agnes-images' && service.requestFormat !== 'openai-images') {
      throw new Error('当前图片服务请求格式不受支持。');
    }
    const apiKey = this.secret.get(
      settings.aiProviders === undefined ? undefined : aiSecretKind('image', service.provider),
    );
    if (apiKey === null) throw new Error('Image API key is not configured.');
    const title = selection.includeTitle ? artifact.metadata.title : '';
    const digest = selection.includeDigest ? artifact.metadata.digest : '';
    const generated = await this.generator.generate({
      provider: service.provider,
      requestFormat: service.requestFormat,
      endpoint: service.endpoint,
      model: service.model,
      apiKey,
      title,
      digest,
      supplementalPrompt,
      presetId: selection.presetId,
      ...(signal === undefined ? {} : { signal }),
    });
    return this.processAndPrepare(file, generated.bytes, 'ai-generated', publishPayloadHash(artifact));
  }

  async confirm(file: VaultFileRef, prepared: Readonly<PreparedCover>): Promise<void> {
    if (prepared.notePath !== file.path) {
      throw new CoverPathError('COVER_NOTE_CHANGED', 'Prepared cover belongs to a different note.');
    }
    let vaultPath = prepared.vaultPath;
    if (prepared.persistence === 'SET_EXPLICIT_COVER' && vaultPath === null) {
      if (prepared.bytes === undefined || prepared.bytes.byteLength === 0) {
        throw new CoverPathError('COVER_BYTES_MISSING', '确认封面缺少图片内容。');
      }
      vaultPath = await this.storage.save(file.path, prepared.bytes);
    }
    await this.frontmatter.processFrontmatter(file, value => {
      if (prepared.persistence === 'CLEAR_EXPLICIT_COVER') delete value.cover;
      else if (vaultPath !== null) value.cover = vaultPath;
      else throw new CoverPathError('COVER_PATH_MISSING', '确认封面缺少 Vault 路径。');
    });
  }

  async prepareForPublish(
    file: VaultFileRef,
    artifact: Readonly<RenderArtifact>,
  ): Promise<Readonly<PreparedPublishCover>> {
    const explicitCover = artifact.metadata.cover;
    if (explicitCover !== null) {
      const requested = safeVaultPath(explicitCover);
      const linked = await this.files.resolveLink(requested, file.path);
      const vaultPath = safeVaultPath(linked ?? requested);
      return this.publishableImage(vaultPath, 'explicit', await this.files.readBinary(vaultPath));
    }

    const first = this.sources.firstImage(artifact);
    if (first === null) throw new CoverPathError('COVER_FIRST_IMAGE_MISSING', '文章没有可用首图。');
    if (first.source === 'first-remote-image') {
      const fetched = await this.remoteImages.fetch(first.vaultPath);
      return this.storePublishCover(file, first.source, fetched.bytes);
    }
    const bytes = await this.readLocalImage(file, first.vaultPath);
    return this.storePublishCover(file, 'first-local-image', bytes);
  }

  private async storePublishCover(
    file: VaultFileRef,
    source: PreparedPublishCover['source'],
    bytes: Uint8Array,
  ): Promise<Readonly<PreparedPublishCover>> {
    const processed = this.images.process(bytes);
    const contentHash = createHash('sha256').update(processed).digest('hex');
    const vaultPath = await this.storage.save(file.path, processed);
    return Object.freeze({
      source,
      vaultPath,
      bytes: Uint8Array.from(processed),
      mimeType: 'image/png' as const,
      contentHash,
    });
  }

  private async publishableImage(
    vaultPath: string,
    source: PreparedPublishCover['source'],
    bytes: Uint8Array,
  ): Promise<Readonly<PreparedPublishCover>> {
    const mimeType = detectImageMime(bytes);
    if (mimeType === null) {
      throw new CoverPathError('COVER_UPLOAD_UNSUPPORTED', 'Explicit cover is not a supported image.');
    }
    return Object.freeze({
      source, vaultPath, bytes: Uint8Array.from(bytes), mimeType, contentHash: createHash('sha256').update(bytes).digest('hex'),
    });
  }

}
