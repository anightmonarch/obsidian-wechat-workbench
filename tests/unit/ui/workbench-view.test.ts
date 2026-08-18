import { describe, expect, it } from 'vitest';

import { WeChatWorkbenchView } from '../../../src/ui/workbench-view';

describe('WeChatWorkbenchView', () => {
  it('renders the approved empty workbench shell without editable article content', async () => {
    const view = new WeChatWorkbenchView({} as never);

    await view.onOpen();

    expect(view.contentEl.querySelector('[data-testid="workbench-title"]')?.textContent)
      .toBe('WeChat Workbench');
    expect(view.contentEl.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(view.contentEl.querySelector('[data-testid="workbench-empty"]')?.textContent)
      .toBe('打开一篇 Markdown 笔记开始预览');
    expect(view.contentEl.querySelectorAll('button:disabled')).toHaveLength(3);
  });
});
