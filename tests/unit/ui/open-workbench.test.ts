import { describe, expect, it, vi } from 'vitest';

import {
  openWorkbench,
  WORKBENCH_VIEW_TYPE,
  type WorkbenchLeaf,
  type WorkbenchWorkspace,
} from '../../../src/ui/open-workbench';

function fakeLeaf(): WorkbenchLeaf & { setViewState: ReturnType<typeof vi.fn> } {
  return { setViewState: vi.fn(async () => undefined) };
}

function fakeWorkspace(existing: WorkbenchLeaf[] = []) {
  const rightLeaf = fakeLeaf();
  const workspace: WorkbenchWorkspace & {
    getLeavesOfType: ReturnType<typeof vi.fn>;
    getRightLeaf: ReturnType<typeof vi.fn>;
    revealLeaf: ReturnType<typeof vi.fn>;
  } = {
    getLeavesOfType: vi.fn(() => existing),
    getRightLeaf: vi.fn(() => rightLeaf),
    revealLeaf: vi.fn(async () => undefined),
  };

  return { workspace, rightLeaf };
}

describe('openWorkbench', () => {
  it('reveals the existing workbench leaf instead of creating a duplicate', async () => {
    const existing = fakeLeaf();
    const { workspace } = fakeWorkspace([existing]);

    await openWorkbench(workspace);

    expect(workspace.getLeavesOfType).toHaveBeenCalledWith(WORKBENCH_VIEW_TYPE);
    expect(workspace.getRightLeaf).not.toHaveBeenCalled();
    expect(existing.setViewState).not.toHaveBeenCalled();
    expect(workspace.revealLeaf).toHaveBeenCalledWith(existing);
  });

  it('creates and reveals one right leaf when no workbench view exists', async () => {
    const { workspace, rightLeaf } = fakeWorkspace();

    await openWorkbench(workspace);

    expect(workspace.getRightLeaf).toHaveBeenCalledWith(false);
    expect(rightLeaf.setViewState).toHaveBeenCalledWith({
      type: WORKBENCH_VIEW_TYPE,
      active: true,
    });
    expect(workspace.revealLeaf).toHaveBeenCalledWith(rightLeaf);
  });

  it('fails explicitly when Obsidian cannot allocate a right leaf', async () => {
    const { workspace } = fakeWorkspace();
    workspace.getRightLeaf.mockReturnValue(null);

    await expect(openWorkbench(workspace)).rejects.toThrow('Unable to create WeChat Workbench view');
  });
});
