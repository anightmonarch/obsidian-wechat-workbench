import { createHash } from 'node:crypto';

import type { ThemeDefinition, ThemeManifest } from '../../domain/theme';
import { DOOCS_CLASSIC_CSS, DOOCS_CLASSIC_MANIFEST } from './doocs-classic';
import { DOOCS_GRACE_CSS, DOOCS_GRACE_MANIFEST } from './doocs-grace';
import { DOOCS_SIMPLE_CSS, DOOCS_SIMPLE_MANIFEST } from './doocs-simple';
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
  builtinTheme(DOOCS_CLASSIC_MANIFEST, DOOCS_CLASSIC_CSS),
  builtinTheme(DOOCS_GRACE_MANIFEST, DOOCS_GRACE_CSS),
  builtinTheme(DOOCS_SIMPLE_MANIFEST, DOOCS_SIMPLE_CSS),
  builtinTheme(EDITORIAL_MANIFEST, EDITORIAL_CSS),
  builtinTheme(NATIVE_MANIFEST, NATIVE_CSS),
  builtinTheme(TECHNICAL_MANIFEST, TECHNICAL_CSS),
  builtinTheme(VERDANT_MANIFEST, VERDANT_CSS),
]);
