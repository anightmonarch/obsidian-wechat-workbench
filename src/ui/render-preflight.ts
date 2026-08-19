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
