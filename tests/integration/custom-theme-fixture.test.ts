import { access, readFile, readdir } from 'node:fs/promises';
import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { NoteSnapshot } from '../../src/domain/article';
import { RenderArtifactBuilder } from '../../src/render/artifact-builder';
import { ThemeRegistry, type ThemeSourcePort } from '../../src/themes/theme-registry';

class FileThemeSource implements ThemeSourcePort {
  async listDirectories(root: string): Promise<string[]> {
    return (await readdir(root, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  }

  async readText(path: string): Promise<string> {
    return readFile(path, 'utf8');
  }

  async exists(path: string): Promise<boolean> {
    try { await access(path); return true; } catch { return false; }
  }
}

describe('custom theme fixture', () => {
  it('discovers, validates, and applies the versioned theme pack', async () => {
    const root = posix.join('tests', 'fixtures', 'themes');
    const registry = new ThemeRegistry([], new FileThemeSource());
    await registry.load(root);
    const theme = registry.get('sample-custom');
    if (theme === undefined) throw new Error('Sample custom theme was not loaded.');
    const snapshot: Readonly<NoteSnapshot> = Object.freeze({
      vaultPath: 'article.md', basename: 'article', modifiedAt: 1, markdown: '# Custom theme',
      frontmatter: Object.freeze({}),
      metadata: Object.freeze({ title: 'Custom theme', author: '', digest: '', cover: null, contentSourceUrl: '' }),
      selectedThemeId: 'sample-custom', sourceHash: 'source',
    });

    const artifact = await new RenderArtifactBuilder().build(snapshot, theme);

    expect(theme.manifest.version).toBe('1.0.0');
    expect(artifact.theme.id).toBe('sample-custom');
    expect(artifact.canonicalHtml).toContain('border-bottom: 2px solid #607d8b');
    expect(artifact.canonicalHtml).toContain('color: #263238');
  });
});
