import { createHash } from 'node:crypto';
import { posix } from 'node:path';

import type { Diagnostic } from '../domain/artifact';
import type { ThemeDefinition, ThemeManifest } from '../domain/theme';
import { validateThemePack, type ThemeValidationResult } from './theme-validator';

export interface ThemeSourcePort {
  listDirectories(root: string): Promise<string[]>;
  readText(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
}

export interface ThemeReloadResult {
  ok: boolean;
  diagnostics: readonly Diagnostic[];
}

function definition(
  manifest: ThemeManifest,
  css: string,
  previewPath: string | null,
): ThemeDefinition {
  return Object.freeze({
    manifest: Object.freeze({ ...manifest }),
    css,
    contentHash: createHash('sha256').update(JSON.stringify(manifest)).update(css).digest('hex'),
    source: 'vault',
    previewPath,
  });
}

function parseManifest(value: string): ThemeManifest {
  const parsed = JSON.parse(value) as Partial<ThemeManifest>;
  return {
    id: typeof parsed.id === 'string' ? parsed.id : '',
    name: typeof parsed.name === 'string' ? parsed.name : '',
    version: typeof parsed.version === 'string' ? parsed.version : '',
    author: typeof parsed.author === 'string' ? parsed.author : '',
    description: typeof parsed.description === 'string' ? parsed.description : '',
  };
}

export class ThemeRegistry {
  private readonly themes = new Map<string, ThemeDefinition>();

  constructor(
    private readonly builtins: readonly ThemeDefinition[],
    private readonly source: ThemeSourcePort,
  ) {}

  async load(root: string): Promise<void> {
    this.themes.clear();
    for (const theme of this.builtins) this.themes.set(theme.manifest.id, theme);

    const directories = await this.source.listDirectories(root);
    for (const directory of [...directories].sort()) {
      const loaded = await this.loadDirectory(posix.join(root, directory));
      if (loaded.theme !== null && !this.themes.has(loaded.theme.manifest.id)) {
        this.themes.set(loaded.theme.manifest.id, loaded.theme);
      }
    }
  }

  get(id: string): ThemeDefinition | undefined {
    return this.themes.get(id);
  }

  list(): readonly ThemeDefinition[] {
    return Object.freeze([...this.themes.values()].sort((left, right) => (
      left.manifest.id.localeCompare(right.manifest.id)
    )));
  }

  async reloadChanged(directory: string): Promise<ThemeReloadResult> {
    const loaded = await this.loadDirectory(directory);
    if (loaded.theme === null) {
      return { ok: false, diagnostics: loaded.validation.diagnostics };
    }
    if (this.builtins.some(theme => theme.manifest.id === loaded.theme?.manifest.id)) {
      return {
        ok: false,
        diagnostics: Object.freeze([{
          code: 'THEME_ID_CONFLICT',
          severity: 'BLOCKING',
          message: `Custom theme id conflicts with built-in theme: ${loaded.theme.manifest.id}`,
          source: directory,
        }]),
      };
    }
    this.themes.set(loaded.theme.manifest.id, loaded.theme);
    return { ok: true, diagnostics: Object.freeze([]) };
  }

  private async loadDirectory(directory: string): Promise<{
    theme: ThemeDefinition | null;
    validation: ThemeValidationResult;
  }> {
    try {
      const manifestPath = posix.join(directory, 'manifest.json');
      const cssPath = posix.join(directory, 'theme.css');
      const manifest = parseManifest(await this.source.readText(manifestPath));
      const validation = validateThemePack(manifest, await this.source.readText(cssPath));
      if (!validation.ok) return { theme: null, validation };
      const previewPath = posix.join(directory, 'preview.png');
      return {
        theme: definition(
          manifest,
          validation.css,
          await this.source.exists(previewPath) ? previewPath : null,
        ),
        validation,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown theme loading error.';
      return {
        theme: null,
        validation: {
          ok: false,
          css: '',
          diagnostics: Object.freeze([{
            code: 'THEME_LOAD_FAILED',
            severity: 'BLOCKING',
            message,
            source: directory,
          }]),
        },
      };
    }
  }
}
