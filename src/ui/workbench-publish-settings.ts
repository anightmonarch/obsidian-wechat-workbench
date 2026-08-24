import { WECHAT_FRONTMATTER_FIELDS } from '../publish/frontmatter-fields';
import { publishPayloadHash } from '../publish/publish-content';
import type { AssetSlot } from '../domain/artifact';
import type { WorkbenchRenderState } from './workbench-controller';
import { ArticleSettingsForm, type ArticleSettingsFormActions } from './article-settings-form';

export interface PublishSettingsActions extends ArticleSettingsFormActions {
  chooseCover(): void;
  resolveCoverPreview?(asset: Readonly<AssetSlot>): Promise<string | null>;
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
  const coverMeta = createDiv('wechat-workbench__cover-meta');
  const coverValue = createEl('strong');
  coverValue.textContent = state.artifact.metadata.cover === null
    ? firstImage === null ? '文章中没有可用图片' : '自动使用文章首图'
    : '已选择封面';
  coverValue.dataset.testid = 'settings-cover-value';
  const description = createEl('p', { text: state.artifact.metadata.cover === null
    ? '正文图片变化时自动跟随；推荐尺寸 2.35:1'
    : '当前使用显式封面；可随时恢复文章首图。' });
  const choose = createEl('button');
  choose.type = 'button';
  choose.textContent = '更换封面';
  choose.dataset.testid = 'settings-cover';
  choose.addEventListener('click', actions.chooseCover);
  coverMeta.append(coverValue, description, choose);
  coverLayout.append(thumbnail, coverMeta);
  cover.append(coverTitle, coverLayout);
  if (firstImage !== null && actions.resolveCoverPreview !== undefined) {
    renderCoverPreview(thumbnail, firstImage, actions.resolveCoverPreview);
  } else if (firstImage === null) {
    thumbnail.append(createSpan({ text: '文章中没有可用图片' }));
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
  asset: Readonly<AssetSlot>,
  resolve: (asset: Readonly<AssetSlot>) => Promise<string | null>,
): void {
  const requestId = `${asset.id}:${asset.contentHash ?? ''}`;
  thumbnail.dataset.coverPreviewRequest = requestId;
  thumbnail.replaceChildren(createSpan({ text: '正在加载首图…' }));
  void resolve(asset).then(dataUrl => {
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
  const section = createEl('section');
  section.className = 'wechat-workbench__settings-section';
  const heading = createEl('h2');
  heading.textContent = title;
  section.append(heading);
  for (const [label, value] of rows) {
    const row = createDiv();
    row.className = 'wechat-workbench__setting-row';
    const name = createSpan();
    name.textContent = label;
    const content = createEl('strong');
    content.textContent = value;
    row.append(name, content);
    section.append(row);
  }
  container.append(section);
}
