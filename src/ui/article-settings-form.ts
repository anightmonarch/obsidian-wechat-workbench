import type { ArticleDraftValues, EditableArticleSettings, NoteSnapshot } from '../domain/article';
import type { RenderArtifact } from '../domain/artifact';

export interface ArticleSettingsFormState {
  snapshot: Pick<NoteSnapshot, 'frontmatter'>;
  artifact: Pick<RenderArtifact, 'metadata'>;
}

export interface ArticleSettingsFormActions {
  saveArticle(settings: Readonly<EditableArticleSettings>): Promise<void>;
  generateTitles?(draft: Readonly<ArticleDraftValues>): Promise<readonly string[]>;
  generateDigest?(draft: Readonly<ArticleDraftValues>): Promise<string>;
}

type EditableField = HTMLInputElement | HTMLTextAreaElement;

const AUTOSAVE_DELAY_MS = 500;

function frontmatterString(state: Readonly<ArticleSettingsFormState>, field: string): string {
  const value = state.snapshot.frontmatter[field];
  return typeof value === 'string' ? value : '';
}

function currentPlaceholder(value: string): string {
  return value.length > 0 ? `当前：${value}` : '未设置';
}

function editableField(
  container: HTMLElement,
  label: string,
  testId: string,
  value: string,
  placeholder: string,
  tag: 'input' | 'textarea',
): EditableField {
  const field = createEl('label', { cls: 'wechat-workbench__setting-field' });
  const name = createSpan({ text: label });
  const input = createEl(tag);
  input.value = value;
  input.placeholder = placeholder;
  input.dataset.testid = testId;
  field.append(name, input);
  container.append(field);
  return input;
}

function candidateButton(
  value: string,
  testId: string,
  attribute: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = createEl('button', { cls: 'wechat-workbench__ai-candidate', text: value });
  button.type = 'button';
  button.dataset.testid = testId;
  button.dataset[attribute] = value;
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

export class ArticleSettingsForm {
  readonly root: HTMLElement;
  private readonly title: HTMLInputElement;
  private readonly author: HTMLInputElement;
  private readonly digest: HTMLTextAreaElement;
  private readonly titleCandidates: HTMLElement;
  private readonly digestCandidate: HTMLElement;
  private readonly status: HTMLElement;
  private saveTimer: number | null = null;
  private inputRevision = 0;
  private hasPendingEdit = false;
  private titleOptions: readonly string[] = Object.freeze([]);
  private digestOption: string | null = null;
  private titleLoading = false;
  private digestLoading = false;
  private titleError: string | null = null;
  private digestError: string | null = null;
  private titleGeneration = 0;
  private digestGeneration = 0;
  private latestState: Readonly<ArticleSettingsFormState>;
  private latestActions: Readonly<ArticleSettingsFormActions>;

  constructor(
    private readonly container: HTMLElement,
    state: Readonly<ArticleSettingsFormState>,
    actions: Readonly<ArticleSettingsFormActions>,
  ) {
    this.latestState = state;
    this.latestActions = actions;
    this.root = createEl('section', { cls: 'wechat-workbench__settings-section' });
    const heading = createEl('h2', { text: '文章信息' });
    this.root.append(heading);

    const titleField = createDiv('wechat-workbench__setting-field');
    const titleHeader = createDiv('wechat-workbench__ai-field-header');
    const titleLabel = createEl('label', { text: '标题' });
    titleLabel.htmlFor = 'settings-title-input';
    titleHeader.append(titleLabel, this.aiButton(
      'settings-title-ai', '生成标题', () => { void this.generateTitles(); },
      actions.generateTitles !== undefined,
    ));
    this.title = createEl('input');
    this.title.id = 'settings-title-input';
    this.title.type = 'text';
    this.title.value = frontmatterString(state, 'title');
    this.title.placeholder = currentPlaceholder(state.artifact.metadata.title);
    this.title.maxLength = 64;
    this.title.dataset.testid = 'settings-title';
    this.titleCandidates = createDiv('wechat-workbench__ai-candidates');
    this.titleCandidates.dataset.testid = 'settings-title-candidates';
    titleField.append(titleHeader, this.title, this.titleCandidates);
    this.root.append(titleField);

    const authorField = editableField(
      this.root, '作者', 'settings-author', frontmatterString(state, 'author'),
      currentPlaceholder(state.artifact.metadata.author), 'input',
    ) as HTMLInputElement;
    authorField.maxLength = 8;
    this.author = authorField;

    const digestField = createDiv('wechat-workbench__setting-field');
    const digestHeader = createDiv('wechat-workbench__ai-field-header');
    const digestLabel = createEl('label', { text: '摘要' });
    digestLabel.htmlFor = 'settings-digest-input';
    digestHeader.append(digestLabel, this.aiButton(
      'settings-digest-ai', '生成摘要', () => { void this.generateDigest(); },
      actions.generateDigest !== undefined,
    ));
    this.digest = createEl('textarea');
    this.digest.id = 'settings-digest-input';
    this.digest.rows = 3;
    this.digest.value = frontmatterString(state, 'digest');
    this.digest.placeholder = currentPlaceholder(state.artifact.metadata.digest);
    this.digest.maxLength = 120;
    this.digest.dataset.testid = 'settings-digest';
    this.digestCandidate = createDiv('wechat-workbench__ai-candidates');
    this.digestCandidate.dataset.testid = 'settings-digest-candidates';
    digestField.append(digestHeader, this.digest, this.digestCandidate);
    this.root.append(digestField);

    this.status = createSpan({ cls: 'wechat-workbench__settings-save-status', text: '已保存' });
    this.status.dataset.testid = 'settings-save-status';
    this.root.append(this.status);
    this.container.append(this.root);

    this.title.addEventListener('input', () => this.scheduleSave());
    this.author.addEventListener('input', () => this.scheduleSave());
    this.digest.addEventListener('input', () => this.scheduleSave());
  }

  update(
    state: Readonly<ArticleSettingsFormState>,
    actions: Readonly<ArticleSettingsFormActions>,
  ): void {
    this.latestState = state;
    this.latestActions = actions;
    if (!this.hasPendingEdit) {
      this.syncField(this.title, frontmatterString(state, 'title'), state.artifact.metadata.title);
      this.syncField(this.author, frontmatterString(state, 'author'), state.artifact.metadata.author);
      this.syncField(this.digest, frontmatterString(state, 'digest'), state.artifact.metadata.digest);
    }
  }

  destroy(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.root.remove();
  }

  private syncField(field: EditableField, value: string, fallback: string): void {
    if (document.activeElement === field) return;
    field.value = value;
    field.placeholder = currentPlaceholder(fallback);
  }

  private aiButton(
    testId: string,
    label: string,
    action: () => void,
    enabled: boolean,
  ): HTMLButtonElement {
    const button = createEl('button', { cls: 'wechat-workbench__ai-trigger', text: '✦' });
    button.type = 'button';
    button.dataset.testid = testId;
    button.setAttribute('aria-label', label);
    button.title = enabled ? label : '请先在插件设置中配置文本服务';
    button.disabled = !enabled;
    button.addEventListener('click', action);
    return button;
  }

  private scheduleSave(): void {
    this.inputRevision += 1;
    this.hasPendingEdit = true;
    this.status.textContent = '待保存';
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, AUTOSAVE_DELAY_MS);
  }

  private async save(): Promise<void> {
    const revision = this.inputRevision;
    this.status.textContent = '保存中…';
    try {
      await this.latestActions.saveArticle({
        title: this.title.value,
        author: this.author.value,
        digest: this.digest.value,
        contentSourceUrl: frontmatterString(this.latestState, 'content_source_url'),
      });
      if (revision === this.inputRevision) {
        this.hasPendingEdit = false;
        this.status.textContent = '已保存';
      }
    } catch {
      if (revision === this.inputRevision) this.status.textContent = '保存失败，请修改后重试';
    }
  }

  private async generateTitles(): Promise<void> {
    const generate = this.latestActions.generateTitles;
    if (generate === undefined || this.titleLoading) return;
    const generation = ++this.titleGeneration;
    this.titleLoading = true;
    this.titleError = null;
    this.renderTitleCandidates();
    const button = this.root.querySelector<HTMLButtonElement>('[data-testid="settings-title-ai"]');
    if (button !== null) button.disabled = true;
    try {
      const values = await generate(this.draftValues());
      if (generation !== this.titleGeneration) return;
      this.titleOptions = Object.freeze(values.slice(0, 3));
      this.titleLoading = false;
      this.renderTitleCandidates();
    } catch {
      if (generation !== this.titleGeneration) return;
      this.titleLoading = false;
      this.titleError = '生成失败，请检查文本服务配置';
      this.renderTitleCandidates();
    } finally {
      if (generation === this.titleGeneration && button !== null) button.disabled = false;
    }
  }

  private renderTitleCandidates(): void {
    this.titleCandidates.replaceChildren();
    if (!this.titleLoading && this.titleOptions.length === 0 && this.titleError === null) return;
    this.titleCandidates.append(this.candidateHeader(
      'AI 标题候选 · 不会自动覆盖',
      'settings-title-regenerate',
      'settings-title-candidates-close',
      () => { void this.generateTitles(); },
      () => {
        this.titleGeneration += 1;
        this.titleOptions = Object.freeze([]);
        this.titleLoading = false;
        this.titleError = null;
        this.renderTitleCandidates();
      },
    ));
    if (this.titleLoading) {
      this.titleCandidates.append(createSpan({ text: '正在根据文章内容生成 3 个标题…' }));
    }
    if (this.titleError !== null) {
      this.titleCandidates.append(createSpan({ cls: 'wechat-workbench__error', text: this.titleError }));
    }
    if (this.titleOptions.length === 0) return;
    for (const value of this.titleOptions) {
      this.titleCandidates.append(candidateButton(
        value, 'settings-title-candidate', 'titleCandidate', () => {
          this.title.value = value;
          this.titleGeneration += 1;
          this.titleOptions = Object.freeze([]);
          this.titleLoading = false;
          this.titleError = null;
          this.renderTitleCandidates();
          this.title.dispatchEvent(new Event('input', { bubbles: true }));
        },
      ));
    }
  }

  private async generateDigest(): Promise<void> {
    const generate = this.latestActions.generateDigest;
    if (generate === undefined || this.digestLoading) return;
    const generation = ++this.digestGeneration;
    this.digestLoading = true;
    this.digestError = null;
    this.renderDigestCandidate();
    const button = this.root.querySelector<HTMLButtonElement>('[data-testid="settings-digest-ai"]');
    if (button !== null) button.disabled = true;
    try {
      const value = await generate(this.draftValues());
      if (generation !== this.digestGeneration) return;
      this.digestOption = value.trim();
      this.digestLoading = false;
      this.renderDigestCandidate();
    } catch {
      if (generation !== this.digestGeneration) return;
      this.digestLoading = false;
      this.digestError = '生成失败，请检查文本服务配置';
      this.renderDigestCandidate();
    } finally {
      if (generation === this.digestGeneration && button !== null) button.disabled = false;
    }
  }

  private renderDigestCandidate(): void {
    this.digestCandidate.replaceChildren();
    if (!this.digestLoading && (this.digestOption === null || this.digestOption.length === 0) && this.digestError === null) return;
    this.digestCandidate.append(this.candidateHeader(
      'AI 摘要候选 · 不会自动覆盖',
      'settings-digest-regenerate',
      'settings-digest-candidates-close',
      () => { void this.generateDigest(); },
      () => {
        this.digestGeneration += 1;
        this.digestOption = null;
        this.digestLoading = false;
        this.digestError = null;
        this.renderDigestCandidate();
      },
    ));
    if (this.digestLoading) {
      this.digestCandidate.append(createSpan({ text: '正在根据文章内容生成摘要…' }));
    }
    if (this.digestError !== null) {
      this.digestCandidate.append(createSpan({ cls: 'wechat-workbench__error', text: this.digestError }));
    }
    if (this.digestOption === null || this.digestOption.length === 0) return;
    this.digestCandidate.append(candidateButton(
      this.digestOption, 'settings-digest-candidate', 'digestCandidate', () => {
        this.digest.value = this.digestOption ?? '';
        this.digestGeneration += 1;
        this.digestOption = null;
        this.digestLoading = false;
        this.digestError = null;
        this.renderDigestCandidate();
        this.digest.dispatchEvent(new Event('input', { bubbles: true }));
      },
    ));
  }

  private candidateHeader(
    label: string,
    regenerateTestId: string,
    closeTestId: string,
    regenerate: () => void,
    close: () => void,
  ): HTMLElement {
    const header = createDiv('wechat-workbench__ai-candidates-head');
    header.append(createEl('strong', { text: label }));
    const actions = createDiv('wechat-workbench__ai-candidates-actions');
    const regenerateButton = createEl('button', { text: '↻' });
    regenerateButton.type = 'button';
    regenerateButton.dataset.testid = regenerateTestId;
    regenerateButton.setAttribute('aria-label', '重新生成');
    regenerateButton.title = '重新生成';
    regenerateButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      regenerate();
    });
    const closeButton = createEl('button', { text: '×' });
    closeButton.type = 'button';
    closeButton.dataset.testid = closeTestId;
    closeButton.setAttribute('aria-label', '关闭候选');
    closeButton.title = '关闭候选';
    closeButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      close();
    });
    actions.append(regenerateButton, closeButton);
    header.append(actions);
    return header;
  }

  private draftValues(): Readonly<ArticleDraftValues> {
    return Object.freeze({ title: this.title.value, author: this.author.value, digest: this.digest.value });
  }
}

export type { ArticleDraftValues };
