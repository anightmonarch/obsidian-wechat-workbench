export class Plugin {}

export class Modal {
  readonly contentEl = document.createElement('div');
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
});

export class ItemView {
  readonly containerEl: HTMLElement;
  readonly contentEl: HTMLElement;

  constructor(readonly leaf: unknown) {
    this.containerEl = document.createElement('div');
    this.contentEl = document.createElement('div');
    this.containerEl.append(this.contentEl);
  }
}

export class PluginSettingTab {
  readonly containerEl = document.createElement('div');

  constructor(readonly app: unknown, readonly plugin: unknown) {}
}

export class Setting {
  constructor(readonly containerEl: HTMLElement) {}
}

export class Notice {
  constructor(_message: string) {}
}
