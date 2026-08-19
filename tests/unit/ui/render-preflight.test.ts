import { describe, expect, it } from 'vitest';

import {
  buildPreflightPresentation,
  renderPreflightDetails,
} from '../../../src/ui/render-preflight';

describe('compact preflight presentation', () => {
  it('hides non-blocking warning text from the default status line', () => {
    const view = buildPreflightPresentation({
      ok: true,
      blocking: [],
      warnings: [{
        code: 'DIGEST_EMPTY',
        severity: 'WARNING',
        message: 'Digest is empty.',
        source: null,
      }],
      info: [],
    });

    expect(view).toMatchObject({
      label: '发布检查通过',
      tone: 'warning',
      detailCount: 1,
    });
    expect(view.label).not.toContain('Digest');
  });

  it('uses a blocking summary and renders detail rows only on demand', () => {
    const report = {
      ok: false,
      blocking: [{
        code: 'TITLE_EMPTY',
        severity: 'BLOCKING' as const,
        message: 'Title is empty.',
        source: null,
      }],
      warnings: [],
      info: [],
    };

    expect(buildPreflightPresentation(report).label).toBe('需要处理 · 1 项');

    const host = document.createElement('div');
    renderPreflightDetails(host, report);

    expect(host.textContent).toContain('Title is empty.');
    expect(host.querySelector('[data-code="TITLE_EMPTY"]')).not.toBeNull();
  });
});
