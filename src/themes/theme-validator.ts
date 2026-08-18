import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

import type { Diagnostic } from '../domain/artifact';
import type { ThemeManifest } from '../domain/theme';

export interface ThemeValidationResult {
  ok: boolean;
  css: string;
  diagnostics: readonly Diagnostic[];
}

const MANIFEST_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SEMANTIC_VERSION = /^\d+\.\d+\.\d+$/u;
const ARTICLE_ROOT = '.wechat-article';

function blocking(code: string, message: string): Diagnostic {
  return Object.freeze({ code, severity: 'BLOCKING', message, source: null });
}

function validateManifest(manifest: ThemeManifest): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!MANIFEST_ID.test(manifest.id)) {
    diagnostics.push(blocking('THEME_ID_INVALID', 'Theme id must use lowercase letters, digits, and hyphens.'));
  }
  if (!SEMANTIC_VERSION.test(manifest.version)) {
    diagnostics.push(blocking('THEME_VERSION_INVALID', 'Theme version must use x.y.z semantic versioning.'));
  }
  for (const [field, value] of Object.entries({
    name: manifest.name,
    author: manifest.author,
    description: manifest.description,
  })) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      diagnostics.push(blocking('THEME_MANIFEST_FIELD_EMPTY', `Theme manifest field ${field} is required.`));
    }
  }
  return diagnostics;
}

function scopedSelector(selector: string): string {
  const root = selectorParser().astSync(selector);
  const scoped: string[] = [];

  for (const node of root.nodes) {
    const value = node.toString().trim();
    if (/\b(?:html|body)\b|:root|::(?:before|after|first-letter|first-line)/iu.test(value)) {
      throw new Error(`Unsafe global or pseudo-element selector: ${value}`);
    }
    if (value.startsWith(ARTICLE_ROOT)) {
      scoped.push(value);
    } else {
      scoped.push(`${ARTICLE_ROOT} ${value}`);
    }
  }

  return scoped.join(', ');
}

function validateDeclaration(property: string, value: string): void {
  const normalizedProperty = property.trim().toLowerCase();
  const normalizedValue = value.trim().toLowerCase();

  if (/url\s*\(|expression\s*\(|javascript:/iu.test(normalizedValue)) {
    throw new Error(`External or executable CSS value is not allowed: ${property}`);
  }
  if (normalizedProperty === 'behavior') {
    throw new Error('CSS behavior is not allowed.');
  }
  if (normalizedProperty === 'position' && /^(?:fixed|sticky)$/u.test(normalizedValue)) {
    throw new Error(`Unsafe positioning is not allowed: ${normalizedValue}`);
  }
  if (normalizedProperty === 'z-index') {
    const zIndex = Number.parseInt(normalizedValue, 10);
    if (Number.isFinite(zIndex) && zIndex > 10) {
      throw new Error(`z-index exceeds the theme limit: ${zIndex}`);
    }
  }
}

export function validateThemePack(
  manifest: ThemeManifest,
  css: string,
): ThemeValidationResult {
  const diagnostics = validateManifest(manifest);
  if (diagnostics.length > 0) return { ok: false, css: '', diagnostics: Object.freeze(diagnostics) };

  try {
    const root = postcss.parse(css);
    root.walkAtRules(rule => {
      throw rule.error(`CSS at-rule @${rule.name} is not allowed.`);
    });
    root.walkRules(rule => {
      rule.selector = scopedSelector(rule.selector);
    });
    root.walkDecls(declaration => {
      validateDeclaration(declaration.prop, declaration.value);
    });

    return { ok: true, css: root.toString(), diagnostics: Object.freeze([]) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CSS validation error.';
    return {
      ok: false,
      css: '',
      diagnostics: Object.freeze([blocking('THEME_CSS_UNSAFE', message)]),
    };
  }
}
