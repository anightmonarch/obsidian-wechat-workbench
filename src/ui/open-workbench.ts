export const WORKBENCH_VIEW_TYPE = 'wechat-workbench-view';

export interface WorkbenchViewState {
  type: string;
  active: boolean;
}

export interface WorkbenchLeaf {
  setViewState(state: WorkbenchViewState): Promise<void>;
}

export interface WorkbenchWorkspace {
  getLeavesOfType(type: string): WorkbenchLeaf[];
  getRightLeaf(split: boolean): WorkbenchLeaf | null;
  revealLeaf(leaf: WorkbenchLeaf): Promise<void>;
}

export async function openWorkbench(workspace: WorkbenchWorkspace): Promise<void> {
  const existing = workspace.getLeavesOfType(WORKBENCH_VIEW_TYPE)[0];
  if (existing !== undefined) {
    await workspace.revealLeaf(existing);
    return;
  }

  const leaf = workspace.getRightLeaf(false);
  if (leaf === null) {
    throw new Error('Unable to create WeChat Workbench view');
  }

  await leaf.setViewState({
    type: WORKBENCH_VIEW_TYPE,
    active: true,
  });
  await workspace.revealLeaf(leaf);
}
