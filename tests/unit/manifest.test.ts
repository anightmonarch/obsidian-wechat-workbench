import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('manifest', () => {
  it('uses the approved public identity and compatibility floor', () => {
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')) as Record<string, unknown>;

    expect(manifest).toMatchObject({
      id: 'wechat-workbench',
      name: 'WeChat Workbench',
      minAppVersion: '1.11.4',
      isDesktopOnly: true,
    });
    expect(manifest.id).not.toContain('obsidian');
  });

  it('does not expose direct filesystem access in the release bundle', () => {
    const bundle = readFileSync('main.js', 'utf8');

    expect(bundle).not.toMatch(/require\(["'](?:node:)?fs["']\)/u);
  });
});
