import type { EditableArticleSettings } from '../domain/article';
import { WECHAT_FRONTMATTER_FIELDS } from '../publish/frontmatter-fields';
import { publishPayloadHash } from '../publish/publish-content';
import type { WorkbenchRenderState } from './workbench-controller';

export interface PublishSettingsActions {
  chooseCover(): void;
  saveArticle(settings: Readonly<EditableArticleSettings>): Promise<void>;
}

export function renderPublishSettings(
  container: HTMLElement,
  state: Readonly<WorkbenchRenderState>,
  actions: Readonly<PublishSettingsActions>,
): void {
  container.replaceChildren();
  appendArticleEditor(container, state, actions);

  const cover = createEl('section');
  cover.className = 'wechat-workbench__settings-section';
  const coverTitle = createEl('h2');
  coverTitle.textContent = '文章封面';
  const coverValue = createEl('p');
  coverValue.textContent = state.artifact.metadata.cover === null
    ? state.artifact.assets.some(asset => asset.kind === 'local-image' || asset.kind === 'remote-image')
      ? '文章首图（默认）'
      : '文章没有可用首图'
    : '已选择封面';
  coverValue.dataset.testid = 'settings-cover-value';
  const choose = createEl('button');
  choose.type = 'button';
  choose.textContent = '更换封面';
  choose.dataset.testid = 'settings-cover';
  choose.addEventListener('click', actions.chooseCover);
  cover.append(coverTitle, coverValue, choose);
  container.append(cover);

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
  appendSection(container, '发布状态', [
    ['草稿关联', associated ? '已关联' : '尚未关联'],
    ['同步状态', !associated ? '尚未同步' : hasUnsyncedChanges ? '有未同步修改' : '已同步'],
    ['最近同步', typeof syncedAt === 'string' && syncedAt.length > 0 ? syncedAt : '尚未同步'],
  ]);
}

function appendArticleEditor(
  container: HTMLElement,
  state: Readonly<WorkbenchRenderState>,
  actions: Readonly<PublishSettingsActions>,
): void {
  const section = createEl('section');
  section.className = 'wechat-workbench__settings-section';
  const heading = createEl('h2');
  heading.textContent = '文章信息';
  section.append(heading);

  const title = editableInput(
    section, '标题', 'settings-title', frontmatterString(state, 'title'),
    currentPlaceholder(state.artifact.metadata.title),
  );
  title.maxLength = 64;
  const author = editableInput(
    section, '作者', 'settings-author', frontmatterString(state, 'author'),
    currentPlaceholder(state.artifact.metadata.author),
  );
  author.maxLength = 8;
  const digest = editableTextarea(
    section, '摘要', 'settings-digest', frontmatterString(state, 'digest'),
    currentPlaceholder(state.artifact.metadata.digest),
  );
  digest.maxLength = 120;
  const actionsRow = createDiv('wechat-workbench__settings-actions');
  const save = createEl('button');
  save.type = 'button';
  save.className = 'mod-cta';
  save.textContent = '保存文章信息';
  save.dataset.testid = 'settings-save';
  save.addEventListener('click', () => {
    save.disabled = true;
    void actions.saveArticle({
      title: title.value,
      author: author.value,
      digest: digest.value,
      contentSourceUrl: frontmatterString(state, 'content_source_url'),
    }).finally(() => {
      save.disabled = false;
    });
  });
  actionsRow.append(save);
  section.append(actionsRow);
  container.append(section);
}

function frontmatterString(state: Readonly<WorkbenchRenderState>, field: string): string {
  const value = state.snapshot.frontmatter[field];
  return typeof value === 'string' ? value : '';
}

function currentPlaceholder(value: string): string {
  return value.length > 0 ? `当前：${value}` : '未设置';
}

function editableInput(
  container: HTMLElement,
  label: string,
  testId: string,
  value: string,
  placeholder: string,
): HTMLInputElement {
  const field = createEl('label');
  field.className = 'wechat-workbench__setting-field';
  const name = createSpan();
  name.textContent = label;
  const input = createEl('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  input.dataset.testid = testId;
  field.append(name, input);
  container.append(field);
  return input;
}

function editableTextarea(
  container: HTMLElement,
  label: string,
  testId: string,
  value: string,
  placeholder: string,
): HTMLTextAreaElement {
  const field = createEl('label');
  field.className = 'wechat-workbench__setting-field';
  const name = createSpan();
  name.textContent = label;
  const input = createEl('textarea');
  input.rows = 3;
  input.value = value;
  input.placeholder = placeholder;
  input.dataset.testid = testId;
  field.append(name, input);
  container.append(field);
  return input;
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
