import { type App, Modal, Notice } from 'obsidian';

import type {
  CoverPickerModel,
  CoverPickerOption,
  PreparedCover,
} from '../cover/cover-workflow';

export type { CoverPickerModel } from '../cover/cover-workflow';

export interface CoverPickerPorts {
  prepareLocal(option: Readonly<CoverPickerOption> | string): Promise<Readonly<PreparedCover>>;
  generateAi(): Promise<Readonly<PreparedCover>>;
  confirm(prepared: Readonly<PreparedCover>): Promise<void>;
}

export class CoverPickerError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'CoverPickerError';
  }
}

export class CoverPickerSession {
  readonly options: readonly Readonly<CoverPickerOption>[];
  selected: Readonly<PreparedCover> | null = null;
  errorCode: string | null = null;
  errorMessage: string | null = null;
  busy = false;

  constructor(
    readonly model: Readonly<CoverPickerModel>,
    private readonly ports: CoverPickerPorts,
  ) {
    this.options = model.localOptions;
  }

  async selectLocal(kind: CoverPickerOption['kind']): Promise<void> {
    const option = this.options.find(item => item.kind === kind);
    if (option === undefined || !option.enabled || option.sourcePath === null) {
      throw new CoverPickerError('COVER_SOURCE_UNAVAILABLE', 'The selected cover source is unavailable.');
    }
    await this.prepare(option);
  }

  async selectVaultPath(path: string): Promise<void> {
    if (path.trim().length === 0) throw new CoverPickerError('COVER_PATH_EMPTY', 'Vault image path is empty.');
    await this.prepare(path.trim());
  }

  async generateAi(): Promise<void> {
    if (this.busy) throw new CoverPickerError('COVER_OPERATION_IN_PROGRESS', 'A cover operation is already in progress.');
    this.busy = true;
    this.errorCode = null;
    this.errorMessage = null;
    try {
      this.selected = await this.ports.generateAi();
    } catch (error) {
      this.selected = null;
      this.errorCode = 'AI_COVER_GENERATION_FAILED';
      this.errorMessage = error instanceof Error ? error.message : 'AI cover generation failed.';
    } finally {
      this.busy = false;
    }
  }

  async confirm(): Promise<void> {
    if (this.busy || this.selected === null) {
      throw new CoverPickerError('COVER_CONFIRMATION_REQUIRED', 'Select and preview a cover before confirming.');
    }
    await this.ports.confirm(this.selected);
  }

  private async prepare(input: Readonly<CoverPickerOption> | string): Promise<void> {
    if (this.busy) throw new CoverPickerError('COVER_OPERATION_IN_PROGRESS', 'A cover operation is already in progress.');
    this.busy = true;
    this.errorCode = null;
    this.errorMessage = null;
    try {
      this.selected = await this.ports.prepareLocal(input);
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
    const sources = createDiv('wechat-workbench__cover-options');
    for (const option of this.session.options) {
      const button = createEl('button', { text: option.label });
      button.disabled = !option.enabled || this.session.busy;
      button.addEventListener('click', () => void this.run(async () => {
        await this.session.selectLocal(option.kind);
      }));
      sources.append(button);
    }

    const local = createDiv('wechat-workbench__cover-local');
    const input = createEl('input');
    input.type = 'text';
    input.placeholder = 'Vault 内图片路径，例如 assets/cover.png';
    const choose = createEl('button', { text: '使用本地图片' });
    choose.disabled = this.session.busy;
    choose.addEventListener('click', () => void this.run(async () => {
      await this.session.selectVaultPath(input.value);
    }));
    local.append(input, choose);

    const ai = createEl('button', { text: '生成智能封面' });
    ai.disabled = !this.session.model.aiEnabled || this.session.busy;
    ai.title = this.session.model.aiDisabledReason ?? '';
    ai.addEventListener('click', () => void this.run(async () => {
      await this.session.generateAi();
      if (this.session.errorMessage !== null) throw new Error(this.session.errorMessage);
    }));

    this.contentEl.append(sources, local, ai);
    if (this.session.selected !== null) {
      const preview = createEl('img');
      preview.className = 'wechat-workbench__cover-preview';
      preview.src = this.session.selected.previewDataUrl;
      preview.alt = '2.35:1 封面裁剪预览';
      this.contentEl.append(preview, createEl('p', { text: this.session.selected.vaultPath }));
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
      new Notice(error instanceof Error ? error.message : '封面操作失败');
    } finally {
      this.render();
    }
  }
}
