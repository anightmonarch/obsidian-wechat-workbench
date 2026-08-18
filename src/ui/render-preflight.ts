import type { PreflightReport } from '../preflight/preflight-engine';

export function renderPreflight(
  container: HTMLElement,
  report: Readonly<PreflightReport>,
): void {
  container.replaceChildren();
  container.classList.toggle('is-blocking', report.blocking.length > 0);
  container.classList.toggle('has-warnings', report.blocking.length === 0 && report.warnings.length > 0);

  const summary = createDiv();
  summary.className = 'wechat-workbench__preflight-summary';
  summary.dataset.testid = 'preflight-status';
  if (report.blocking.length > 0) {
    summary.textContent = `${report.blocking.length} 个阻断项 · ${report.warnings.length} 条警告`;
  } else if (report.warnings.length > 0) {
    summary.textContent = `检查通过 · ${report.warnings.length} 条警告`;
  } else {
    summary.textContent = '发布检查通过';
  }
  container.append(summary);

  const visible = [...report.blocking, ...report.warnings];
  if (visible.length === 0) return;
  const list = createEl('ul');
  list.className = 'wechat-workbench__preflight-list';
  for (const item of visible) {
    const row = createEl('li');
    row.textContent = item.message;
    row.dataset.code = item.code;
    list.append(row);
  }
  container.append(list);
}
