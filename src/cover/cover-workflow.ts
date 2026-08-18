import { createHash } from 'node:crypto';

import type { NoteSnapshot } from '../domain/article';
import type { RenderArtifact } from '../domain/artifact';
import type { BinaryFilePort, VaultFileRef } from '../domain/ports';
import { imageDataUrl } from '../media/image-format';
import type { FrontmatterMutationPort } from '../publish/publish-state-store';
import type { CoverGenerator } from './cover-generator';
import { CoverService } from './cover-service';
import type { CoverCandidateSource } from './cover-types';

export type PreparedCoverSource = CoverCandidateSource | 'local-file' | 'ai-generated';

export interface PreparedCover {
  source: PreparedCoverSource;
  vaultPath: string;
  mimeType: 'image/png';
  contentHash: string;
  previewDataUrl: string;
}

export interface CoverPickerOption {
  kind: 'article' | 'first-image' | 'global-default';
  label: string;
  sourcePath: string | null;
  enabled: boolean;
}

export interface CoverPickerModel {
  localOptions: readonly Readonly<CoverPickerOption>[];
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
  imageApiBaseUrl: string;
  imageApiModel: string;
}

export interface CoverWorkflowSettingsPort {
  get(): Readonly<CoverWorkflowSettings>;
}

export interface CoverSecretPort {
  get(): string | null;
  has(): boolean;
}

function option(
  kind: CoverPickerOption['kind'],
  label: string,
  sourcePath: string | null,
): Readonly<CoverPickerOption> {
  return Object.freeze({ kind, label, sourcePath, enabled: sourcePath !== null });
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
  ) {}

  model(
    snapshot: Readonly<NoteSnapshot>,
    artifact: Readonly<RenderArtifact>,
  ): Readonly<CoverPickerModel> {
    const settings = this.settings.get();
    const firstImage = artifact.assets.find(asset => asset.kind === 'local-image')?.source ?? null;
    const baseConfigured = settings.imageApiBaseUrl.trim().length > 0;
    const modelConfigured = settings.imageApiModel.trim().length > 0;
    const keyConfigured = this.secret.has();
    const aiEnabled = baseConfigured && modelConfigured && keyConfigured;
    const aiDisabledReason = aiEnabled ? null : [
      !baseConfigured ? '图片服务地址' : '',
      !modelConfigured ? '图片模型' : '',
      !keyConfigured ? '图片 API Key' : '',
    ].filter(Boolean).join('、') + '未配置';
    return Object.freeze({
      localOptions: Object.freeze([
        option('article', '文章 Frontmatter 封面', snapshot.metadata.cover),
        option('first-image', '正文首张本地图片', firstImage),
        option('global-default', '插件默认封面', settings.globalDefaultCoverPath.trim() || null),
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
    const strategy = kind === 'first-image' ? 'first-image' : kind === 'global-default' ? 'global-default' : 'article';
    const selected = this.sources.resolve(
      { strategy },
      { snapshot, artifact, globalDefaultPath: this.settings.get().globalDefaultCoverPath.trim() || null },
    );
    return this.prepareLocal(file, selected.vaultPath, selected.source);
  }

  async prepareLocal(
    file: VaultFileRef,
    sourcePath: string,
    source: Exclude<PreparedCoverSource, 'ai-generated'> = 'local-file',
  ): Promise<Readonly<PreparedCover>> {
    const linked = await this.files.resolveLink(sourcePath, file.path);
    const resolved = linked ?? sourcePath;
    const bytes = await this.files.readBinary(resolved);
    return this.processAndStore(file, bytes, source);
  }

  async prepareAi(
    file: VaultFileRef,
    artifact: Readonly<RenderArtifact>,
    signal?: AbortSignal,
  ): Promise<Readonly<PreparedCover>> {
    const apiKey = this.secret.get();
    if (apiKey === null) throw new Error('Image API key is not configured.');
    const settings = this.settings.get();
    const generated = await this.generator.generate({
      baseUrl: settings.imageApiBaseUrl,
      model: settings.imageApiModel,
      apiKey,
      title: artifact.metadata.title,
      digest: artifact.metadata.digest,
      bodyExcerpt: artifact.plainText,
      ...(signal === undefined ? {} : { signal }),
    });
    return this.processAndStore(file, generated.bytes, 'ai-generated');
  }

  async confirm(file: VaultFileRef, prepared: Readonly<PreparedCover>): Promise<void> {
    await this.frontmatter.processFrontmatter(file, value => {
      value.cover = prepared.vaultPath;
    });
  }

  private async processAndStore(
    file: VaultFileRef,
    bytes: Uint8Array,
    source: PreparedCoverSource,
  ): Promise<Readonly<PreparedCover>> {
    const processed = this.images.process(bytes);
    const contentHash = createHash('sha256').update(processed).digest('hex');
    const vaultPath = await this.storage.save(file.path, processed);
    return Object.freeze({
      source,
      vaultPath,
      mimeType: 'image/png' as const,
      contentHash,
      previewDataUrl: imageDataUrl(processed, 'image/png'),
    });
  }
}
