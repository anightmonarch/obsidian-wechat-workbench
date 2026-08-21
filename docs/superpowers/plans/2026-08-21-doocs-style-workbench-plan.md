# Composable Doocs Style Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Doocs-compatible composable style workbench inside the existing Obsidian `ItemView`, with article-level persistence and identical style inputs for preview, clipboard, and WeChat draft generation.

**Architecture:** Keep Obsidian as the only Markdown editor. Resolve article/global style configuration into a normalized `ArticleStyleConfig`, compile it with a registered base theme and bundled highlight.js theme into deterministic CSS, then pass the compiled theme and structural render options through the existing `RenderArtifactBuilder`. The workbench controller owns generation cancellation and debounced persistence; UI modules only render controls and forward typed actions.

**Tech Stack:** TypeScript 5.8, Obsidian API 1.13 types with runtime floor 1.11.4, unified/remark/rehype, PostCSS, highlight.js 11.12, juice 12.1, Vitest 4, jsdom, esbuild.

## Global Constraints

- Follow [`../specs/2026-08-21-doocs-style-workbench-design.md`](../specs/2026-08-21-doocs-style-workbench-design.md) and repository `AGENTS.md`; current user instructions take precedence.
- Desktop only: macOS, Windows, Linux. Do not add mobile support or private Obsidian workspace APIs.
- Keep `manifest.json` ID `wechat-workbench`, name `WeChat Workbench`, `isDesktopOnly: true`, and minimum app version `1.11.4`.
- Preserve the existing four built-in themes and Vault custom themes; add `doocs-classic`, `doocs-grace`, and `doocs-simple` as the primary composable themes.
- Do not embed Vue, Pinia, CodeMirror, Doocs file management, AI, cloud storage, marketplace, or export modules.
- Do not add passive network requests. Fonts and code themes must be local; no Doocs CDN or remote font dependency.
- Do not expose arbitrary CSS editing in phase one.
- Preserve one immutable `RenderArtifact` as the source for preview, rich copy, and draft publishing.
- Preserve local-only AppID/AppSecret/Access Token handling and all current publish recovery semantics.
- Do not perform a formal WeChat send, npm publish, GitHub push, or Obsidian community submission.
- Doocs-derived CSS must reference fixed commit `fd136f79f84cf8f9c6206ef864fb318b16390171`; preserve WTFPL and theme-author notices.
- Every production change starts with a failing test. Every task ends with focused tests and a separate commit.
- Before every commit run `npm run scan:secrets`; never stage `.codegraph/`, test Vault credentials, generated secrets, or unrelated user changes.

---

## File Structure

### New production files

- `src/domain/style.ts` — stable style IDs, `ArticleStyleConfig`, parse/result types, and UI-neutral option types.
- `src/styles/style-config.ts` — defaults, normalization, parsing, serialization, patching, and per-theme default lookup.
- `src/styles/style-options.ts` — Chinese labels and exact Doocs option catalogs used by UI and validation.
- `src/styles/code-theme-registry.ts` — allowlisted local code-theme lookup.
- `src/styles/generated/code-themes.ts` — generated local CSS map; committed release input.
- `src/styles/style-compiler.ts` — deterministic base-theme + option + code-theme compilation.
- `src/styles/style-resolver.ts` — article/legacy/global/default precedence without silent migration.
- `src/styles/style-frontmatter-store.ts` — safe `wechat-style` and `wechat-theme-id` write.
- `src/styles/style-workflow.ts` — façade used by controller and publish revalidation.
- `src/render/style-projections.ts` — deterministic image captions and code block structure.
- `src/ui/style-workbench.ts` — style panel DOM, events, and accessibility semantics.
- `scripts/generate-code-themes.mjs` — deterministic build-time extraction of highlight.js CSS.
- `THIRD_PARTY_NOTICES.md` — Doocs and adapted theme attribution.

### Existing production files to modify

- `src/settings/model.ts`, `src/settings/settings-store.ts` — schema v2 style defaults and migration.
- `src/themes/builtin/index.ts` plus three new built-in theme modules — register adapted themes.
- `src/render/extensions/code.ts`, `src/render/artifact-builder.ts` — structural style projection.
- `src/ui/workbench-controller.ts`, `src/ui/workbench-view.ts` — style lifecycle and panel integration.
- `src/main.ts` — style workflow wiring and publish-time deterministic rebuild.
- `styles.css` — responsive side-by-side/overlay workbench shell.
- `package.json` — local code-theme generation command.
- `docs/user-guide/themes.md`, `README.md` — user-facing style behavior and attribution.

### New tests and fixtures

- `tests/unit/styles/style-config.test.ts`
- `tests/unit/styles/style-options.test.ts`
- `tests/unit/styles/code-theme-registry.test.ts`
- `tests/unit/styles/style-compiler.test.ts`
- `tests/unit/styles/style-resolver.test.ts`
- `tests/unit/styles/style-frontmatter-store.test.ts`
- `tests/unit/styles/style-workflow.test.ts`
- `tests/unit/render/style-projections.test.ts`
- `tests/unit/ui/style-workbench.test.ts`
- `tests/integration/style-workbench.test.ts`
- `tests/fixtures/articles/style-elements.md`
- `tests/golden/doocs-classic.html`
- `tests/golden/doocs-grace.html`
- `tests/golden/doocs-simple.html`
- `tests/verification/style-workbench` is not created; manual evidence belongs under `docs/verification/`.

---

### Task 1: Define and normalize the style configuration contract

**Files:**
- Create: `src/domain/style.ts`
- Create: `src/styles/style-config.ts`
- Create: `src/styles/style-options.ts`
- Test: `tests/unit/styles/style-config.test.ts`
- Test: `tests/unit/styles/style-options.test.ts`

**Interfaces:**
- Produces: `ArticleStyleConfig`, `StyleParseResult`, `DEFAULT_ARTICLE_STYLE`, `parseArticleStyle()`, `serializeArticleStyle()`, `patchArticleStyle()`, `defaultStyleForTheme()`, and `STYLE_OPTIONS`.
- Consumes: no new project interfaces.

- [ ] **Step 1: Write failing tests for exact Doocs choices and immutable defaults**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_ARTICLE_STYLE } from '../../../src/styles/style-config';
import { STYLE_OPTIONS } from '../../../src/styles/style-options';

describe('style option contract', () => {
  it('matches the approved Doocs phase-one surface', () => {
    expect(STYLE_OPTIONS.fontSizes).toEqual([14, 15, 16, 17, 18]);
    expect(STYLE_OPTIONS.fonts.map(item => item.id)).toEqual(['sans-serif', 'serif', 'monospace']);
    expect(STYLE_OPTIONS.colors).toHaveLength(11);
    expect(STYLE_OPTIONS.captionModes.map(item => item.id)).toEqual([
      'title-alt', 'alt-title', 'title', 'alt', 'filename', 'none',
    ]);
    expect(DEFAULT_ARTICLE_STYLE.themeId).toBe('doocs-classic');
    expect(Object.isFrozen(DEFAULT_ARTICLE_STYLE)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused tests and verify the missing-module failure**

Run: `npx vitest run tests/unit/styles/style-config.test.ts tests/unit/styles/style-options.test.ts`

Expected: FAIL because `src/styles/style-config.ts` and `style-options.ts` do not exist.

- [ ] **Step 3: Add the pure domain types**

```ts
export type FontFamilyId = 'sans-serif' | 'serif' | 'monospace';
export type FontSize = 14 | 15 | 16 | 17 | 18;
export type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
export type HeadingStyle = 'default' | 'color-only' | 'border-bottom' | 'border-left';
export type ImageCaptionMode = 'title-alt' | 'alt-title' | 'title' | 'alt' | 'filename' | 'none';

export interface ArticleStyleConfig {
  version: 1;
  themeId: string;
  fontFamily: FontFamilyId;
  fontSize: FontSize;
  primaryColor: string;
  headingStyles: Readonly<Partial<Record<HeadingLevel, HeadingStyle>>>;
  codeThemeId: string;
  showCodeLineNumbers: boolean;
  macCodeBlock: boolean;
  imageCaption: ImageCaptionMode;
  paragraphIndent: boolean;
  textJustify: boolean;
}

export type StyleParseResult =
  | Readonly<{ status: 'missing'; config: null; version: null }>
  | Readonly<{ status: 'valid'; config: Readonly<ArticleStyleConfig>; version: 1 }>
  | Readonly<{ status: 'unsupported'; config: null; version: number }>;
```

- [ ] **Step 4: Implement exact options, field-by-field normalization, parse, patch, and serialization**

Use these signatures:

```ts
export const DEFAULT_ARTICLE_STYLE: Readonly<ArticleStyleConfig>;
export function defaultStyleForTheme(themeId: string): Readonly<ArticleStyleConfig>;
export function parseArticleStyle(
  value: unknown,
  fallback?: Readonly<ArticleStyleConfig>,
): StyleParseResult;
export function patchArticleStyle(
  current: Readonly<ArticleStyleConfig>,
  patch: Readonly<Partial<Omit<ArticleStyleConfig, 'version' | 'headingStyles'>> & {
    headingStyles?: ArticleStyleConfig['headingStyles'];
  }>,
): Readonly<ArticleStyleConfig>;
export function serializeArticleStyle(config: Readonly<ArticleStyleConfig>): Readonly<Record<string, unknown>>;
```

Normalization rules are exact: six-digit `#RRGGBB` colors only and uppercase output; unknown enums use the supplied fallback field; unknown heading keys are discarded; supported `version: 1` records are repaired field-by-field; numeric or future versions return `unsupported` without a writable config. The parser accepts both typed camelCase fields used in `data.json` (`themeId`, `fontSize`, `primaryColor`) and Frontmatter wire fields (`theme`, `font-size`, `primary-color`); `serializeArticleStyle()` always emits the approved Frontmatter wire shape.

- [ ] **Step 5: Add failing/repairing parse cases**

```ts
it('repairs fields without accepting a future schema', () => {
  expect(parseArticleStyle({ version: 1, theme: 'doocs-grace', 'font-size': 99 }).status).toBe('valid');
  expect(parseArticleStyle({ version: 2, theme: 'future' })).toEqual({
    status: 'unsupported', config: null, version: 2,
  });
  expect(serializeArticleStyle(patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
    primaryColor: '#009874', fontSize: 18,
  }))).toMatchObject({
    version: 1, theme: 'doocs-classic', 'font-size': 18, 'primary-color': '#009874',
  });
});
```

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npx vitest run tests/unit/styles/style-config.test.ts tests/unit/styles/style-options.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Scan and commit**

```bash
npm run scan:secrets
git add src/domain/style.ts src/styles/style-config.ts src/styles/style-options.ts tests/unit/styles/style-config.test.ts tests/unit/styles/style-options.test.ts
git commit -m "feat(style): define composable style config"
```

---

### Task 2: Migrate plugin settings to schema v2

**Files:**
- Modify: `src/settings/model.ts`
- Modify: `src/settings/settings-store.ts`
- Modify: `tests/unit/settings/settings-store.test.ts`

**Interfaces:**
- Consumes: `ArticleStyleConfig`, `DEFAULT_ARTICLE_STYLE`, `parseArticleStyle()` from Task 1.
- Produces: `PluginSettings.schemaVersion: 2`, `defaultStyle`, and `recentStyles` for Tasks 7–10.

- [ ] **Step 1: Write a failing schema-v1 migration test**

```ts
it('migrates schema v1 without dropping account or publish state', async () => {
  const settings = await new SettingsStore(new MemoryPluginData({
    schemaVersion: 1,
    appId: 'wx-public-id',
    defaultThemeId: 'technical',
    mediaCache: [],
    recoveryReceipts: [],
  })).load();

  expect(settings.schemaVersion).toBe(2);
  expect(settings.appId).toBe('wx-public-id');
  expect(settings.defaultThemeId).toBe('technical');
  expect(settings.defaultStyle).toEqual(DEFAULT_ARTICLE_STYLE);
  expect(settings.recentStyles).toEqual({});
});
```

- [ ] **Step 2: Run the migration test and verify it fails on schema version 1**

Run: `npx vitest run tests/unit/settings/settings-store.test.ts -t "migrates schema v1"`

Expected: FAIL because style settings do not exist and schema remains 1.

- [ ] **Step 3: Extend `PluginSettings` and defaults**

```ts
export interface PluginSettings {
  schemaVersion: 2;
  // existing fields remain unchanged
  defaultStyle: Readonly<ArticleStyleConfig>;
  recentStyles: Readonly<Record<string, Readonly<ArticleStyleConfig>>>;
}
```

Keep `defaultThemeId` as a legacy fallback. Set `DEFAULT_SETTINGS.defaultStyle` to `DEFAULT_ARTICLE_STYLE` and `recentStyles` to a frozen empty object.

- [ ] **Step 4: Implement explicit v1/v2 sanitization**

`sanitizeSettings()` must accept `schemaVersion === 1 || schemaVersion === 2`, preserve every existing known non-secret field, sanitize `defaultStyle`, and keep at most 100 `recentStyles` entries whose keys are valid theme IDs. Unknown/future plugin schema versions return current defaults rather than partially loading arbitrary data.

- [ ] **Step 5: Add corruption and secret-shaped field tests**

```ts
it('sanitizes style maps and still refuses credential-shaped extras', async () => {
  const settings = await new SettingsStore(new MemoryPluginData({
    schemaVersion: 2,
    defaultStyle: { version: 1, theme: 'doocs-simple', 'primary-color': '#009874' },
    recentStyles: { 'doocs-simple': { version: 1, theme: 'doocs-simple', 'font-size': 18 } },
    appSecret: 'must-not-load',
  })).load();
  expect(settings.defaultStyle.themeId).toBe('doocs-simple');
  expect(settings.recentStyles['doocs-simple']?.fontSize).toBe(18);
  expect(settings).not.toHaveProperty('appSecret');
});
```

- [ ] **Step 6: Run settings tests, typecheck, and full secret tests**

Run: `npx vitest run tests/unit/settings/settings-store.test.ts tests/adversarial/secret-leakage.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Scan and commit**

```bash
npm run scan:secrets
git add src/settings/model.ts src/settings/settings-store.ts tests/unit/settings/settings-store.test.ts
git commit -m "feat(settings): migrate composable style defaults"
```

---

### Task 3: Register adapted Doocs themes and attribution

**Files:**
- Create: `src/themes/builtin/doocs-classic.ts`
- Create: `src/themes/builtin/doocs-grace.ts`
- Create: `src/themes/builtin/doocs-simple.ts`
- Modify: `src/themes/builtin/index.ts`
- Modify: `tests/unit/themes/theme-registry.test.ts`
- Create: `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Consumes: existing `ThemeManifest`, `ThemeDefinition`, `builtinTheme()` pattern.
- Produces: three registered base themes for `StyleCompiler`.

- [ ] **Step 1: Change the registry test to require seven built-ins**

```ts
expect(registry.list().filter(theme => theme.source === 'builtin').map(theme => theme.manifest.id))
  .toEqual([
    'doocs-classic', 'doocs-grace', 'doocs-simple',
    'editorial', 'native', 'technical', 'verdant',
  ]);
```

Also assert the Chinese names `经典`, `优雅`, and `简洁`.

- [ ] **Step 2: Run the registry test and verify the missing-theme failure**

Run: `npx vitest run tests/unit/themes/theme-registry.test.ts -t "built-in themes"`

Expected: FAIL because only four built-ins are registered.

- [ ] **Step 3: Port the three theme layers against current HTML semantics**

Each module exports an immutable manifest and CSS string. Use the fixed Doocs source commit, replace `#output` with `.wechat-article`, map `.codespan` to `code:not(pre code)`, `.code__pre` to `pre`, `.markdown-alert-*` to `.callout-*`, and `.md-figcaption` to `figcaption`. Remove Doocs application-shell colors, remote resources, hover-only rules, and selectors for unsupported components. Base CSS uses concrete phase-one defaults (`16px`, the approved sans-serif stack, and `#0F4C81`) rather than unresolved CSS variables; Task 5 appends deterministic user overrides.

Required manifests:

```ts
{ id: 'doocs-classic', name: '经典', version: '1.0.0', author: 'Doocs / WeChat Workbench', description: '...' }
{ id: 'doocs-grace', name: '优雅', version: '1.0.0', author: 'Doocs, Doocs / WeChat Workbench', description: '...' }
{ id: 'doocs-simple', name: '简洁', version: '1.0.0', author: 'Doocs, Doocs / WeChat Workbench', description: '...' }
```

- [ ] **Step 4: Register themes without changing existing IDs or custom-theme precedence**

Add the three `builtinTheme()` entries before the existing four entries. `ThemeRegistry.load()` and conflict behavior remain unchanged.

- [ ] **Step 5: Add attribution and source boundaries**

`THIRD_PARTY_NOTICES.md` must name `doocs/md`, fixed commit, WTFPL, adapted files, and the `grace`/`simple` author handles. State that Vue application code, cloud modules, logos, and web assets are not included.

- [ ] **Step 6: Run theme registry and validator tests**

Run: `npx vitest run tests/unit/themes/theme-registry.test.ts tests/unit/themes/theme-validator.test.ts tests/adversarial/html-css.test.ts`

Expected: PASS; no adapted theme contains `@import`, external `url()`, global selectors, or prohibited positioning.

- [ ] **Step 7: Scan and commit**

```bash
npm run scan:secrets
git add src/themes/builtin tests/unit/themes/theme-registry.test.ts THIRD_PARTY_NOTICES.md
git commit -m "feat(theme): add adapted Doocs presets"
```

---

### Task 4: Bundle the Doocs code-theme catalog locally

**Files:**
- Create: `scripts/generate-code-themes.mjs`
- Create: `src/styles/generated/code-themes.ts`
- Create: `src/styles/code-theme-registry.ts`
- Modify: `src/styles/style-options.ts`
- Modify: `package.json`
- Test: `tests/unit/styles/code-theme-registry.test.ts`

**Interfaces:**
- Consumes: installed `highlight.js@11.12.0` CSS and PostCSS.
- Produces: `DOOCS_CODE_THEME_IDS`, `DEFAULT_CODE_THEME_ID`, `CodeThemeRegistry.get(id)`, and committed CSS strings.

- [ ] **Step 1: Write a failing catalog completeness test**

```ts
it('bundles every approved Doocs code theme without remote resources', () => {
  const registry = new CodeThemeRegistry();
  for (const id of DOOCS_CODE_THEME_IDS) {
    const css = registry.get(id);
    expect(css, id).toMatch(/\.hljs/u);
    expect(css, id).not.toMatch(/@import|url\s*\(/iu);
  }
  expect(registry.get('not-a-theme')).toBe(registry.get(DEFAULT_CODE_THEME_ID));
});
```

- [ ] **Step 2: Run the test and verify the missing-registry failure**

Run: `npx vitest run tests/unit/styles/code-theme-registry.test.ts`

Expected: FAIL because no local registry exists.

- [ ] **Step 3: Define the exact allowlist**

The committed ID list is:

```ts
export const DOOCS_CODE_THEME_IDS = Object.freeze([
  '1c-light', 'a11y-dark', 'a11y-light', 'agate', 'an-old-hope', 'androidstudio',
  'arduino-light', 'arta', 'ascetic', 'atom-one-dark-reasonable', 'atom-one-dark',
  'atom-one-light', 'brown-paper', 'codepen-embed', 'color-brewer', 'dark', 'default',
  'devibeans', 'docco', 'far', 'felipec', 'foundation', 'github-dark-dimmed',
  'github-dark', 'github', 'gml', 'googlecode', 'gradient-dark', 'gradient-light',
  'grayscale', 'hybrid', 'idea', 'intellij-light', 'ir-black', 'isbl-editor-dark',
  'isbl-editor-light', 'kimbie-dark', 'kimbie-light', 'lightfair', 'lioshi', 'magula',
  'mono-blue', 'monokai-sublime', 'monokai', 'night-owl', 'nnfx-dark', 'nnfx-light',
  'nord', 'obsidian', 'panda-syntax-dark', 'panda-syntax-light', 'paraiso-dark',
  'paraiso-light', 'pojoaque', 'purebasic', 'qtcreator-dark', 'qtcreator-light',
  'rainbow', 'routeros', 'school-book', 'shades-of-purple', 'srcery',
  'stackoverflow-dark', 'stackoverflow-light', 'sunburst', 'tokyo-night-dark',
  'tomorrow-night-blue', 'tomorrow-night-bright', 'vs', 'vs2015', 'xcode', 'xt256',
] as const);
```

Set `DEFAULT_CODE_THEME_ID = 'github-dark'`.

- [ ] **Step 4: Implement deterministic generation**

The generator resolves each `highlight.js/styles/<id>.css`, parses with PostCSS, removes declarations containing `url()`, rejects at-rules, and removes selectors rejected by the article-theme policy (`html`, `body`, `:root`, and pseudo-elements). It then normalizes line endings, sorts map keys, and writes one TypeScript `Record<string, string>`. It exits non-zero if any listed source file is missing or no `.hljs` selector remains.

Add script: `"generate:code-themes": "node scripts/generate-code-themes.mjs"`.

- [ ] **Step 5: Generate, inspect, and test the committed map**

Run: `npm run generate:code-themes && npx vitest run tests/unit/styles/code-theme-registry.test.ts && npm run build`

Expected: PASS; a second `npm run generate:code-themes` leaves `src/styles/generated/code-themes.ts` byte-identical.

- [ ] **Step 6: Scan and commit**

```bash
npm run scan:secrets
git add package.json package-lock.json scripts/generate-code-themes.mjs src/styles/style-options.ts src/styles/code-theme-registry.ts src/styles/generated/code-themes.ts tests/unit/styles/code-theme-registry.test.ts
git commit -m "feat(style): bundle local code themes"
```

---

### Task 5: Compile deterministic composable themes

**Files:**
- Create: `src/styles/style-compiler.ts`
- Test: `tests/unit/styles/style-compiler.test.ts`
- Modify: `src/domain/theme.ts`

**Interfaces:**
- Consumes: `ThemeDefinition`, `ArticleStyleConfig`, `CodeThemeRegistry`, `validateThemePack()`.
- Produces: `CompiledThemeMetadata` and `StyleCompiler.compile(base, config): ThemeDefinition`.

- [ ] **Step 1: Write failing determinism and safety tests**

```ts
it('materializes values and hashes the complete style input', () => {
  const first = compiler.compile(baseTheme, DEFAULT_ARTICLE_STYLE);
  const second = compiler.compile(baseTheme, DEFAULT_ARTICLE_STYLE);
  const green = compiler.compile(baseTheme, patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
    primaryColor: '#009874',
  }));

  expect(first.css).toBe(second.css);
  expect(first.contentHash).toBe(second.contentHash);
  expect(green.contentHash).not.toBe(first.contentHash);
  expect(first.css).not.toMatch(/var\(--|:root|@import|url\s*\(/iu);
  expect(first.css).toContain('.wechat-article');
});
```

- [ ] **Step 2: Run the test and verify the missing-compiler failure**

Run: `npx vitest run tests/unit/styles/style-compiler.test.ts`

Expected: FAIL because `StyleCompiler` does not exist.

- [ ] **Step 3: Add compiled metadata without breaking existing themes**

Extend `ThemeDefinition` with an optional immutable field:

```ts
compiledStyle?: Readonly<{
  config: Readonly<ArticleStyleConfig>;
  baseThemeHash: string;
}>;
```

Existing built-in and Vault themes omit it. Compiled themes retain the base manifest ID/version/source and set this field.

- [ ] **Step 4: Implement CSS layers in fixed order**

`StyleCompiler.compile()` emits:

1. Base theme CSS.
2. Article root font family, font size, and line height.
3. Primary color overrides.
4. H1–H6 overrides in heading order.
5. Paragraph indent/justify declarations.
6. Code-theme CSS.
7. Mac chrome, line-number, figure, and figcaption structural CSS.

Use fixed system stacks from `STYLE_OPTIONS`; never emit a remote font. Validate the merged CSS through `validateThemePack()`. Throw `StyleCompileError('STYLE_CSS_INVALID', diagnostics)` on failure. Hash `baseTheme.contentHash + canonical JSON config + normalized CSS` with SHA-256.

- [ ] **Step 5: Test heading precedence and legacy/custom base preservation**

```ts
it('appends overrides after a valid Vault theme', () => {
  const result = compiler.compile(customTheme, patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
    themeId: 'custom-green',
    headingStyles: { h2: 'border-left' },
  }));
  expect(result.css.indexOf('custom-marker')).toBeLessThan(result.css.lastIndexOf('border-left'));
  expect(result.manifest.id).toBe('custom-green');
  expect(result.source).toBe('vault');
});
```

Add a parameterized test over every `DOOCS_CODE_THEME_IDS` entry. Compiling `DEFAULT_ARTICLE_STYLE` with each code theme must pass `validateThemePack()` and produce CSS without at-rules, external URLs, global selectors, or prohibited pseudo-elements.

- [ ] **Step 6: Run compiler, validator, and determinism tests**

Run: `npx vitest run tests/unit/styles/style-compiler.test.ts tests/unit/themes/theme-validator.test.ts tests/unit/render/determinism.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Scan and commit**

```bash
npm run scan:secrets
git add src/domain/theme.ts src/styles/style-compiler.ts tests/unit/styles/style-compiler.test.ts
git commit -m "feat(style): compile deterministic theme layers"
```

---

### Task 6: Project captions and code presentation into publishable HTML

**Files:**
- Create: `src/render/style-projections.ts`
- Modify: `src/render/extensions/code.ts`
- Modify: `src/render/artifact-builder.ts`
- Test: `tests/unit/render/style-projections.test.ts`
- Modify: `tests/unit/render/rich-elements.test.ts`
- Modify: `tests/unit/render/markdown-pipeline.test.ts`

**Interfaces:**
- Consumes: `ArticleStyleConfig` and compiled CSS from Task 5.
- Produces: `applyImageCaptions(root, mode)`, `CodeBlockOptions`, and optional style argument on `RenderArtifactBuilder.build()`.

- [ ] **Step 1: Write failing image-caption tests for all six modes**

```ts
it.each([
  ['title-alt', 'Title'], ['alt-title', 'Alt'], ['title', 'Title'],
  ['alt', 'Alt'], ['filename', 'photo-one'], ['none', null],
] as const)('renders %s captions deterministically', (mode, expected) => {
  const root = parseArticleRoot('<section class="wechat-article"><p><img alt="Alt" title="Title" data-asset-source="assets/photo-one.png"></p></section>');
  applyImageCaptions(root, mode);
  expect(root.querySelector('figcaption')?.textContent ?? null).toBe(expected);
});
```

- [ ] **Step 2: Write failing code structure tests**

Assert that line-number mode produces `.code-line`, `.code-line-number`, and `.code-line-content` spans; Mac mode produces a real `.code-window-dots` span; disabling both produces neither. Do not use pseudo-elements for information that must survive rich copy.

- [ ] **Step 3: Run focused tests and verify failures**

Run: `npx vitest run tests/unit/render/style-projections.test.ts`

Expected: FAIL because projection functions do not exist.

- [ ] **Step 4: Implement safe figure projection**

`applyImageCaptions()` only converts a paragraph whose significant content is one image. It derives filename before `extractImageAssets()` removes `data-asset-source`, creates `<figure class="image-figure">`, keeps the same image node, and adds `<figcaption class="image-caption">` only when the selected mode yields non-empty text. Inline images mixed with text remain unchanged and receive no caption.

- [ ] **Step 5: Extend code highlighting with structural options**

```ts
export interface CodeBlockOptions {
  showLineNumbers: boolean;
  macWindow: boolean;
}

export function highlightCodeBlocks(
  root: Element,
  options: Readonly<CodeBlockOptions> = { showLineNumbers: false, macWindow: false },
): void;
```

Highlight first, then split the sanitized highlighted DOM at newline boundaries while preserving allowed `hljs-*` spans. Insert stable line spans and text newlines. Mac dots use text/DOM spans, carry `aria-hidden="true"`, and cannot contain active content.

- [ ] **Step 6: Pass style options through the artifact builder**

```ts
async build(
  snapshot: Readonly<NoteSnapshot>,
  theme: Readonly<ThemeDefinition>,
  style: Readonly<ArticleStyleConfig> | null = null,
): Promise<Readonly<RenderArtifact>>;
```

Apply captions before image asset extraction. Highlight code with `style?.showCodeLineNumbers` and `style?.macCodeBlock`. Existing callers that omit style retain byte-identical current output.

- [ ] **Step 7: Run projection, existing golden, asset, and clipboard tests**

Run: `npx vitest run tests/unit/render/style-projections.test.ts tests/unit/render/rich-elements.test.ts tests/unit/render/assets.test.ts tests/unit/clipboard/asset-resolver.test.ts`

Expected: PASS; existing `native` golden output remains unchanged because the optional style argument defaults to `null`.

- [ ] **Step 8: Scan and commit**

```bash
npm run scan:secrets
git add src/render/style-projections.ts src/render/extensions/code.ts src/render/artifact-builder.ts tests/unit/render/style-projections.test.ts tests/unit/render/rich-elements.test.ts tests/unit/render/markdown-pipeline.test.ts
git commit -m "feat(render): project captions and code styles"
```

---

### Task 7: Resolve and persist article styles without silent migration

**Files:**
- Create: `src/styles/style-resolver.ts`
- Create: `src/styles/style-frontmatter-store.ts`
- Create: `src/styles/style-workflow.ts`
- Test: `tests/unit/styles/style-resolver.test.ts`
- Test: `tests/unit/styles/style-frontmatter-store.test.ts`
- Test: `tests/unit/styles/style-workflow.test.ts`

**Interfaces:**
- Consumes: style config, settings fields, `ThemeRegistry`, `StyleCompiler`, `FrontmatterMutationPort`.
- Produces: `ResolvedArticleStyle`, `StyleFrontmatterStore.save()`, and controller-facing `StyleWorkflow`.

- [ ] **Step 1: Write failing precedence tests**

```ts
expect(resolver.resolve({
  frontmatter: { 'wechat-style': serializeArticleStyle(articleStyle), 'wechat-theme-id': 'native' },
  selectedThemeId: 'native', defaultStyle: globalStyle,
}).source).toBe('article');

expect(resolver.resolve({
  frontmatter: { 'wechat-theme-id': 'technical' },
  selectedThemeId: 'technical', defaultStyle: globalStyle,
})).toMatchObject({ source: 'legacy', renderMode: 'legacy', themeId: 'technical' });

expect(resolver.resolve({
  frontmatter: {}, selectedThemeId: 'native', defaultStyle: globalStyle,
})).toMatchObject({ source: 'global', renderMode: 'compiled' });
```

- [ ] **Step 2: Run resolver tests and verify the missing-module failure**

Run: `npx vitest run tests/unit/styles/style-resolver.test.ts`

Expected: FAIL because `StyleResolver` does not exist.

- [ ] **Step 3: Implement explicit resolution output**

```ts
export interface ResolvedArticleStyle {
  source: 'article' | 'legacy' | 'global' | 'unsupported-fallback';
  renderMode: 'compiled' | 'legacy';
  themeId: string;
  config: Readonly<ArticleStyleConfig>;
  unsupportedVersion: number | null;
}
```

Rules: valid `wechat-style` wins; explicit legacy `wechat-theme-id` with no new style renders its registered theme unchanged; no article fields uses global default; future style schema uses global default for preview but remains `unsupported-fallback` and must never be overwritten automatically.

- [ ] **Step 4: Write failing Frontmatter safety tests**

```ts
await store.save(file, style);
expect(frontmatter).toMatchObject({
  title: 'Keep me',
  'wechat-theme-id': style.themeId,
  'wechat-style': serializeArticleStyle(style),
});
```

Also assert that another file reference is never mutated and unrelated nested fields survive.

- [ ] **Step 5: Implement the Frontmatter store**

```ts
export class StyleFrontmatterStore {
  constructor(private readonly frontmatter: FrontmatterMutationPort) {}
  async save(file: VaultFileRef, config: Readonly<ArticleStyleConfig>): Promise<void>;
}
```

Use one `processFrontmatter()` callback to write both fields atomically. Do not delete unknown style keys outside the owned `wechat-style` value and do not write CSS/hash/HTML.

- [ ] **Step 6: Implement the workflow façade**

```ts
export interface StyleGlobalSettingsPort {
  get(): Readonly<Pick<PluginSettings, 'defaultStyle' | 'recentStyles'>>;
  update(patch: Readonly<Partial<Pick<PluginSettings, 'defaultStyle' | 'recentStyles'>>>): Promise<void>;
}

export class StyleWorkflow {
  resolve(snapshot: Readonly<NoteSnapshot>): Readonly<ResolvedArticleStyle>;
  materialize(resolved: Readonly<ResolvedArticleStyle>): Readonly<ThemeDefinition>;
  async saveArticle(file: VaultFileRef, config: Readonly<ArticleStyleConfig>): Promise<void>;
  async setGlobalDefault(config: Readonly<ArticleStyleConfig>): Promise<void>;
  reset(themeId: string): Readonly<ArticleStyleConfig>;
}
```

`saveArticle()` writes Frontmatter and updates only `recentStyles[themeId]`; `setGlobalDefault()` updates only the global default and recent entry. `materialize()` returns the uncompiled registry theme for `legacy`, otherwise calls `StyleCompiler`.

- [ ] **Step 7: Run style service tests**

Run: `npx vitest run tests/unit/styles/style-resolver.test.ts tests/unit/styles/style-frontmatter-store.test.ts tests/unit/styles/style-workflow.test.ts`

Expected: PASS.

- [ ] **Step 8: Scan and commit**

```bash
npm run scan:secrets
git add src/styles/style-resolver.ts src/styles/style-frontmatter-store.ts src/styles/style-workflow.ts tests/unit/styles/style-resolver.test.ts tests/unit/styles/style-frontmatter-store.test.ts tests/unit/styles/style-workflow.test.ts
git commit -m "feat(style): resolve and persist article styles"
```

---

### Task 8: Integrate style generation and debounced saves into the controller

**Files:**
- Modify: `src/ui/workbench-controller.ts`
- Modify: `tests/integration/workbench.test.ts`
- Modify: `tests/fixtures/workbench-render-state.ts`

**Interfaces:**
- Consumes: `StyleWorkflow` façade and optional style argument on `RenderArtifactBuilder.build()`.
- Produces: style fields in `WorkbenchRenderState` and style actions used by the UI.

- [ ] **Step 1: Add failing controller tests for newest-generation wins**

Create two deferred builder promises. Trigger style A, then style B, resolve B first and A last, and assert the view keeps B. Assert the prior stable artifact remains available while B is pending.

```ts
controller.updateStyle({ primaryColor: '#009874' });
controller.updateStyle({ primaryColor: '#FA5151' });
await resolveBuildFor('#FA5151');
await resolveBuildFor('#009874');
expect(view.latestStyle.primaryColor).toBe('#FA5151');
```

- [ ] **Step 2: Add failing save-context and debounce tests**

With fake timers, issue three style updates and advance the save delay once. Assert one `saveArticle()` call with the last config and the original `VaultFileRef`. Switch active files before the timer fires and assert the pending save cannot target the new file.

Also make `saveArticle()` reject once and assert the last stable preview remains available, the view receives `unsaved`, and a later flush retries the same file/config. Make `materialize()` throw once and assert raw CSS diagnostics are not passed to the visible view.

- [ ] **Step 3: Run focused workbench tests and verify failures**

Run: `npx vitest run tests/integration/workbench.test.ts`

Expected: FAIL because style actions and state do not exist.

- [ ] **Step 4: Extend controller/view ports**

```ts
export interface WorkbenchStylePort {
  resolve(snapshot: Readonly<NoteSnapshot>): Readonly<ResolvedArticleStyle>;
  materialize(resolved: Readonly<ResolvedArticleStyle>): Readonly<ThemeDefinition>;
  saveArticle(file: VaultFileRef, config: Readonly<ArticleStyleConfig>): Promise<void>;
  setGlobalDefault(config: Readonly<ArticleStyleConfig>): Promise<void>;
  reset(themeId: string): Readonly<ArticleStyleConfig>;
}

export interface WorkbenchRenderState {
  // existing fields
  style: Readonly<ResolvedArticleStyle>;
  styleSaveStatus: 'saved' | 'saving' | 'unsaved';
}
```

Controller methods become `updateStyle(patch)`, `selectStyleTheme(themeId)`, `resetStyle()`, `setStyleAsDefault()`, and `flushStyleSave()`. Remove the session-only `themeOverrides` path after tests cover replacement behavior.

If `resolved.source === 'unsupported-fallback'`, `updateStyle()`, `selectStyleTheme()`, and auto-save must refuse to overwrite Frontmatter and ask the view to show `当前文章样式来自更高版本，请升级插件后再修改。`. The fallback preview remains available; there is no destructive “repair” action in phase one.

- [ ] **Step 5: Preserve the stable artifact during style-only rebuilds**

Style changes increment render generation but do not null `artifact`, `report`, or `snapshot` until the new build succeeds. Non-style source changes keep existing semantics unless retaining the stable preview is safe. A failed style build calls a dedicated view status method and leaves copy/publish bound to the last successful artifact.

- [ ] **Step 6: Implement debounced article persistence**

Keep a pending immutable `{ file, config }`. Coalesce repeated updates. `flushStyleSave()` writes that exact file/config, updates view status, and never reads `source.currentMarkdown()` to choose the target. On active-file changes flush the old pending save before rebuilding the new file. `stop()` becomes async and flushes pending style state.

- [ ] **Step 7: Build with resolved style and structural options**

```ts
const resolved = this.styles.resolve(snapshot);
const theme = this.styles.materialize(resolved);
const artifact = await this.builder.build(
  snapshot,
  theme,
  resolved.renderMode === 'compiled' ? resolved.config : null,
);
```

The state exposed to the view must use the config that generated the artifact, not a newer pending config.

- [ ] **Step 8: Run workbench, publish-concurrency, and copy tests**

Run: `npx vitest run tests/integration/workbench.test.ts tests/adversarial/publish-concurrency.test.ts tests/integration/publish-ui.test.ts tests/unit/clipboard/clipboard-service.test.ts`

Expected: PASS.

- [ ] **Step 9: Scan and commit**

```bash
npm run scan:secrets
git add src/ui/workbench-controller.ts tests/integration/workbench.test.ts tests/fixtures/workbench-render-state.ts
git commit -m "feat(workbench): manage live article styles"
```

---

### Task 9: Build the responsive style workbench UI

**Files:**
- Create: `src/ui/style-workbench.ts`
- Modify: `src/ui/workbench-view.ts`
- Modify: `styles.css`
- Create: `tests/unit/ui/style-workbench.test.ts`
- Modify: `tests/unit/ui/workbench-view.test.ts`
- Modify: `tests/visual/workbench-visual.test.ts`
- Modify: `tests/mocks/obsidian.ts`

**Interfaces:**
- Consumes: style fields/actions from Task 8 and `STYLE_OPTIONS` from Task 1.
- Produces: `StyleWorkbench`, responsive DOM contract, and accessible events.

- [ ] **Step 1: Write failing panel structure tests**

```ts
expect(panel.textContent).toContain('主题');
expect(panel.textContent).toContain('字体');
expect(panel.textContent).toContain('字号');
expect(panel.textContent).toContain('主题色');
expect(panel.textContent).toContain('标题');
expect(panel.textContent).toContain('代码');
expect(panel.textContent).toContain('图注');
expect(panel.textContent).toContain('段落');
expect(panel.textContent).not.toMatch(/hash|generation|CSS|校验|诊断/iu);
```

Assert all switches have `role="switch"` and `aria-checked`, theme/font/size buttons expose pressed state, selects have labels, Escape closes the overlay, and the close button restores focus to the `样式` trigger.

Add visible-message tests for `当前样式无法应用，已恢复上一次效果`, `样式尚未保存`, and the unsupported-version message. Assert raw CSS parser text, paths, hashes, and English diagnostics never enter `contentEl.textContent`.

- [ ] **Step 2: Write failing view integration tests**

Change the old `theme-trigger` expectation to `style-trigger`. Clicking it must open the panel without invoking a `Menu`. Switching to `发布设置` must hide the style panel and preview actions. Reopening preview preserves the current article configuration.

- [ ] **Step 3: Run UI tests and verify failures**

Run: `npx vitest run tests/unit/ui/style-workbench.test.ts tests/unit/ui/workbench-view.test.ts tests/visual/workbench-visual.test.ts`

Expected: FAIL because the theme menu still exists.

- [ ] **Step 4: Implement a UI-only style component**

```ts
export interface StyleWorkbenchActions {
  patch(patch: Readonly<Partial<ArticleStyleConfig>>): void;
  selectTheme(themeId: string): void;
  reset(): void;
  setGlobalDefault(): Promise<void>;
  close(): void;
}

export class StyleWorkbench {
  constructor(private readonly container: HTMLElement, private readonly actions: StyleWorkbenchActions) {}
  render(state: Readonly<WorkbenchRenderState>): void;
  focusFirst(): void;
  destroy(): void;
}
```

Render primary themes first and remaining built-in/Vault themes under `其他主题`. UI renders Chinese labels only. Effective changes fire immediately; there is no Apply/Save button. `恢复当前主题默认值` uses an Obsidian confirmation modal before invoking `reset()`; `设为全局默认` uses an explicit button and success/failure Notice.

- [ ] **Step 5: Replace the theme menu entry point**

Toolbar remains `[发文章] [复制] [样式]`. Remove `showThemeMenu()` and theme-trigger menu state. The preview panel becomes a stage containing preview canvas and style panel. Closing the panel leaves the compiled article preview intact.

- [ ] **Step 6: Add responsive CSS without viewport assumptions**

Set `container-type: inline-size` on the preview stage. At sufficient container width use `grid-template-columns: minmax(20rem, 1fr) minmax(16rem, 19rem)`. Under the approved narrow threshold, position the style panel as an opaque right overlay with a bounded width and shadow; do not shrink preview and panel into two unusable columns. Keep article theme CSS isolated under `.wechat-article`.

- [ ] **Step 7: Extend the visual contract test**

Assert CSS contains the wide grid, narrow container query, overlay positioning, bounded panel scrolling, sticky action footer, and no global `button`, `input`, `select`, `h1`, or `p` selectors outside `.wechat-workbench`.

- [ ] **Step 8: Run UI, accessibility, and layout tests**

Run: `npx vitest run tests/unit/ui/style-workbench.test.ts tests/unit/ui/workbench-view.test.ts tests/visual/workbench-visual.test.ts tests/unit/ui/workbench-publish-settings.test.ts`

Expected: PASS.

- [ ] **Step 9: Scan and commit**

```bash
npm run scan:secrets
git add src/ui/style-workbench.ts src/ui/workbench-view.ts styles.css tests/unit/ui/style-workbench.test.ts tests/unit/ui/workbench-view.test.ts tests/visual/workbench-visual.test.ts tests/mocks/obsidian.ts
git commit -m "feat(ui): add composable style workbench"
```

---

### Task 10: Wire the style workflow into preview and publish revalidation

**Files:**
- Modify: `src/main.ts`
- Create: `tests/integration/style-workbench.test.ts`
- Modify: `tests/integration/publish-ui.test.ts`
- Modify: `tests/unit/publish/publish-coordinator.test.ts`

**Interfaces:**
- Consumes: settings v2, registry, compiler, resolver, workflow, frontmatter store, controller port.
- Produces: complete app wiring and identical current-payload rebuilding for preview/copy/publish.

- [ ] **Step 1: Write a failing end-to-end in-memory style test**

The test opens an article with `wechat-style`, builds its preview, records `artifact.theme.contentHash`, copies it, and prepares a publish command. Assert all three paths reference the same theme/content hash. Then change only `primary-color` and assert the next artifact hash changes.

- [ ] **Step 2: Write a failing publish revalidation test**

Prepare a command with one style, change Frontmatter style before execution, and assert `currentPayloadHash` detects the change using the new resolved/compiled style rather than rebuilding with `themes.get(command.artifact.theme.id)` alone.

- [ ] **Step 3: Run integration tests and verify the old rebuild failure**

Run: `npx vitest run tests/integration/style-workbench.test.ts tests/unit/publish/publish-coordinator.test.ts`

Expected: FAIL because main/publish revalidation has no style resolver.

- [ ] **Step 4: Construct shared style services once in `onload()`**

```ts
const codeThemes = new CodeThemeRegistry();
const styleCompiler = new StyleCompiler(codeThemes);
const styleFrontmatter = new StyleFrontmatterStore(vaultPorts);
const styleWorkflow = new StyleWorkflow(
  themes,
  styleCompiler,
  styleFrontmatter,
  {
    get: () => ({
      defaultStyle: this.pluginSettings.defaultStyle,
      recentStyles: this.pluginSettings.recentStyles,
    }),
    update: async patch => { await updateSettings(patch); },
  },
);
```

Pass `styleWorkflow` to every `WorkbenchController`.

- [ ] **Step 5: Reuse one helper for current artifact reconstruction**

Add a local function in `main.ts`:

```ts
const buildCurrentArtifact = async (file: VaultFileRef): Promise<Readonly<RenderArtifact>> => {
  const snapshot = await snapshots.snapshot(file);
  const resolved = styleWorkflow.resolve(snapshot);
  const theme = styleWorkflow.materialize(resolved);
  return builder.build(snapshot, theme, resolved.renderMode === 'compiled' ? resolved.config : null);
};
```

Use it in publish `currentPayloadHash`. The controller uses the same workflow rules. Do not create a second style parser in publish code.

- [ ] **Step 6: Keep global settings UI unambiguous**

Remove or relabel any old “default theme” control that conflicts with `defaultStyle`. The account modal remains credentials-only. Global style defaults are changed from the style panel's explicit `设为全局默认` action; legacy `defaultThemeId` remains hidden compatibility data.

- [ ] **Step 7: Run integration, publishing, settings, and concurrency tests**

Run: `npx vitest run tests/integration/style-workbench.test.ts tests/integration/workbench.test.ts tests/integration/publish-ui.test.ts tests/unit/publish/publish-coordinator.test.ts tests/adversarial/publish-concurrency.test.ts tests/unit/settings/settings-tab.test.ts`

Expected: PASS.

- [ ] **Step 8: Scan and commit**

```bash
npm run scan:secrets
git add src/main.ts tests/integration/style-workbench.test.ts tests/integration/publish-ui.test.ts tests/unit/publish/publish-coordinator.test.ts
git commit -m "feat(style): wire preview and publish parity"
```

---

### Task 11: Add golden parity, user documentation, and release evidence

**Files:**
- Create: `tests/fixtures/articles/style-elements.md`
- Create: `tests/golden/doocs-classic.html`
- Create: `tests/golden/doocs-grace.html`
- Create: `tests/golden/doocs-simple.html`
- Create: `tests/unit/render/doocs-style-golden.test.ts`
- Modify: `docs/user-guide/themes.md`
- Modify: `README.md`
- Create: `docs/verification/style-workbench.md`
- Modify: `scripts/verify-release.mjs` if new committed runtime assets are not already covered

**Interfaces:**
- Consumes: complete feature from Tasks 1–10.
- Produces: deterministic regression fixtures, public usage documentation, and auditable verification evidence.

- [ ] **Step 1: Write a failing golden test before generating fixtures**

```ts
it.each([
  ['doocs-classic', 'tests/golden/doocs-classic.html'],
  ['doocs-grace', 'tests/golden/doocs-grace.html'],
  ['doocs-simple', 'tests/golden/doocs-simple.html'],
] as const)('matches %s golden HTML', async (themeId, goldenPath) => {
  const artifact = await buildStyleFixture(themeId);
  expect(artifact.canonicalHtml).toBe((await readFile(goldenPath, 'utf8')).trimEnd());
});
```

- [ ] **Step 2: Create the complete fixture article**

Include H1–H6, paragraphs, bold, italic, links, inline code, ordered/unordered/nested lists, quote, Obsidian callout, fenced TypeScript, table, divider, local image with alt/title, remote HTTPS image, math, and Mermaid. Use only synthetic text and repository-owned test assets.

- [ ] **Step 3: Run the golden test and verify missing-file failures**

Run: `npx vitest run tests/unit/render/doocs-style-golden.test.ts`

Expected: FAIL with missing golden files.

- [ ] **Step 4: Generate and review golden outputs**

Add a test-only `UPDATE_GOLDEN=1` branch that writes only the three named files, run it once, then visually inspect each HTML for inline font, size, primary color, headings, code, figure, and caption. Remove any accidental local path or remote code-theme URL before accepting the files. Normal test runs must never rewrite snapshots.

- [ ] **Step 5: Document user behavior and migration**

`docs/user-guide/themes.md` must explain current-article scope, auto-save, `设为全局默认`, reset behavior, three primary themes, other/custom themes, local code themes, Frontmatter key, and unsupported future-version fallback in Chinese. `README.md` adds only a concise capability summary and links the guide/third-party notice.

- [ ] **Step 6: Run full automated verification**

Run:

```bash
npm test
npm run lint
npm run scan:secrets
npm run verify:release
npm audit --omit=dev
```

Expected: all tests/typecheck/build/lint/release asset checks pass; audit reports no unresolved production vulnerability. If the audit reports a vulnerability, stop and document the exact dependency/advisory instead of suppressing it.

- [ ] **Step 7: Sync to the isolated test Vault and verify Obsidian UI**

Run: `npm run sync:test-vault`

Open only the dedicated test Vault. Verify wide side-by-side and narrow overlay layouts, keyboard focus/Escape, three primary themes, all controls, persistence after file switch and Obsidian restart, and no style controls on `发布设置`. Record Obsidian version, OS, test article, screenshots, and failures in `docs/verification/style-workbench.md`.

- [ ] **Step 8: Compare against fixed Doocs reference**

Use the same fixture content and matching options in fixed Doocs commit `fd136f79f84cf8f9c6206ef864fb318b16390171`. Capture classic/grace/simple screenshots and record element-by-element differences for headings, paragraphs, quote, lists, code, table, image, caption, and divider. Differences caused by unsupported WeChat HTML must be named, not hidden by changing the fixture.

- [ ] **Step 9: Verify real clipboard and draft output**

Copy each primary theme into the real WeChat editor and visually inspect retained formatting. Using the already authorized dedicated test account and current whitelist, create or update one draft fixture and verify the backend draft; do not perform formal send/group publish. Record media/draft identifiers only in redacted form and never commit credentials or raw tokens.

- [ ] **Step 10: Re-run final checks after evidence updates**

Run: `npm test && npm run lint && npm run scan:secrets && npm run verify:release && git diff --check`

Expected: PASS with only intended feature, documentation, golden, and verification files changed.

- [ ] **Step 11: Scan and commit**

```bash
npm run scan:secrets
git add tests/fixtures/articles/style-elements.md tests/golden/doocs-classic.html tests/golden/doocs-grace.html tests/golden/doocs-simple.html tests/unit/render/doocs-style-golden.test.ts docs/user-guide/themes.md README.md docs/verification/style-workbench.md scripts/verify-release.mjs
git commit -m "test(style): verify Doocs workbench parity"
```

---

## Final Review Gate

- [ ] Confirm `git status --short` contains no credentials, test Vault files, `.codegraph/`, or unrelated changes.
- [ ] Confirm all 11 task commits are focused and each has a preceding sensitive-information scan.
- [ ] Confirm the three Doocs themes and local code themes have attribution and no runtime CDN dependency.
- [ ] Confirm an untouched legacy article renders byte-identically until the user changes style.
- [ ] Confirm article style writes never target a newly active file after a context switch.
- [ ] Confirm an unsupported future `wechat-style` value is preserved and not overwritten automatically.
- [ ] Confirm preview, rich copy, publish preparation, and publish-time revalidation use the same style resolver/compiler.
- [ ] Confirm formal WeChat send, npm publish, git push, and community submission were not performed.
