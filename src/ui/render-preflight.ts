import type { PreflightReport } from '../preflight/preflight-engine';

export interface PreflightPresentation {
  label: string;
  tone: 'success' | 'warning' | 'blocking';
  detailCount: number;
}

export function buildPreflightPresentation(
  report: Readonly<PreflightReport>,
): Readonly<PreflightPresentation> {
  if (report.blocking.length > 0) {
    return Object.freeze({
      label: `需要处理 · ${report.blocking.length} 项`,
      tone: 'blocking',
      detailCount: report.blocking.length + report.warnings.length,
    });
  }
  return Object.freeze({
    label: '发布检查通过',
    tone: report.warnings.length > 0 ? 'warning' : 'success',
    detailCount: report.warnings.length,
  });
}

export function renderPreflightDetails(
  container: HTMLElement,
  report: Readonly<PreflightReport>,
): void {
  container.replaceChildren();
  const items = [...report.blocking, ...report.warnings];
  if (items.length === 0) {
    const summary = createEl('p');
    summary.textContent = '当前文章可以同步到公众号草稿箱。';
    container.append(summary);
    return;
  }

  const list = createEl('ul');
  list.className = 'wechat-workbench__check-details';
  for (const item of items) {
    const row = createEl('li');
    row.dataset.code = item.code;
    row.textContent = item.message;
    list.append(row);
  }
  container.append(list);
}

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
