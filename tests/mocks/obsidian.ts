export class Plugin {}

Object.assign(globalThis, {
  createEl: <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] => (
    document.createElement(tag)
  ),
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
