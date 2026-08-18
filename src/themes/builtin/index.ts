import { createHash } from 'node:crypto';

import type { ThemeDefinition, ThemeManifest } from '../../domain/theme';
import { EDITORIAL_CSS, EDITORIAL_MANIFEST } from './editorial';
import { NATIVE_CSS, NATIVE_MANIFEST } from './native';
import { TECHNICAL_CSS, TECHNICAL_MANIFEST } from './technical';
import { VERDANT_CSS, VERDANT_MANIFEST } from './verdant';

function builtinTheme(manifest: ThemeManifest, css: string): ThemeDefinition {
  return Object.freeze({
    manifest: Object.freeze({ ...manifest }),
    css,
    contentHash: createHash('sha256').update(JSON.stringify(manifest)).update(css).digest('hex'),
    source: 'builtin',
    previewPath: null,
  });
}

export const BUILTIN_THEMES: readonly ThemeDefinition[] = Object.freeze([
  builtinTheme(EDITORIAL_MANIFEST, EDITORIAL_CSS),
  builtinTheme(NATIVE_MANIFEST, NATIVE_CSS),
  builtinTheme(TECHNICAL_MANIFEST, TECHNICAL_CSS),
  builtinTheme(VERDANT_MANIFEST, VERDANT_CSS),
]);
