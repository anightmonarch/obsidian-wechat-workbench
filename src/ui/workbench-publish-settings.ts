import { WECHAT_FRONTMATTER_FIELDS } from '../publish/frontmatter-fields';
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
  coverValue.textContent = state.artifact.metadata.cover ?? '尚未选择封面';
  const choose = createEl('button');
  choose.type = 'button';
  choose.textContent = '更换封面';
  choose.dataset.testid = 'settings-cover';
  choose.addEventListener('click', actions.chooseCover);
  cover.append(coverTitle, coverValue, choose);
  container.append(cover);

  const draftId = state.snapshot.frontmatter[WECHAT_FRONTMATTER_FIELDS.draftId];
  const syncedAt = state.snapshot.frontmatter[WECHAT_FRONTMATTER_FIELDS.syncedAt];
  appendSection(container, '发布状态', [
    ['草稿关联', typeof draftId === 'string' && draftId.length > 0 ? '已关联' : '尚未关联'],
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
