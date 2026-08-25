export class Plugin {}

export async function requestUrl(): Promise<never> {
  throw new Error('requestUrl test mock must be injected explicitly.');
}

export class Modal {
  readonly contentEl = document.createElement('div');
  readonly modalEl = document.createElement('div');
  readonly titleEl = document.createElement('h2');

  constructor(readonly app: unknown) {}
  open(): void { this.onOpen(); }
  close(): void {}
  onOpen(): void {}
}

Object.assign(globalThis, {
  createEl: <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options?: { text?: string; cls?: string },
  ): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    if (options?.text !== undefined) node.textContent = options.text;
    if (options?.cls !== undefined) node.className = options.cls;
    return node;
  },
  createDiv: (className?: string): HTMLDivElement => {
    const node = document.createElement('div');
    if (className !== undefined) node.className = className;
    return node;
  },
  createSpan: (options?: string | { text?: string; cls?: string }): HTMLSpanElement => {
    const node = document.createElement('span');
    if (typeof options === 'string') node.className = options;
    if (typeof options === 'object' && options !== null) {
      if (options.text !== undefined) node.textContent = options.text;
      if (options.cls !== undefined) node.className = options.cls;
    }
    return node;
  },
});

export class ItemView {
  readonly containerEl: HTMLElement;
  readonly contentEl: HTMLElement;

  constructor(readonly leaf: unknown) {
    this.containerEl = document.createElement('div');
    this.contentEl = document.createElement('div');
    this.containerEl.append(this.contentEl);
  }

  registerDomEvent(
    target: EventTarget,
    event: string,
    callback: EventListener,
  ): void {
    target.addEventListener(event, callback);
  }
}

export class PluginSettingTab {
  readonly containerEl = document.createElement('div');

  constructor(readonly app: unknown, readonly plugin: unknown) {}
}

export class TextComponent {
  readonly inputEl = document.createElement('input');

  constructor() {}

  setPlaceholder(value: string): this {
    this.inputEl.placeholder = value;
    return this;
  }

  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }

  onChange(callback: (value: string) => void): this {
    this.inputEl.addEventListener('change', () => callback(this.inputEl.value));
    return this;
  }
}

export class ButtonComponent {
  readonly buttonEl = document.createElement('button');

  setButtonText(value: string): this {
    this.buttonEl.textContent = value;
    return this;
  }

  setCta(): this { return this; }

  onClick(callback: () => void): this {
    this.buttonEl.addEventListener('click', () => callback());
    return this;
  }
}

export class DropdownComponent {
  readonly selectEl = document.createElement('select');

  constructor(_containerEl?: HTMLElement) {}

  addOption(value: string, text: string): this {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    this.selectEl.append(option);
    return this;
  }

  setValue(value: string): this {
    this.selectEl.value = value;
    return this;
  }

  onChange(callback: (value: string) => void): this {
    this.selectEl.addEventListener('change', () => callback(this.selectEl.value));
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.selectEl.disabled = disabled;
    return this;
  }
}

export class Setting {
  readonly settingEl = document.createElement('div');

  constructor(readonly containerEl: HTMLElement) {
    this.containerEl.append(this.settingEl);
  }

  setName(value: string): this {
    const name = document.createElement('strong');
    name.textContent = value;
    this.settingEl.append(name);
    return this;
  }

  setDesc(value: string): this {
    const desc = document.createElement('small');
    desc.textContent = value;
    this.settingEl.append(desc);
    return this;
  }

  addText(builder: (component: TextComponent) => unknown): this {
    const component = new TextComponent();
    this.settingEl.append(component.inputEl);
    builder(component);
    return this;
  }

  addButton(builder: (component: ButtonComponent) => unknown): this {
    const component = new ButtonComponent();
    this.settingEl.append(component.buttonEl);
    builder(component);
    return this;
  }

  addDropdown(builder: (component: DropdownComponent) => unknown): this {
    const component = new DropdownComponent();
    this.settingEl.append(component.selectEl);
    builder(component);
    return this;
  }
}

export class Notice {
  constructor(_message: string) {}
}

export class MenuItem {
  title = '';
  checked = false;
  callback: (() => void) | null = null;

  setTitle(title: string): this {
    this.title = title;
    return this;
  }

  setChecked(checked: boolean | null): this {
    this.checked = checked === true;
    return this;
  }

  setIcon(_icon: string): this { return this; }

  onClick(callback: () => void): this {
    this.callback = callback;
    return this;
  }
}

export class Menu {
  static last: Menu | null = null;
  readonly items: MenuItem[] = [];

  constructor() { Menu.last = this; }

  addItem(builder: (item: MenuItem) => void): this {
    const item = new MenuItem();
    builder(item);
    this.items.push(item);
    return this;
  }

  showAtMouseEvent(_event: MouseEvent): this { return this; }
}

export function setIcon(target: HTMLElement, icon: string): void {
  target.dataset.icon = icon;
}
