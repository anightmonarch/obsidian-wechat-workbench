import { WECHAT_FRONTMATTER_FIELDS } from '../publish/frontmatter-fields';
import { publishPayloadHash } from '../publish/publish-content';
import type { AssetSlot } from '../domain/artifact';
import type { WorkbenchRenderState } from './workbench-controller';
import { ArticleSettingsForm, type ArticleSettingsFormActions } from './article-settings-form';

export interface PublishSettingsActions extends ArticleSettingsFormActions {
  chooseCover?(source?: 'first-image' | 'upload' | 'ai'): void;
  useFirstImageCover?(): void;
  uploadCover?(bytes: Uint8Array): void;
  generateAiCover?(): void;
  coverAiDisabledReason?: string | null;
  resolveCoverPreview?(source: Readonly<AssetSlot> | string): Promise<string | null>;
  /**
   * 打开封面图大图预览 Modal。由宿主（workbench-view）提供，因为它持有
   * Obsidian `App` 实例。`url` 已经是 dataURL / https URL，可以直接放进 <img>。
   */
  openCoverPreview?(url: string, alt: string): void;
}

const forms = new WeakMap<HTMLElement, ArticleSettingsForm>();

export function renderPublishSettings(
  container: HTMLElement,
  state: Readonly<WorkbenchRenderState>,
  actions: Readonly<PublishSettingsActions>,
): void {
  let form = forms.get(container);
  if (form === undefined || container.dataset.wechatSettingsPath !== state.snapshot.vaultPath) {
    form?.destroy();
    container.replaceChildren();
    form = new ArticleSettingsForm(container, state, actions);
    forms.set(container, form);
    container.dataset.wechatSettingsPath = state.snapshot.vaultPath;
  } else {
    form.update(state, actions);
  }

  let cover = container.querySelector<HTMLElement>('[data-testid="settings-cover-section"]');
  if (cover === null) {
    cover = createEl('section', { cls: 'wechat-workbench__settings-section' });
    cover.dataset.testid = 'settings-cover-section';
    container.append(cover);
  }
  cover.replaceChildren();
  const coverTitle = createEl('h2');
  coverTitle.textContent = '文章封面';
  const firstImage = state.artifact.assets.find(asset => asset.kind === 'local-image') ?? null;
  const coverLayout = createDiv('wechat-workbench__cover-layout');
  const thumbnail = createDiv('wechat-workbench__cover-thumb');
  thumbnail.dataset.testid = 'settings-cover-thumbnail';
  const coverActions = createDiv('wechat-workbench__cover-actions');
  const coverAiStatus = createDiv('wechat-workbench__ai-candidates');
  coverAiStatus.dataset.testid = 'settings-cover-ai-status';
  const uploadInput = createEl('input');
  uploadInput.type = 'file';
  uploadInput.accept = 'image/png,image/jpeg,image/webp';
  uploadInput.multiple = false;
  uploadInput.hidden = true;
  uploadInput.addEventListener('change', () => {
    const selected = uploadInput.files?.[0];
    if (selected === undefined) return;
    void selected.arrayBuffer().then(bytes => {
      const value = new Uint8Array(bytes);
      if (actions.uploadCover !== undefined) actions.uploadCover(value);
      else actions.chooseCover?.('upload');
    });
  });
  for (const [label, testId, action] of [
    ['文章首图', 'settings-cover-first-image', () => actions.useFirstImageCover?.() ?? actions.chooseCover?.('first-image')],
    ['本地上传', 'settings-cover-upload', () => uploadInput.click()],
    ['智能生成', 'settings-cover-ai', () => {
      if (actions.coverAiDisabledReason !== undefined && actions.coverAiDisabledReason !== null) {
        coverAiStatus.replaceChildren(createSpan({
          cls: 'wechat-workbench__error',
          text: '图片服务未配置完整，请到插件设置检查',
        }));
        return;
      }
      coverAiStatus.replaceChildren();
      actions.generateAiCover?.() ?? actions.chooseCover?.('ai');
    }],
  ] as const) {
    const button = createEl('button', { text: label });
    button.type = 'button';
    button.dataset.testid = testId;
    button.addEventListener('click', action);
    coverActions.append(button);
  }
  coverActions.append(uploadInput);
  coverLayout.append(thumbnail, coverActions);
  cover.append(coverTitle, coverLayout, coverAiStatus);
  const coverSource = state.artifact.metadata.cover ?? firstImage;
  if (coverSource !== null && actions.resolveCoverPreview !== undefined) {
    renderCoverPreview(thumbnail, coverSource, actions.resolveCoverPreview, actions.openCoverPreview);
  } else if (coverSource === null) {
    thumbnail.append(createSpan({ text: '暂未选择封面，可本地上传或智能生成' }));
  }

  let statusSection = container.querySelector<HTMLElement>('[data-testid="settings-publish-status-section"]');
  if (statusSection === null) {
    statusSection = createEl('section', { cls: 'wechat-workbench__settings-section' });
    statusSection.dataset.testid = 'settings-publish-status-section';
    container.append(statusSection);
  }
  statusSection.replaceChildren();
  const draftId = state.snapshot.frontmatter[WECHAT_FRONTMATTER_FIELDS.draftId];
  const syncedContentHash = state.snapshot.frontmatter[WECHAT_FRONTMATTER_FIELDS.contentHash];
  const syncedThemeId = state.snapshot.frontmatter[WECHAT_FRONTMATTER_FIELDS.themeId];
  const syncedThemeVersion = state.snapshot.frontmatter[WECHAT_FRONTMATTER_FIELDS.themeVersion];
  const syncedAt = state.snapshot.frontmatter[WECHAT_FRONTMATTER_FIELDS.syncedAt];
  const associated = typeof draftId === 'string' && draftId.length > 0;
  const hasUnsyncedChanges = associated && (
    syncedContentHash !== publishPayloadHash(state.artifact)
    || syncedThemeId !== state.artifact.theme.id
    || syncedThemeVersion !== state.artifact.theme.version
  );
  appendSection(statusSection, '发布状态', [
    ['草稿关联', associated ? '已关联' : '尚未关联'],
    ['同步状态', !associated ? '尚未同步' : hasUnsyncedChanges ? '有未同步修改' : '已同步'],
    ['最近同步', typeof syncedAt === 'string' && syncedAt.length > 0 ? syncedAt : '尚未同步'],
  ]);
}

function renderCoverPreview(
  thumbnail: HTMLElement,
  source: Readonly<AssetSlot> | string,
  resolve: (source: Readonly<AssetSlot> | string) => Promise<string | null>,
  openPreview: ((url: string, alt: string) => void) | undefined,
): void {
  const requestId = typeof source === 'string'
    ? `explicit:${source}`
    : `${source.id}:${source.contentHash ?? ''}`;
  thumbnail.dataset.coverPreviewRequest = requestId;
  thumbnail.replaceChildren(createSpan({ text: '正在加载首图…' }));
  // 等待预览 URL 期间禁用点击，避免误触空状态。
  delete thumbnail.dataset.previewUrl;
  void resolve(source).then(dataUrl => {
    if (thumbnail.dataset.coverPreviewRequest !== requestId) return;
    if (dataUrl === null) {
      thumbnail.replaceChildren(createSpan({ text: '首图暂不可预览' }));
      return;
    }
    const image = createEl('img');
    image.dataset.testid = 'settings-cover-preview';
    image.src = dataUrl;
    image.alt = '文章首图预览';
    thumbnail.replaceChildren(image);
    // 写入 previewUrl 后，CSS 选择器会启用 cursor: zoom-in；
    // 同时为整张缩略图注册 click / keydown 监听，避免只点图片中空白处无效。
    thumbnail.dataset.previewUrl = dataUrl;
    if (openPreview !== undefined) {
      thumbnail.addEventListener('click', () => openPreview(dataUrl, '文章首图预览'));
      thumbnail.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openPreview(dataUrl, '文章首图预览');
        }
      });
      thumbnail.tabIndex = 0;
      thumbnail.setAttribute('role', 'button');
      thumbnail.setAttribute('aria-label', '点击预览文章封面');
    }
  }).catch(() => {
    if (thumbnail.dataset.coverPreviewRequest === requestId) {
      thumbnail.replaceChildren(createSpan({ text: '首图暂不可预览' }));
    }
  });
}

function appendSection(
  container: HTMLElement,
  title: string,
  rows: ReadonlyArray<readonly [string, string]>,
): void {
  const heading = createEl('h2');
  heading.textContent = title;
  container.append(heading);
  for (const [label, value] of rows) {
    const row = createDiv();
    row.className = 'wechat-workbench__setting-row';
    const name = createSpan();
    name.textContent = label;
    const content = createEl('strong');
    content.textContent = value;
    row.append(name, content);
    container.append(row);
  }
}
