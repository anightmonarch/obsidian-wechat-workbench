import { WECHAT_FRONTMATTER_FIELDS } from '../publish/frontmatter-fields';
import { publishPayloadHash } from '../publish/publish-content';
import type { WorkbenchRenderState } from './workbench-controller';

export interface PublishSettingsActions {
  chooseCover(): void;
}

export function renderPublishSettings(
  container: HTMLElement,
  state: Readonly<WorkbenchRenderState>,
  actions: Readonly<PublishSettingsActions>,
): void {
  container.replaceChildren();
  appendSection(container, '文章信息', [
    ['标题', state.artifact.metadata.title],
    ['作者', state.artifact.metadata.author || '未设置'],
    ['摘要', state.artifact.metadata.digest || '未设置'],
    ['原文链接', state.artifact.metadata.contentSourceUrl || '未设置'],
  ]);

  const cover = createEl('section');
  cover.className = 'wechat-workbench__settings-section';
  const coverTitle = createEl('h2');
  coverTitle.textContent = '文章封面';
  const coverValue = createEl('p');
  coverValue.textContent = state.artifact.metadata.cover === null ? '尚未选择封面' : '已选择封面';
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
