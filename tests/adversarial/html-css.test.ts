import { describe, expect, it } from 'vitest';

import { markdownToSafeHtml } from '../../src/render/markdown-pipeline';
import { validateThemePack } from '../../src/themes/theme-validator';

const manifest = Object.freeze({
  id: 'attack-theme', name: 'Attack theme', version: '1.0.0', author: 'Test', description: 'Test',
});

describe('adversarial HTML and CSS corpus', () => {
  it('removes active HTML, event handlers, and dangerous link protocols', async () => {
    const html = await markdownToSafeHtml([
      '<script>globalThis.compromised = true</script>',
      '<img src=x onerror="globalThis.compromised=true">',
      '[run](javascript:alert(1))',
      '[data](data:text/html,attack)',
      '![remote](https://example.test/image.png)',
    ].join('\n\n'));

    expect(html).not.toMatch(/script|onerror|javascript:|data:text/iu);
    expect(html).not.toContain(' src=');
    expect(html).toContain('data-asset-source="https://example.test/image.png"');
  });

  it.each([
    '@import url("https://attacker.test/theme.css");',
    'body { color: red; }',
    '.wechat-article { background-image: url(https://attacker.test/pixel); }',
    '.wechat-article { position: fixed; }',
    '.wechat-article::before { content: "spoof"; }',
    '@keyframes steal { from { opacity: 0 } to { opacity: 1 } }',
  ])('rejects theme escape: %s', css => {
    const result = validateThemePack(manifest, css);

    expect(result.ok).toBe(false);
    expect(result.css).toBe('');
    expect(result.diagnostics[0]?.code).toBe('THEME_CSS_UNSAFE');
  });
});
