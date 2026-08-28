import { type App, Modal } from 'obsidian';

import type { PreparedCover } from '../cover/cover-workflow';
import type { AiProviderId, AiRequestFormat } from '../settings/model';
import {
  COVER_PROMPT_PRESETS,
  DEFAULT_COVER_PROMPT_PRESET_ID,
} from '../cover/cover-prompt-presets';

export interface AiCoverSource {
  title: string;
  digest: string;
  supplementalPrompt?: string;
}

export interface AiCoverProviderSettings {
  provider: AiProviderId;
  requestFormat: Extract<AiRequestFormat, 'agnes-images' | 'openai-images'>;
  endpoint: string;
  model: string;
}

export interface AiCoverDisclosure {
  provider: string;
  endpoint: string;
  model: string;
  sentFields: readonly string[];
  payload: Readonly<{ title: string; digest: string; supplementalPrompt: string }>;
  costNotice: string;
}

export interface AiCoverGenerationSelection {
  supplementalPrompt: string;
  includeTitle: boolean;
  includeDigest: boolean;
  presetId: string;
}

function supplemental(value: string | undefined): string {
  const sanitized = [...(value ?? '')].map(character => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 8 || code === 11 || code === 12 || code >= 14 && code <= 31 || code === 127
      ? ' '
      : character;
  }).join('').trim();
  return [...sanitized].slice(0, 500).join('');
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
}

export function aiCoverFailureMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === 'IMAGE_PROVIDER_KEY_MISSING') {
    return '请先在插件设置中保存当前图片供应商的 API Key。';
  }
  if (code === 'IMAGE_PROVIDER_AUTH_REJECTED') {
    return '图片服务拒绝鉴权，请检查当前供应商的 API Key。';
  }
  if (code === 'IMAGE_PROVIDER_RATE_LIMITED') {
    return '图片服务请求过于频繁，请稍后手动重试。';
  }
  if (code === 'IMAGE_PROVIDER_REJECTED') {
    return '图片服务拒绝当前模型或请求参数，请检查模型权限、账户额度和模型名称。';
  }
  if (code === 'IMAGE_PROVIDER_TIMEOUT') {
    return '图片服务响应超时，请手动重试。';
  }
  if (code === 'IMAGE_PROVIDER_CONNECTION_RESET' || code === 'IMAGE_PROVIDER_REQUEST_FAILED') {
    return '图片服务连接失败，请检查网络或代理后手动重试。';
  }
  if (code === 'IMAGE_PROVIDER_RESPONSE_TOO_LARGE') {
    return '图片服务响应超过安全上限，请更换模型后重试。';
  }
  if (code === 'IMAGE_PROVIDER_OUTPUT_INVALID') {
    return '图片服务返回的结果格式不兼容，请更换模型或联系供应商。';
  }
  if (code === 'REMOTE_IMAGE_TIMEOUT') {
    return '图片已生成，但下载生成结果超时，请手动重试。';
  }
  if (code.startsWith('REMOTE_')) {
    return '图片已生成，但生成结果无法安全下载，请手动重试或更换模型。';
  }
  return '智能封面生成失败，请检查图片服务配置后重试。';
}

export function buildAiCoverDisclosure(
  source: Readonly<AiCoverSource>,
  settings: Readonly<AiCoverProviderSettings>,
): Readonly<AiCoverDisclosure> {
  const supplementalPrompt = supplemental(source.supplementalPrompt);
  return Object.freeze({
    provider: settings.provider === 'agnes' ? 'Agnes' : 'DeepSeek',
    endpoint: settings.endpoint.trim(),
    model: settings.model.trim(),
    sentFields: Object.freeze([
      'title', 'digest',
      ...(supplementalPrompt.length > 0 ? ['supplementalPrompt'] : []),
    ]),
    payload: Object.freeze({
      title: source.title,
      digest: source.digest,
      supplementalPrompt,
    }),
    costNotice: '此次请求将发送给第三方图片服务，可能产生第三方费用。',
  });
}

export class AiCoverConfirmationModal extends Modal {
  private decided = false;
  private busy = false;
  private candidate: Readonly<PreparedCover> | null = null;
  private error: string | null = null;
  private supplementalPrompt: string;
  private includeTitle = false;
  private includeDigest = false;
  private presetId = DEFAULT_COVER_PROMPT_PRESET_ID;

  constructor(
    app: App,
    private readonly disclosure: Readonly<AiCoverDisclosure>,
    private readonly generate: (selection: Readonly<AiCoverGenerationSelection>) => Promise<Readonly<PreparedCover>>,
    private readonly adopt: (prepared: Readonly<PreparedCover>) => Promise<void>,
    private readonly cancel: () => void = () => undefined,
  ) {
    super(app);
    this.supplementalPrompt = disclosure.payload.supplementalPrompt;
  }

  onOpen(): void {
    this.contentEl.replaceChildren();
    this.titleEl.textContent = '生成智能封面';
    const configRow = createDiv('wechat-workbench__cover-generation-config');
    const inclusion = createDiv('wechat-workbench__cover-content-options');
    inclusion.append(createSpan({ text: '封面图是否包含' }));
    const inclusionChoices = createDiv('wechat-workbench__cover-content-choices');
    const title = createEl('label');
    const titleInput = createEl('input');
    titleInput.type = 'checkbox';
    titleInput.checked = this.includeTitle;
    titleInput.dataset.testid = 'ai-cover-include-title';
    title.append(titleInput, document.createTextNode(' 标题'));
    const digest = createEl('label');
    const digestInput = createEl('input');
    digestInput.type = 'checkbox';
    digestInput.checked = this.includeDigest;
    digestInput.dataset.testid = 'ai-cover-include-digest';
    digest.append(digestInput, document.createTextNode(' 摘要'));
    inclusionChoices.append(title, digest);
    inclusion.append(inclusionChoices);
    const presetLabel = createEl('label', { text: '封面主题' });
    presetLabel.className = 'wechat-workbench__cover-prompt-label';
    const preset = createEl('select');
    preset.dataset.testid = 'ai-cover-preset';
    for (const item of COVER_PROMPT_PRESETS) {
      const option = createEl('option', { text: item.name });
      option.value = item.id;
      preset.append(option);
    }
    preset.value = this.presetId;
    preset.addEventListener('change', () => { this.presetId = preset.value; });
    presetLabel.append(preset);
    configRow.append(presetLabel, inclusion);
    this.contentEl.append(configRow);
    const promptLabel = createEl('label', { text: '补充封面要求（可选）' });
    promptLabel.className = 'wechat-workbench__cover-prompt-label';
    const prompt = createEl('textarea');
    prompt.dataset.testid = 'ai-cover-supplemental-prompt';
    prompt.placeholder = '例如：科技感、极简、暖色调；留空则完全依据文章内容生成';
    prompt.maxLength = 500;
    prompt.value = this.supplementalPrompt;
    prompt.addEventListener('input', () => { this.supplementalPrompt = prompt.value; });
    promptLabel.append(prompt);
    this.contentEl.append(promptLabel);
    if (this.candidate !== null) {
      const preview = createEl('img');
      preview.className = 'wechat-workbench__cover-preview';
      preview.src = this.candidate.previewDataUrl;
      preview.alt = '智能生成封面预览';
      this.contentEl.append(preview);
    }
    if (this.error !== null) {
      this.contentEl.append(createEl('p', { cls: 'wechat-workbench__error', text: this.error }));
    }
    const actions = createDiv('modal-button-container');
    const cancel = createEl('button', { text: '取消' });
    cancel.disabled = this.busy;
    cancel.addEventListener('click', () => this.close());
    actions.append(cancel);
    if (this.candidate === null) {
      const generate = createEl('button', { cls: 'mod-cta', text: this.busy ? '正在生成…' : '生成' });
      generate.disabled = this.busy;
      generate.addEventListener('click', () => {
        this.includeTitle = titleInput.checked;
        this.includeDigest = digestInput.checked;
        this.supplementalPrompt = prompt.value;
        this.presetId = preset.value;
        void this.runGeneration();
      });
      actions.append(generate);
    } else {
      const regenerate = createEl('button', { text: '重新生成' });
      regenerate.disabled = this.busy;
      regenerate.addEventListener('click', () => void this.runGeneration());
      const adopt = createEl('button', { cls: 'mod-cta', text: this.busy ? '正在采用…' : '采用' });
      adopt.disabled = this.busy;
      adopt.addEventListener('click', () => void this.runAdopt());
      actions.append(regenerate, adopt);
    }
    this.contentEl.append(actions);
  }

  private async runGeneration(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    this.onOpen();
    try {
      this.candidate = await this.generate({
        supplementalPrompt: supplemental(this.supplementalPrompt),
        includeTitle: this.includeTitle,
        includeDigest: this.includeDigest,
        presetId: this.presetId,
      });
    } catch (error) {
      this.error = aiCoverFailureMessage(error);
    } finally {
      this.busy = false;
      this.onOpen();
    }
  }

  private async runAdopt(): Promise<void> {
    if (this.busy || this.candidate === null) return;
    this.busy = true;
    this.error = null;
    this.onOpen();
    try {
      await this.adopt(this.candidate);
      this.decided = true;
      this.close();
    } catch {
      this.error = '封面采用失败，请确认当前文章仍可编辑。';
      this.busy = false;
      this.onOpen();
    }
  }

  onClose(): void {
    if (this.decided) return;
    this.decided = true;
    this.cancel();
  }
}
