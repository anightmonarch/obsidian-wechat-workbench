import type { App } from 'obsidian';

import type { ArticleStyleConfig, HeadingLevel, HeadingStyle } from '../domain/style';
import type { WorkbenchRenderState } from './workbench-controller';
import { STYLE_OPTIONS } from '../styles/style-options';
import { StyleResetModal } from './style-reset-modal';

type StylePatch = Readonly<Partial<Omit<ArticleStyleConfig, 'version' | 'headingStyles'>> & {
  headingStyles?: ArticleStyleConfig['headingStyles'];
}>;

export interface StyleWorkbenchActions {
  patch(patch: StylePatch): void;
  selectTheme(themeId: string): void;
  reset(): void;
  close(): void;
}

function section(container: HTMLElement, title: string): HTMLElement {
  const node = createEl('section', { cls: 'wechat-workbench__style-section' });
  const heading = createEl('h3', { text: title, cls: 'wechat-workbench__style-heading' });
  node.append(heading);
  container.append(node);
  return node;
}

function optionButton(
  container: HTMLElement,
  label: string,
  testId: string,
  value: string,
  active: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = createEl('button', { text: label, cls: 'wechat-workbench__style-option' });
  button.type = 'button';
  button.setAttribute(`data-${testId}`, value);
  button.setAttribute('aria-pressed', String(active));
  button.addEventListener('click', onClick);
  container.append(button);
  return button;
}

interface SelectControl {
  readonly root: HTMLElement;
  readonly trigger: HTMLButtonElement;
  setValue(value: string): void;
}

function customSelect<T extends string>(
  container: HTMLElement,
  testId: string,
  options: readonly { id: T; label: string }[],
  value: string,
  onChange: (value: T) => void,
): SelectControl {
  const root = createDiv('wechat-workbench__style-select');
  root.dataset[testId] = 'true';
  const trigger = createEl('button', { cls: 'wechat-workbench__style-select-trigger' });
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const menu = createDiv('wechat-workbench__style-select-menu');
  menu.setAttribute('role', 'listbox');

  const setValue = (nextValue: string): void => {
    const selected = options.find(option => option.id === nextValue) ?? options[0];
    if (selected === undefined) return;
    trigger.textContent = selected.label;
    for (const option of menu.querySelectorAll<HTMLButtonElement>('[role="option"]')) {
      option.setAttribute('aria-selected', String(option.dataset.value === selected.id));
    }
  };

  for (const option of options) {
    const optionButtonEl = createEl('button', { text: option.label, cls: 'wechat-workbench__style-select-option' });
    optionButtonEl.type = 'button';
    optionButtonEl.dataset.value = option.id;
    optionButtonEl.setAttribute('role', 'option');
    optionButtonEl.addEventListener('click', () => {
      setValue(option.id);
      root.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      onChange(option.id);
    });
    menu.append(optionButtonEl);
  }

  trigger.addEventListener('click', event => {
    event.stopPropagation();
    const isOpen = root.classList.toggle('is-open');
    trigger.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      for (const sibling of root.parentElement?.querySelectorAll<HTMLElement>('.wechat-workbench__style-select.is-open') ?? []) {
        if (sibling === root) continue;
        sibling.classList.remove('is-open');
        sibling.querySelector('.wechat-workbench__style-select-trigger')?.setAttribute('aria-expanded', 'false');
      }
    }
  });
  trigger.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      root.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      root.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
    }
  });

  root.append(trigger, menu);
  container.append(root);
  setValue(value);
  return { root, trigger, setValue };
}

const HEADING_LEVELS: readonly HeadingLevel[] = Object.freeze(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

const HEADING_LEVEL_OPTIONS = Object.freeze(HEADING_LEVELS.map(level => Object.freeze({
  id: level,
  label: level.toUpperCase(),
})));

const SWITCH_OPTIONS = Object.freeze([
  Object.freeze({ field: 'macCodeBlock', label: 'Mac 样式' }),
  Object.freeze({ field: 'showCodeLineNumbers', label: '行号' }),
  Object.freeze({ field: 'externalLinkCitation', label: '外链转引用' }),
  Object.freeze({ field: 'paragraphIndent', label: '首行缩进' }),
  Object.freeze({ field: 'textJustify', label: '两端对齐' }),
  Object.freeze({ field: 'wordCount', label: '字数统计' }),
] as const);

export class StyleWorkbench {
  private root: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private escapeHandler: ((event: KeyboardEvent) => void) | null = null;
  private headingLevelSelect: SelectControl | null = null;
  private headingStyleSelect: SelectControl | null = null;
  private codeThemeSelect: SelectControl | null = null;
  private customColor: HTMLInputElement | null = null;
  private selectedHeadingLevel: HeadingLevel = 'h2';
  private latestConfig: Readonly<ArticleStyleConfig> | null = null;

  constructor(
    private readonly app: App,
    private readonly container: HTMLElement,
    private readonly actions: StyleWorkbenchActions,
  ) {}

  render(state: Readonly<WorkbenchRenderState>): void {
    if (this.root !== null) {
      this.update(state);
      return;
    }

    const root = createEl('aside', { cls: 'wechat-workbench__style-panel' });
    root.dataset.testid = 'style-workbench';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '文章样式');
    this.escapeHandler = event => {
      if (event.key === 'Escape') this.actions.close();
    };
    this.container.addEventListener('keydown', this.escapeHandler);
    this.root = root;

    const header = createEl('header', { cls: 'wechat-workbench__style-header' });
    header.append(createEl('h2', { text: '文章样式' }));
    const close = createEl('button', { text: '关闭', cls: 'wechat-workbench__style-close' });
    close.type = 'button';
    close.setAttribute('aria-label', '关闭样式面板');
    close.addEventListener('click', () => this.actions.close());
    header.append(close);
    root.append(header);

    const body = createDiv('wechat-workbench__style-body');
    this.body = body;
    const config = state.style.config;
    const activeThemeId = state.style.themeId;
    this.latestConfig = config;

    const themeSection = section(body, '主题');
    const primaryThemes = createDiv('wechat-workbench__style-options wechat-workbench__style-themes');
    for (const option of STYLE_OPTIONS.themes) {
      optionButton(primaryThemes, option.label, 'style-theme', option.id, activeThemeId === option.id, () => this.actions.selectTheme(option.id));
    }
    themeSection.append(primaryThemes);

    const fontSection = section(body, '字体');
    const fonts = createDiv('wechat-workbench__style-options wechat-workbench__style-fonts');
    for (const option of STYLE_OPTIONS.fonts) {
      optionButton(fonts, option.label, 'style-font', option.id, config.fontFamily === option.id, () => {
        this.actions.patch({ fontFamily: option.id });
      });
    }
    fontSection.append(fonts);

    const sizeSection = section(body, '字号');
    const sizes = createDiv('wechat-workbench__style-options wechat-workbench__style-sizes');
    for (const size of STYLE_OPTIONS.fontSizes) {
      optionButton(sizes, `${size}px`, 'style-size', String(size), config.fontSize === size, () => {
        this.actions.patch({ fontSize: size });
      });
    }
    sizeSection.append(sizes);

    const colorSection = section(body, '主题色');
    const colors = createDiv('wechat-workbench__style-options wechat-workbench__style-colors');
    for (const option of STYLE_OPTIONS.colors) {
      const button = optionButton(colors, option.label, 'style-color', option.id, config.primaryColor === option.id, () => {
        this.actions.patch({ primaryColor: option.id });
      });
      button.style.setProperty('--wechat-style-color', option.id);
      const dot = createSpan({ cls: 'wechat-workbench__style-color-dot' });
      button.prepend(dot);
    }
    colorSection.append(colors);

    const customColorSection = section(body, '自定义色');
    const customColor = createEl('input', { cls: 'wechat-workbench__style-custom-color' });
    customColor.type = 'color';
    customColor.dataset.testid = 'style-custom-color';
    customColor.setAttribute('aria-label', '自定义主题色');
    customColor.value = config.primaryColor.toLowerCase();
    customColor.addEventListener('input', () => {
      this.actions.patch({ primaryColor: customColor.value.toUpperCase() });
    });
    this.customColor = customColor;
    customColorSection.append(customColor);

    const headingSection = section(body, '标题');
    const headingSelectRow = createDiv('wechat-workbench__style-select-row');
    this.headingLevelSelect = customSelect(
      headingSelectRow,
      'styleHeadingLevel',
      HEADING_LEVEL_OPTIONS,
      this.selectedHeadingLevel,
      value => {
        this.selectedHeadingLevel = value;
        this.headingStyleSelect?.setValue(this.latestConfig?.headingStyles[this.selectedHeadingLevel] ?? 'default');
      },
    );
    this.headingStyleSelect = customSelect(
      headingSelectRow,
      'styleHeadingStyle',
      STYLE_OPTIONS.headingStyles,
      config.headingStyles[this.selectedHeadingLevel] ?? 'default',
      (value: HeadingStyle) => this.actions.patch({ headingStyles: { [this.selectedHeadingLevel]: value } }),
    );
    headingSection.append(headingSelectRow);

    const codeSection = section(body, '代码主题');
    this.codeThemeSelect = customSelect(
      codeSection,
      'styleCodeTheme',
      STYLE_OPTIONS.codeThemes,
      config.codeThemeId,
      value => this.actions.patch({ codeThemeId: value }),
    );

    const imageSection = section(body, '图注');
    const captions = createDiv('wechat-workbench__style-options wechat-workbench__style-captions');
    for (const option of STYLE_OPTIONS.captionModes) {
      optionButton(captions, option.label, 'style-caption', option.id, config.imageCaption === option.id, () => {
        this.actions.patch({ imageCaption: option.id });
      });
    }
    imageSection.append(captions);

    const switches = createDiv('wechat-workbench__style-switches wechat-workbench__style-switch-list');
    for (const option of SWITCH_OPTIONS) {
      const row = createEl('button', { cls: 'wechat-workbench__style-switch wechat-workbench__style-toggle-row' });
      row.type = 'button';
      row.dataset.styleSwitch = option.label;
      row.dataset.styleField = option.field;
      row.setAttribute('role', 'switch');
      const checked = config[option.field];
      row.setAttribute('aria-checked', String(checked));
      row.append(createSpan({ text: option.label }), createSpan({ cls: 'wechat-workbench__style-switch-indicator' }));
      row.addEventListener('click', () => {
        const next = row.getAttribute('aria-checked') !== 'true';
        row.setAttribute('aria-checked', String(next));
        this.actions.patch({ [option.field]: next });
      });
      switches.append(row);
    }
    body.append(switches);

    root.append(body);
    const operation = section(body, '操作');
    const reset = createEl('button', { text: '重置', cls: 'wechat-workbench__style-reset' });
    reset.type = 'button';
    reset.dataset.styleReset = 'true';
    reset.addEventListener('click', () => new StyleResetModal(this.app, () => this.actions.reset()).open());
    operation.append(reset);
    this.container.append(root);
  }

  update(state: Readonly<WorkbenchRenderState>): void {
    if (this.root === null) return this.render(state);

    const config = state.style.config;
    this.latestConfig = config;
    this.root.querySelectorAll<HTMLButtonElement>('[data-style-theme]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.styleTheme === state.style.themeId));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-style-font]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.styleFont === config.fontFamily));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-style-size]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.styleSize === String(config.fontSize)));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-style-color]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.styleColor === config.primaryColor));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-style-switch]').forEach(button => {
      const field = button.dataset.styleField as keyof ArticleStyleConfig | undefined;
      if (field !== undefined && typeof config[field] === 'boolean') {
        button.setAttribute('aria-checked', String(config[field]));
      }
    });
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-style-caption]')) {
      button.setAttribute('aria-pressed', String(button.dataset.styleCaption === config.imageCaption));
    }
    this.customColor?.setAttribute('value', config.primaryColor.toLowerCase());
    if (this.customColor !== null) this.customColor.value = config.primaryColor.toLowerCase();
    this.headingStyleSelect?.setValue(config.headingStyles[this.selectedHeadingLevel] ?? 'default');
    this.codeThemeSelect?.setValue(config.codeThemeId);
  }

  focusFirst(): void {
    this.root?.querySelector<HTMLElement>('button, select')?.focus();
  }

  destroy(): void {
    if (this.escapeHandler !== null) this.container.removeEventListener('keydown', this.escapeHandler);
    this.escapeHandler = null;
    this.root?.remove();
    this.root = null;
    this.body = null;
    this.headingLevelSelect = null;
    this.headingStyleSelect = null;
    this.codeThemeSelect = null;
    this.customColor = null;
    this.latestConfig = null;
  }
}
