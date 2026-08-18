import { describe, expect, it } from 'vitest';

import { BUILTIN_THEMES } from '../../../src/themes/builtin';
import {
  ThemeRegistry,
  type ThemeSourcePort,
} from '../../../src/themes/theme-registry';

class MemoryThemeSource implements ThemeSourcePort {
  private readonly files = new Map<string, string>();

  set(path: string, content: string): void {
    this.files.set(path, content);
  }

  async listDirectories(_root: string): Promise<string[]> {
    return ['custom-green'];
  }

  async readText(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`Missing synthetic file: ${path}`);
    return value;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
}

function validSource(): MemoryThemeSource {
  const source = new MemoryThemeSource();
  source.set('.wechat-workbench/themes/custom-green/manifest.json', JSON.stringify({
    id: 'custom-green',
    name: 'Custom green',
    version: '1.0.0',
    author: 'Test author',
    description: 'Synthetic theme.',
  }));
  source.set('.wechat-workbench/themes/custom-green/theme.css', 'h1 { color: green; }');
  return source;
}

describe('ThemeRegistry', () => {
  it('lists exactly four built-in themes in stable id order', async () => {
    const registry = new ThemeRegistry(BUILTIN_THEMES, new MemoryThemeSource());

    await registry.load('.wechat-workbench/themes');

    expect(registry.list().filter(theme => theme.source === 'builtin').map(theme => theme.manifest.id))
      .toEqual(['editorial', 'native', 'technical', 'verdant']);
  });

  it('loads a valid custom theme and returns its scoped CSS', async () => {
    const source = validSource();
    const registry = new ThemeRegistry(BUILTIN_THEMES, source);

    await registry.load('.wechat-workbench/themes');

    expect(registry.get('custom-green')).toMatchObject({
      source: 'vault',
      css: '.wechat-article h1 { color: green; }',
    });
  });

  it('keeps the last valid custom theme when a changed version is invalid', async () => {
    const source = validSource();
    const registry = new ThemeRegistry(BUILTIN_THEMES, source);
    await registry.load('.wechat-workbench/themes');
    const valid = registry.get('custom-green');
    source.set('.wechat-workbench/themes/custom-green/theme.css', '@import "https://example.test/x.css";');

    const result = await registry.reloadChanged('.wechat-workbench/themes/custom-green');

    expect(result.ok).toBe(false);
    expect(registry.get('custom-green')).toBe(valid);
  });
});
