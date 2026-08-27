import { type App, Modal, Notice } from 'obsidian';

import type {
  CoverPickerModel,
  CoverPickerOption,
  PreparedCover,
} from '../cover/cover-workflow';

export type { CoverPickerModel } from '../cover/cover-workflow';

export interface CoverPickerPorts {
  prepareSelection(option: Readonly<CoverPickerOption>): Promise<Readonly<PreparedCover>>;
  prepareUpload(bytes: Uint8Array): Promise<Readonly<PreparedCover>>;
  generateAi(supplementalPrompt: string): Promise<Readonly<PreparedCover>>;
  confirm(prepared: Readonly<PreparedCover>): Promise<void>;
}

export class CoverPickerError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'CoverPickerError';
  }
}

function aiFailureMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    && typeof error.code === 'string' ? error.code : null;
  switch (code) {
    case 'IMAGE_PROVIDER_REJECTED':
      return '图片服务拒绝请求，请检查 Base URL、模型名称或服务商要求。';
    case 'IMAGE_PROVIDER_TIMEOUT':
      return '图片服务响应超时，请稍后重试。';
    case 'IMAGE_PROVIDER_CONNECTION_RESET':
      return '图片服务连接被中断，请检查本机代理稳定性后重试。';
    case 'IMAGE_PROVIDER_OUTPUT_INVALID':
      return '图片服务返回格式不支持，请确认服务支持 url 或 b64_json 图像输出。';
    case 'IMAGE_PROVIDER_MODEL_MISSING':
    case 'IMAGE_PROVIDER_KEY_MISSING':
      return '图片服务配置不完整，请补充模型名称和 API Key。';
    default:
      return '图片服务请求失败，请检查网络或 Endpoint 后重试。';
  }
}

export class CoverPickerSession {
  readonly options: readonly Readonly<CoverPickerOption>[];
  selected: Readonly<PreparedCover> | null = null;
  errorCode: string | null = null;
  errorMessage: string | null = null;
  busy = false;
  private supplementalPrompt = '';

  constructor(
    readonly model: Readonly<CoverPickerModel>,
    private readonly ports: CoverPickerPorts,
  ) {
    this.options = model.options;
  }

  async selectLocal(kind: CoverPickerOption['kind']): Promise<void> {
    const option = this.options.find(item => item.kind === kind);
    if (option === undefined || !option.enabled) {
      throw new CoverPickerError('COVER_SOURCE_UNAVAILABLE', '这个封面来源暂时不可用。');
    }
    this.supplementalPrompt = '';
    await this.runPrepare(() => this.ports.prepareSelection(option));
  }

  async selectUpload(bytes: Uint8Array | null): Promise<void> {
    if (bytes === null) return;
    this.supplementalPrompt = '';
    await this.runPrepare(() => this.ports.prepareUpload(bytes));
  }

  setSupplementalPrompt(value: string): void {
    this.supplementalPrompt = value.trim();
  }

  async generateAi(prompt = this.supplementalPrompt): Promise<void> {
    if (this.busy) throw new CoverPickerError('COVER_OPERATION_IN_PROGRESS', '封面正在处理中，请稍候。');
    this.busy = true;
    this.errorCode = null;
    this.errorMessage = null;
    try {
      this.supplementalPrompt = prompt.trim();
      this.selected = await this.ports.generateAi(this.supplementalPrompt);
    } catch (error) {
      if (error instanceof CoverPickerError && error.code === 'AI_COVER_CANCELLED') return;
      this.errorCode = 'AI_COVER_GENERATION_FAILED';
      this.errorMessage = aiFailureMessage(error);
    } finally {
      this.busy = false;
    }
  }

  async confirm(): Promise<void> {
    if (this.busy || this.selected === null) {
      throw new CoverPickerError('COVER_CONFIRMATION_REQUIRED', '请先选择并预览一个封面。');
    }
    await this.ports.confirm(this.selected);
  }

  private async runPrepare(action: () => Promise<Readonly<PreparedCover>>): Promise<void> {
    if (this.busy) throw new CoverPickerError('COVER_OPERATION_IN_PROGRESS', '封面正在处理中，请稍候。');
    this.busy = true;
    this.errorCode = null;
    this.errorMessage = null;
    try {
      this.selected = await action();
    } finally {
      this.busy = false;
    }
  }
}

export class CoverPickerModal extends Modal {
  constructor(app: App, private readonly session: CoverPickerSession) { super(app); }

  onOpen(): void { this.render(); }

  private render(): void {
    this.contentEl.replaceChildren();
    this.titleEl.textContent = '选择文章封面';
    const sources = createDiv('wechat-workbench__cover-options wechat-workbench__cover-source-card');
    sources.append(createEl('strong', { text: '文章首图（默认）' }));
    for (const option of this.session.options) {
      if (option.kind === 'upload' || option.kind === 'ai') continue;
      const button = createEl('button', { text: option.label });
      button.disabled = !option.enabled || this.session.busy;
      button.addEventListener('click', () => void this.run(async () => {
        await this.session.selectLocal(option.kind);
      }));
      sources.append(button);
    }

    const uploadOption = this.session.options.find(option => option.kind === 'upload');
    const local = createDiv('wechat-workbench__cover-local wechat-workbench__cover-source-card');
    local.append(createEl('strong', { text: uploadOption?.label ?? '上传本地图片' }));
    const input = createEl('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.multiple = false;
    input.hidden = true;
    const choose = createEl('button', { text: '使用本地图片' });
    choose.disabled = this.session.busy;
    choose.addEventListener('click', () => {
      if (!this.session.busy) input.click();
    });
    input.addEventListener('change', () => void this.run(async () => {
      const selected = input.files?.[0];
      if (selected === undefined) return;
      const bytes = new Uint8Array(await selected.arrayBuffer());
      await this.session.selectUpload(bytes);
    }));
    local.append(input, choose);

    const aiOption = this.session.options.find(option => option.kind === 'ai');
    const aiCard = createDiv('wechat-workbench__cover-source-card');
    aiCard.append(createEl('strong', { text: 'AI 生成封面' }), createEl('p', { text: '生成一张候选图，采用前不会替换当前封面。' }));
    const ai = createEl('button', { cls: 'mod-cta', text: aiOption?.label ?? '生成智能封面' });
    ai.disabled = !this.session.model.aiEnabled || this.session.busy;
    ai.title = this.session.model.aiDisabledReason ?? '';
    ai.addEventListener('click', () => void this.run(async () => {
      await this.session.generateAi();
      if (this.session.errorMessage !== null) throw new Error(this.session.errorMessage);
    }));

    aiCard.append(ai);
    const picker = createDiv('wechat-workbench__cover-picker-grid');
    picker.append(sources, local, aiCard);
    this.contentEl.append(picker);
    if (this.session.selected !== null) {
      const previewPanel = createDiv('wechat-workbench__cover-candidate-preview');
      const preview = createEl('img');
      preview.className = 'wechat-workbench__cover-preview';
      preview.src = this.session.selected.previewDataUrl;
      preview.alt = '2.35:1 封面裁剪预览';
      previewPanel.append(preview, createEl('p', { text: '封面预览已准备' }));
      if (this.session.selected.source === 'ai-generated') {
        const regenerate = createEl('button', { text: '重新生成' });
        regenerate.disabled = this.session.busy;
        regenerate.addEventListener('click', () => void this.run(async () => {
          await this.session.generateAi();
        }));
        previewPanel.append(regenerate);
      }
      this.contentEl.append(previewPanel);
    }
    if (this.session.errorMessage !== null) {
      this.contentEl.append(createEl('p', { cls: 'wechat-workbench__error', text: this.session.errorMessage }));
    }
    const actions = createDiv('modal-button-container');
    const cancel = createEl('button', { text: '取消' });
    cancel.addEventListener('click', () => this.close());
    const confirm = createEl('button', { cls: 'mod-cta', text: '确认使用此封面' });
    confirm.disabled = this.session.selected === null || this.session.busy;
    confirm.addEventListener('click', () => void this.run(async () => {
      await this.session.confirm();
      this.close();
    }));
    actions.append(cancel, confirm);
    this.contentEl.append(actions);
  }

  private async run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      new Notice(error instanceof CoverPickerError ? error.message : '封面操作失败，请检查图片文件后再试。');
    } finally {
      this.render();
    }
  }
}
