import { Notice } from 'obsidian';

import type { ArticleStyleConfig, HeadingStyle, ImageCaptionMode } from '../domain/style';
import type { WorkbenchRenderState } from './workbench-controller';
import { STYLE_OPTIONS } from '../styles/style-options';

type StylePatch = Readonly<Partial<Omit<ArticleStyleConfig, 'version' | 'headingStyles'>> & {
  headingStyles?: ArticleStyleConfig['headingStyles'];
}>;

export interface StyleWorkbenchActions {
  patch(patch: StylePatch): void;
  selectTheme(themeId: string): void;
  reset(): void;
  setGlobalDefault(): Promise<void>;
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
  active: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = createEl('button', { text: label, cls: 'wechat-workbench__style-option' });
  button.type = 'button';
  button.setAttribute(`data-${testId}`, label);
  button.setAttribute('aria-pressed', String(active));
  button.addEventListener('click', onClick);
  container.append(button);
  return button;
}

function labeledSelect<T extends string>(
  container: HTMLElement,
  labelText: string,
  value: string,
  options: readonly { id: T; label: string }[],
  onChange: (value: T) => void,
): HTMLSelectElement {
  const label = createEl('label', { cls: 'wechat-workbench__style-select-label' });
  label.append(createSpan({ text: labelText }));
  const select = createEl('select');
  select.setAttribute('aria-label', labelText);
  for (const option of options) {
    const element = createEl('option');
    element.value = option.id;
    element.textContent = option.label;
    element.selected = option.id === value;
    select.append(element);
  }
  select.addEventListener('change', () => onChange(select.value as T));
  label.append(select);
  container.append(label);
  return select;
}

function switchControl(
  container: HTMLElement,
  label: string,
  checked: boolean,
  onToggle: (checked: boolean) => void,
): HTMLButtonElement {
  const button = createEl('button', { cls: 'wechat-workbench__style-switch' });
  button.type = 'button';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-checked', String(checked));
  button.append(createSpan({ text: label }));
  const indicator = createSpan({ cls: 'wechat-workbench__style-switch-indicator' });
  indicator.setAttribute('aria-hidden', 'true');
  button.append(indicator);
  button.addEventListener('click', () => {
    const next = button.getAttribute('aria-checked') !== 'true';
    button.setAttribute('aria-checked', String(next));
    onToggle(next);
  });
  container.append(button);
  return button;
}

export class StyleWorkbench {
  private root: HTMLElement | null = null;
  private escapeHandler: ((event: KeyboardEvent) => void) | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly actions: StyleWorkbenchActions,
  ) {}

  render(state: Readonly<WorkbenchRenderState>): void {
    this.destroy();
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

    const body = createDiv({ cls: 'wechat-workbench__style-body' });
    const config = state.style.config;
    const activeThemeId = state.style.themeId;
    const themes = new Map(state.themes.map(theme => [theme.manifest.id, theme.manifest.name]));
    for (const option of STYLE_OPTIONS.themes) themes.set(option.id, option.label);

    const themeSection = section(body, '主题');
    const primaryThemes = createDiv({ cls: 'wechat-workbench__style-options' });
    for (const option of STYLE_OPTIONS.themes) {
      const button = optionButton(primaryThemes, option.label, 'style-theme', activeThemeId === option.id, () => this.actions.selectTheme(option.id));
      button.dataset.styleTheme = option.id;
    }
    themeSection.append(primaryThemes);
    const otherThemes = [...themes.entries()]
      .filter(([id]) => !STYLE_OPTIONS.themes.some(option => option.id === id));
    if (otherThemes.length > 0) {
      const otherLabel = createSpan({ text: '其他主题', cls: 'wechat-workbench__style-subheading' });
      themeSection.append(otherLabel);
      const otherOptions = createDiv({ cls: 'wechat-workbench__style-options' });
      for (const [id, label] of otherThemes) {
        const button = optionButton(otherOptions, label, 'style-theme', activeThemeId === id, () => this.actions.selectTheme(id));
        button.dataset.styleTheme = id;
      }
      themeSection.append(otherOptions);
    }

    const fontSection = section(body, '字体');
    const fonts = createDiv({ cls: 'wechat-workbench__style-options' });
    for (const option of STYLE_OPTIONS.fonts) {
      const button = optionButton(fonts, option.label, 'style-font', config.fontFamily === option.id, () => {
        this.actions.patch({ fontFamily: option.id });
      });
      button.dataset.styleFont = option.id;
    }
    fontSection.append(fonts);

    const sizeSection = section(body, '字号');
    const sizes = createDiv({ cls: 'wechat-workbench__style-options' });
    for (const size of STYLE_OPTIONS.fontSizes) {
      const button = optionButton(sizes, `${size}px`, 'style-size', config.fontSize === size, () => {
        this.actions.patch({ fontSize: size });
      });
      button.dataset.styleSize = String(size);
    }
    sizeSection.append(sizes);

    const colorSection = section(body, '主题色');
    const colors = createDiv({ cls: 'wechat-workbench__style-colors' });
    for (const option of STYLE_OPTIONS.colors) {
      const button = optionButton(colors, option.label, 'style-color', config.primaryColor === option.id, () => {
        this.actions.patch({ primaryColor: option.id });
      });
      button.dataset.styleColor = option.id;
      button.style.setProperty('--wechat-style-color', option.id);
    }
    colorSection.append(colors);

    const headingSection = section(body, '标题');
    for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
      labeledSelect(
        headingSection,
        level.toUpperCase(),
        config.headingStyles[level] ?? 'default',
        STYLE_OPTIONS.headingStyles,
        (value: HeadingStyle) => this.actions.patch({ headingStyles: { [level]: value } }),
      );
    }

    const codeSection = section(body, '代码');
    labeledSelect(codeSection, '高亮主题', config.codeThemeId, STYLE_OPTIONS.codeThemes, value => this.actions.patch({ codeThemeId: value }));
    switchControl(codeSection, '显示行号', config.showCodeLineNumbers, checked => this.actions.patch({ showCodeLineNumbers: checked }));
    switchControl(codeSection, 'Mac 窗口样式', config.macCodeBlock, checked => this.actions.patch({ macCodeBlock: checked }));

    const imageSection = section(body, '图注');
    labeledSelect(imageSection, '图片说明', config.imageCaption, STYLE_OPTIONS.captionModes, (value: ImageCaptionMode) => this.actions.patch({ imageCaption: value }));

    const paragraphSection = section(body, '段落');
    switchControl(paragraphSection, '首行缩进', config.paragraphIndent, checked => this.actions.patch({ paragraphIndent: checked }));
    switchControl(paragraphSection, '两端对齐', config.textJustify, checked => this.actions.patch({ textJustify: checked }));

    if (state.style.unsupportedVersion !== null) {
      const message = createEl('p', { text: '当前文章样式来自更高版本，请升级插件后再修改。', cls: 'wechat-workbench__style-message' });
      body.prepend(message);
    } else if (state.styleSaveStatus === 'unsaved') {
      body.prepend(createEl('p', { text: '样式尚未保存', cls: 'wechat-workbench__style-message' }));
    } else if (state.styleSaveStatus === 'saving') {
      body.prepend(createEl('p', { text: '正在保存样式', cls: 'wechat-workbench__style-message' }));
    }
    root.append(body);

    const footer = createEl('footer', { cls: 'wechat-workbench__style-footer' });
    const reset = createEl('button', { text: '恢复当前主题默认值' });
    reset.type = 'button';
    reset.addEventListener('click', () => this.actions.reset());
    const global = createEl('button', { text: '设为全局默认' });
    global.type = 'button';
    global.addEventListener('click', () => {
      void this.actions.setGlobalDefault()
        .then(() => new Notice('已设为全局默认样式'))
        .catch(() => new Notice('设置全局默认样式失败'));
    });
    footer.append(reset, global);
    root.append(footer);
    this.container.append(root);
  }

  focusFirst(): void {
    this.root?.querySelector<HTMLElement>('button, select')?.focus();
  }

  destroy(): void {
    if (this.escapeHandler !== null) this.container.removeEventListener('keydown', this.escapeHandler);
    this.escapeHandler = null;
    this.root?.remove();
    this.root = null;
  }
}
