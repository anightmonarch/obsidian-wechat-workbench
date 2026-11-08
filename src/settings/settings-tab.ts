import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  setIcon,
  type SettingDefinitionItem,
} from 'obsidian';

import {
  aiProvidersFor,
  type AiProviderId,
  type AiServiceKind,
  type GenerationBackend,
  type PluginSettings,
  type WeChatConnectionMode,
} from './model';
import type { AccountConnectionService } from './account-connection-service';
import type { AiServiceSettingsService } from './ai-service-settings';
import type { SecretKind, SecretStatus, SecretStore } from './secret-store';
import { AccountDisconnectModal } from '../ui/account-disconnect-modal';
import { PublicError } from '../wechat/errors';
import type { CodexCapabilityPort } from '../codex/codex-capability-service';

export interface SettingsAccess {
  get(): Readonly<PluginSettings>;
  update(patch: Partial<PluginSettings>): Promise<Readonly<PluginSettings>>;
}

export interface SecretSettingRow {
  kind: Extract<SecretKind, 'appSecret' | 'textApiKey' | 'imageApiKey'>;
  label: string;
  status: '已配置' | '未配置';
  inputValue: '';
}

export interface SettingsPresentation {
  appIdValue: string;
  textProvider: AiProviderId | null;
  imageProvider: AiProviderId | null;
  secretRows: SecretSettingRow[];
}

type ObsidianDomWindow = Window & {
  createDiv(className?: string): HTMLDivElement;
  createEl(tag: 'button', options?: { text?: string }): HTMLButtonElement;
};

export function buildSettingsPresentation(
  settings: Readonly<PluginSettings>,
  status: SecretStatus,
): SettingsPresentation {
  return {
    appIdValue: settings.appId,
    textProvider: settings.aiProviders.text.activeProvider,
    imageProvider: settings.aiProviders.image.activeProvider,
    secretRows: [
      {
        kind: 'appSecret',
        label: 'AppSecret',
        status: status.appSecret ? '已配置' : '未配置',
        inputValue: '',
      },
      {
        kind: 'textApiKey',
        label: '文本 API Key',
        status: status.textApiKey ? '已配置' : '未配置',
        inputValue: '',
      },
      {
        kind: 'imageApiKey',
        label: '图片 API Key',
        status: status.imageApiKey ? '已配置' : '未配置',
        inputValue: '',
      },
    ],
  };
}

export class WeChatWorkbenchSettingTab extends PluginSettingTab {
  private disposeAiSection: (() => void) | null = null;

  constructor(
    app: App,
    plugin: Plugin,
    private readonly settings: SettingsAccess,
    private readonly secrets: SecretStore,
    private readonly connection: AccountConnectionService,
    private readonly aiService: AiServiceSettingsService,
    private readonly copyText: (value: string) => void = () => undefined,
    private readonly openConsole: () => Promise<void> = async () => undefined,
    private readonly codex?: CodexCapabilityPort,
  ) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: '微信公众号',
        desc: '配置公众号名称、AppID、AppSecret，验证连接并管理 IP 白名单。',
        aliases: ['公众号账号', 'AppID', 'AppSecret', 'IP 白名单', '验证连接', '连接模式', '公共中转', '本地直连'],
        searchable: true,
        render: setting => {
          setting.settingEl.addClass('wechat-workbench-settings__definition-host');
          setting.settingEl.replaceChildren();
          setting.settingEl.append(createEl('h2', {
            cls: 'wechat-workbench-settings__section-title',
            text: '微信公众号',
          }));
          this.renderAccountSection(setting.settingEl);
        },
      },
      {
        name: 'AI 内容生成',
        desc: '配置文本和图片模型的服务地址、API Key 与模型。',
        aliases: ['AI 服务', '文本模型', '图片模型', 'Base URL', 'API Key', '模型'],
        searchable: true,
        render: setting => {
          setting.settingEl.addClass('wechat-workbench-settings__definition-host');
          setting.settingEl.replaceChildren();
          this.renderAiServiceSection(setting.settingEl);
          return () => {
            this.disposeAiSection?.();
            this.disposeAiSection = null;
          };
        },
      },
    ];
  }

  display(): void {
    this.disposeAiSection?.();
    this.disposeAiSection = null;
    this.containerEl.replaceChildren();

    const heading = createEl('h2', {
      cls: 'wechat-workbench-settings__section-title',
      text: '微信公众号',
    });
    this.containerEl.append(heading);

    this.renderAccountSection(this.containerEl);
    this.renderAiServiceSection(this.containerEl);
  }

  private renderAiServiceSection(container: HTMLElement, includeHeading = true): void {
    if (includeHeading) {
      const heading = createEl('h2', {
        cls: 'wechat-workbench-settings__section-title',
        text: 'AI 内容生成',
      });
      container.append(heading);
    }
    const shell = createDiv('wechat-workbench-settings__ai-shell');
    const modes = createDiv('wechat-workbench-settings__ai-modes');
    const content = createDiv('wechat-workbench-settings__ai-mode-content');
    let disposeMode: (() => void) | null = null;
    const renderMode = (kind: AiServiceKind): void => {
      disposeMode?.();
      disposeMode = null;
      modes.replaceChildren();
      content.replaceChildren();
      for (const item of [
        { kind: 'text' as const, label: '文本模型配置', description: '用于发布设置中的生成标题、生成摘要' },
        { kind: 'image' as const, label: '图片模型配置', description: '用于发布设置中的智能生成封面' },
      ]) {
        const button = createEl('button', { text: item.label });
        button.type = 'button';
        button.dataset.testid = `ai-mode-${item.kind}`;
        button.classList.toggle('is-active', item.kind === kind);
        button.addEventListener('click', () => renderMode(item.kind));
        modes.append(button);
      }
      content.append(createEl('p', {
        cls: 'wechat-workbench-settings__ai-mode-description',
        text: kind === 'text' ? '用于发布设置中的生成标题、生成摘要。' : '用于发布设置中的智能生成封面。',
      }));
      disposeMode = appendAiBackendPanel(
        content,
        kind,
        this.settings,
        this.secrets,
        this.aiService,
        this.codex,
      );
    };
    shell.append(modes, content);
    container.append(shell);
    renderMode('text');
    this.disposeAiSection = () => {
      disposeMode?.();
      disposeMode = null;
    };
  }

  hide(): void {
    this.disposeAiSection?.();
    this.disposeAiSection = null;
  }

  private refreshSettings(): void {
    const modernUpdate = Reflect.get(this, 'update') as unknown;
    if (typeof modernUpdate === 'function') modernUpdate.call(this);
    else this.display();
  }

  private renderAccountSection(container: HTMLElement): void {
    const current = this.settings.get();
    let displayName = current.accountDisplayName;
    let appId = current.appId;
    let appSecret = this.secrets.get('appSecret') ?? '';
    let connectionMode: WeChatConnectionMode = current.connectionMode;
    let relayBaseUrl = current.wechatRelayBaseUrl;
    let relayAccessKey = current.wechatRelayAccessKey;
    let relaySecret = this.secrets.get('wechatProxySecret') ?? '';
    let pending = false;
    const status = this.connection.snapshot();
    const accountCard = createDiv('wechat-workbench-settings__account-card');
    accountCard.dataset.testid = 'account-card';

    const modeSelector = createDiv('wechat-workbench-settings__connection-mode');
    for (const item of [
      { id: 'local' as const, label: '本地直连' },
      { id: 'relay' as const, label: '自定义中转' },
    ]) {
      const modeButton = createEl('button', { text: item.label });
      modeButton.type = 'button';
      modeButton.dataset.testid = `connection-mode-${item.id}`;
      modeButton.classList.toggle('is-active', connectionMode === item.id);
      modeButton.addEventListener('click', () => {
        if (connectionMode === item.id) return;
        connectionMode = item.id;
        renderConnectionTip();
        renderRelayFields();
        for (const child of Array.from(modeSelector.children)) {
          const el = child as HTMLElement;
          el.classList.toggle(
            'is-active',
            el.dataset.testid === `connection-mode-${item.id}`,
          );
        }
      });
      modeSelector.append(modeButton);
    }
    accountCard.append(modeSelector);

    const statusBlock = createDiv('wechat-workbench-settings__account-status');
    statusBlock.dataset.testid = 'account-status';
    renderAccountStatus(statusBlock, status, this.copyText);
    accountCard.append(statusBlock);

    new Setting(accountCard)
      .setName('公众号名称')
      .addText(text => {
        text.inputEl.dataset.testid = 'account-name';
        text.setValue(displayName).onChange(value => { displayName = value; });
      });

    new Setting(accountCard)
      .setName('AppID')
      .addText(text => {
        text.inputEl.dataset.testid = 'account-app-id';
        text.setValue(appId).onChange(value => { appId = value; });
      });

    let appSecretInput!: HTMLInputElement;
    new Setting(accountCard)
      .setName('AppSecret')
      .addText(text => {
        text.inputEl.type = 'password';
        text.inputEl.dataset.testid = 'account-secret';
        text.inputEl.placeholder = '请输入 AppSecret';
        text.setValue(appSecret).onChange(value => { appSecret = value; });
        appSecretInput = text.inputEl;
      });
    const appSecretControl = createDiv('wechat-workbench-settings__account-secret-control');
    appSecretInput.replaceWith(appSecretControl);
    const appSecretToggle = createEl('button', { cls: 'wechat-workbench-settings__account-secret-toggle' });
    appSecretToggle.type = 'button';
    appSecretToggle.dataset.testid = 'account-secret-toggle';
    appSecretToggle.setAttribute('aria-label', '显示 AppSecret');
    setIcon(appSecretToggle, 'eye');
    appSecretToggle.addEventListener('click', () => {
      const isHidden = appSecretInput.type === 'password';
      appSecretInput.type = isHidden ? 'text' : 'password';
      appSecretToggle.setAttribute('aria-label', isHidden ? '隐藏 AppSecret' : '显示 AppSecret');
      setIcon(appSecretToggle, isHidden ? 'eye-off' : 'eye');
    });
    appSecretControl.append(appSecretInput, appSecretToggle);

    const relayFields = createDiv('wechat-workbench-settings__relay-fields');
    relayFields.dataset.testid = 'relay-fields';
    const renderRelayFields = (): void => {
      relayFields.replaceChildren();
      if (connectionMode !== 'relay') return;
      const warning = createDiv('wechat-workbench-settings__relay-warning');
      warning.append(createSpan({
        text: '自定义中转的地址与凭据由你自行配置并保管。中转以明文 HTTP 传输时，AppID/AppSecret 与 API 请求将经过该服务器，请自行评估传输安全（建议为中转配置 HTTPS）。',
      }));
      relayFields.append(warning);
      new Setting(relayFields)
        .setName('中转地址')
        .addText(text => {
          text.inputEl.dataset.testid = 'relay-base-url';
          text.inputEl.placeholder = '例如 http://your-relay.example.com:18080';
          text.setValue(relayBaseUrl).onChange(value => { relayBaseUrl = value; });
        });
      new Setting(relayFields)
        .setName('中转访问 key')
        .addText(text => {
          text.inputEl.dataset.testid = 'relay-access-key';
          text.setValue(relayAccessKey).onChange(value => { relayAccessKey = value; });
        });
      new Setting(relayFields)
        .setName('中转 secret')
        .addText(text => {
          text.inputEl.type = 'password';
          text.inputEl.dataset.testid = 'relay-secret';
          text.inputEl.placeholder = '留空表示中转不校验 secret';
          text.setValue(relaySecret).onChange(value => { relaySecret = value; });
        });
    };
    renderRelayFields();
    accountCard.append(relayFields);

    const tip = createDiv('wechat-workbench-settings__connection-tip');
    tip.dataset.testid = 'connection-tip';
    const renderConnectionTip = (): void => {
      tip.replaceChildren();
      tip.className = 'wechat-workbench-settings__connection-tip';
      tip.dataset.testid = 'connection-tip';
      if (connectionMode === 'relay') {
        tip.classList.add('wechat-workbench-settings__connection-tip--public');
        tip.append(createSpan({
          text: relayBaseUrl.trim().length === 0
            ? '尚未填写中转地址，连接将回落为本地直连。'
            : '请求将经过你配置的自定义中转服务器，请确认其传输安全。',
        }));
        return;
      }
      tip.classList.add('wechat-workbench-settings__connection-tip--local');
      const ip = this.connection.snapshot().whitelistIp;
      tip.append(createSpan({
        text: ip === null
          ? '验证连接后显示出口 IP。将此 IP 加入公众号平台 IP 白名单。'
          : `出口 IP ${ip}。将此 IP 加入公众号平台 IP 白名单。`,
      }));
      if (ip !== null) {
        const copy = createEl('button', { text: '复制 IP' });
        copy.type = 'button';
        copy.dataset.testid = 'connection-tip-copy-ip';
        copy.addEventListener('click', () => {
          this.copyText(ip);
          new Notice('IP 已复制');
        });
        tip.append(copy);
      }
    };
    renderConnectionTip();
    accountCard.append(tip);

    const openConsoleButton = createEl('button', { text: '打开公众号后台' });
    openConsoleButton.type = 'button';
    openConsoleButton.dataset.testid = 'account-open-console';
    openConsoleButton.addEventListener('click', () => {
      void this.openConsole().catch(() => {
        new Notice('无法打开公众号后台，请在浏览器访问 mp.weixin.qq.com。');
      });
    });

    const saveButton = createEl('button', { text: '保存账号配置' });
    saveButton.dataset.testid = 'account-save';
    saveButton.addEventListener('click', () => {
      displayName = (this.containerEl.querySelector<HTMLInputElement>('[data-testid="account-name"]') ?? { value: displayName }).value;
      appId = (this.containerEl.querySelector<HTMLInputElement>('[data-testid="account-app-id"]') ?? { value: appId }).value;
      appSecret = (this.containerEl.querySelector<HTMLInputElement>('[data-testid="account-secret"]') ?? { value: appSecret }).value;
      relayBaseUrl = (this.containerEl.querySelector<HTMLInputElement>('[data-testid="relay-base-url"]') ?? { value: relayBaseUrl }).value;
      relayAccessKey = (this.containerEl.querySelector<HTMLInputElement>('[data-testid="relay-access-key"]') ?? { value: relayAccessKey }).value;
      relaySecret = (this.containerEl.querySelector<HTMLInputElement>('[data-testid="relay-secret"]') ?? { value: relaySecret }).value;
      void (async () => {
        if (pending) return;
        pending = true;
        try {
          await this.connection.save({ displayName, appId, appSecret });
          if (relaySecret.length > 0) this.secrets.set('wechatProxySecret', relaySecret);
          else this.secrets.set('wechatProxySecret', '');
          await this.settings.update({
            connectionMode,
            wechatRelayBaseUrl: relayBaseUrl.trim(),
            wechatRelayAccessKey: relayAccessKey.trim(),
          });
          this.refreshSettings();
        } finally {
          pending = false;
        }
      })();
    });

    const verifyButton = createEl('button', {
      text: status.state === 'CONNECTED' || status.state === 'FAILED' ? '重新验证' : '验证连接',
    });
    verifyButton.dataset.testid = 'account-verify';
    verifyButton.addEventListener('click', () => {
      void (async () => {
        if (pending) return;
        pending = true;
        saveButton.disabled = true;
        verifyButton.disabled = true;
        disconnectButton.disabled = true;
        verifyButton.textContent = '验证中…';
        renderAccountStatus(statusBlock, {
          state: 'VERIFYING', verifiedAt: null, errorCode: null, errcode: null, whitelistIp: null,
        }, this.copyText);
        try {
          await this.connection.verify();
          this.refreshSettings();
        } catch (error) {
          const unconfigured = error instanceof PublicError
            && error.code === 'WECHAT_ACCOUNT_NOT_CONFIGURED';
          renderAccountStatus(statusBlock, {
            ...this.connection.snapshot(),
            state: unconfigured ? 'UNCONFIGURED' : 'FAILED',
          }, this.copyText, unconfigured
            ? '请先填写并保存 AppSecret，再验证连接。'
            : '验证失败，请检查网络或公众号配置后重试。');
          saveButton.disabled = false;
          verifyButton.disabled = false;
          verifyButton.textContent = status.state === 'CONNECTED' || status.state === 'FAILED'
            ? '重新验证'
            : '验证连接';
          disconnectButton.disabled = false;
        } finally {
          pending = false;
        }
      })();
    });

    const disconnectButton = createEl('button', { text: '断开连接' });
    disconnectButton.dataset.testid = 'account-disconnect';
    disconnectButton.addEventListener('click', () => {
      if (pending) return;
      new AccountDisconnectModal(this.app, async () => {
        pending = true;
        disconnectButton.disabled = true;
        try {
          await this.connection.disconnect();
          this.refreshSettings();
        } finally {
          pending = false;
        }
      }).open();
    });

    const actions = createDiv('wechat-workbench-settings__actions');
    actions.append(saveButton, verifyButton, disconnectButton, openConsoleButton);
    accountCard.append(actions);
    container.append(accountCard);
  }

}

function selectedBackend(settings: Readonly<PluginSettings>, kind: AiServiceKind): GenerationBackend {
  return kind === 'text' ? settings.textGenerationBackend : settings.imageGenerationBackend;
}

const LOCAL_CODEX_LABEL = '本地 Codex';

function appendAiBackendPanel(
  container: HTMLElement,
  kind: AiServiceKind,
  settings: SettingsAccess,
  secrets: SecretStore,
  service: AiServiceSettingsService,
  codex?: CodexCapabilityPort,
): () => void {
  const shell = createDiv('wechat-workbench-settings__ai-backend-shell');
  const selector = createDiv('wechat-workbench-settings__ai-backend-selector');
  const content = createDiv('wechat-workbench-settings__ai-backend-content');
  let backend = selectedBackend(settings.get(), kind);
  let disposeContent: (() => void) | null = null;
  let disposed = false;

  const render = (): void => {
    disposeContent?.();
    disposeContent = null;
    selector.replaceChildren();
    content.replaceChildren();
    for (const item of [
      { id: 'api' as const, label: '原始 API' },
      { id: 'codex' as const, label: LOCAL_CODEX_LABEL },
    ]) {
      const button = createEl('button', { text: item.label });
      button.type = 'button';
      button.dataset.testid = `ai-${kind}-backend-${item.id}`;
      button.classList.toggle('is-active', backend === item.id);
      button.addEventListener('click', () => {
        if (backend === item.id) return;
        const previous = backend;
        backend = item.id;
        render();
        const patch = kind === 'text'
          ? { textGenerationBackend: item.id }
          : { imageGenerationBackend: item.id };
        void settings.update(patch).catch(() => {
          if (disposed || backend !== item.id) return;
          backend = previous;
          render();
        });
      });
      selector.append(button);
    }
    disposeContent = backend === 'api'
      ? appendAiProviderPanel(content, kind, settings.get(), secrets, service)
      : appendCodexPanel(content, kind, settings, codex);
  };

  shell.append(selector, content);
  container.append(shell);
  render();
  return () => {
    disposed = true;
    disposeContent?.();
    disposeContent = null;
  };
}

function appendCodexPanel(
  container: HTMLElement,
  kind: AiServiceKind,
  settings: SettingsAccess,
  codex?: CodexCapabilityPort,
): () => void {
  const card = createDiv('wechat-workbench-settings__codex-card');
  card.dataset.testid = `codex-card-${kind}`;
  card.append(createEl('h3', { text: LOCAL_CODEX_LABEL }));
  card.append(createEl('p', {
    cls: 'setting-item-description',
    text: kind === 'text'
      ? '复用本机已登录的 Codex 生成标题和摘要，不需要在插件中填写 OpenAI API Key。'
      : '复用本机 Codex 的图片生成能力生成封面，可能消耗当前 Codex 账号额度。',
  }));
  const field = createDiv('wechat-workbench-settings__ai-field');
  field.append(createEl('label', { text: 'Codex 可执行文件' }));
  const input = createEl('input');
  input.type = 'text';
  input.dataset.testid = 'codex-executable-path';
  input.value = settings.get().localCodex.executablePath;
  input.placeholder = '留空则自动检测 codex';
  field.append(input);
  const actions = createDiv('wechat-workbench-settings__codex-actions');
  const detect = createEl('button', { text: '重新检测' });
  detect.type = 'button';
  detect.dataset.testid = 'codex-detect';
  const status = createEl('p', {
    cls: 'wechat-workbench-settings__codex-status',
    text: `正在检测${LOCAL_CODEX_LABEL}…`,
  });
  status.dataset.testid = 'codex-status-text';
  actions.append(detect);
  card.append(field, actions, status);
  container.append(card);
  let generation = 0;
  let disposed = false;

  const runDetection = async (persistPath: boolean): Promise<void> => {
    const requestedGeneration = ++generation;
    const executablePath = input.value.trim();
    detect.disabled = true;
    status.textContent = `正在检测${LOCAL_CODEX_LABEL}…`;
    if (persistPath) {
      await settings.update({ localCodex: Object.freeze({ executablePath }) });
    }
    if (codex === undefined) {
      if (!disposed && requestedGeneration === generation) {
        status.textContent = `当前环境无法检测${LOCAL_CODEX_LABEL}。`;
        detect.disabled = false;
      }
      return;
    }
    const result = await codex.detect(executablePath);
    if (disposed || requestedGeneration !== generation) return;
    if (!result.available) {
      status.textContent = `未检测到${LOCAL_CODEX_LABEL}，请先安装或填写可执行文件路径。`;
    } else {
      const imageStatus = result.imageGeneration ? '图片生成已启用' : '图片生成未启用';
      status.textContent = `已发现本地 Codex · ${result.version ?? '版本未知'} · ${imageStatus}`;
      if (result.executablePath !== null) {
        input.value = result.executablePath;
        await settings.update({
          localCodex: Object.freeze({ executablePath: result.executablePath }),
        });
        if (disposed || requestedGeneration !== generation) return;
      }
    }
    detect.disabled = false;
  };
  detect.addEventListener('click', () => {
    void runDetection(true).catch(() => {
      if (disposed) return;
      status.textContent = `检测失败，请检查 ${LOCAL_CODEX_LABEL} 路径后重试。`;
      detect.disabled = false;
    });
  });
  void runDetection(false).catch(() => {
    if (disposed) return;
    status.textContent = `检测失败，请检查 ${LOCAL_CODEX_LABEL} 路径后重试。`;
    detect.disabled = false;
  });
  return () => {
    disposed = true;
    generation += 1;
  };
}

function appendAiProviderPanel(
  container: HTMLElement,
  kind: AiServiceKind,
  settings: Readonly<PluginSettings>,
  secrets: SecretStore,
  service: AiServiceSettingsService,
): () => void {
  const mode = settings.aiProviders[kind];
  const availableProviders = aiProvidersFor(kind);
  let selected: AiProviderId = mode.activeProvider !== null && availableProviders.includes(mode.activeProvider)
    ? mode.activeProvider
    : availableProviders[0] as AiProviderId;
  const layout = createDiv('wechat-workbench-settings__ai-provider-layout');
  const providers = createDiv('wechat-workbench-settings__ai-provider-list');
  const details = createDiv('wechat-workbench-settings__ai-provider-details');
  let fetchedModels: readonly string[] = [];
  let disposeDetails: (() => void) | null = null;
  const renderDetails = (): void => {
    disposeDetails?.();
    disposeDetails = null;
    details.replaceChildren();
    const profile = settings.aiProviders[kind].providers[selected];
    const keyKind = `${kind}${selected === 'agnes' ? 'Agnes' : 'Deepseek'}ApiKey` as SecretKind;
    const savedKey = secrets.get(keyKind) ?? '';
    details.append(createEl('h3', { text: selected === 'agnes' ? 'Agnes 供应商设置' : 'DeepSeek 供应商设置' }));
    details.append(createEl('p', {
      cls: 'setting-item-description',
      text: selected === 'agnes' ? '使用已验证的 Agnes 请求适配器。' : '使用 OpenAI Chat Completions 适配器生成标题和摘要。',
    }));
    const field = (label: string, testId: string, value: string, placeholder: string, type = 'text'): HTMLInputElement => {
      const row = createDiv('wechat-workbench-settings__ai-field');
      row.append(createEl('label', { text: label }));
      const input = createEl('input');
      input.type = type;
      input.value = value;
      input.placeholder = placeholder;
      input.dataset.testid = testId;
      row.append(input);
      details.append(row);
      return input;
    };
    const baseUrl = field('Base URL', `ai-${kind}-${selected}-base-url`, profile.baseUrl, 'https://api.example.com/v1');
    const apiKey = field('API Key', `ai-${kind}-${selected}-key`, savedKey, '输入 API Key', 'password');
    const keyToggle = createEl('button', { cls: 'wechat-workbench-settings__key-toggle' });
    keyToggle.type = 'button';
    keyToggle.dataset.testid = `ai-${kind}-${selected}-key-toggle`;
    keyToggle.setAttribute('aria-label', '显示 API Key');
    setIcon(keyToggle, 'eye');
    keyToggle.addEventListener('click', () => {
      const isHidden = apiKey.type === 'password';
      apiKey.type = isHidden ? 'text' : 'password';
      keyToggle.setAttribute('aria-label', isHidden ? '隐藏 API Key' : '显示 API Key');
      setIcon(keyToggle, isHidden ? 'eye-off' : 'eye');
    });
    const keyControl = createDiv('wechat-workbench-settings__ai-key-control');
    apiKey.replaceWith(keyControl);
    keyControl.append(apiKey, keyToggle);
    const model = field('模型', `ai-${kind}-${selected}-model`, profile.model, '选择或手动填写模型');
    const modelField = model.parentElement as HTMLElement;
    modelField.classList.add('wechat-workbench-settings__ai-model-field');
    const modelControl = createDiv('wechat-workbench-settings__ai-model-control');
    model.replaceWith(modelControl);
    modelControl.append(model);
    let fetchedModelPicker: HTMLButtonElement | null = null;
    let fetchedModelMenu: HTMLElement | null = null;
    let fetchedModelDocument: Document | null = null;
    let fetchedModelWindow: Window | null = null;
    const onViewportChange = (): void => closeFetchedModelMenu();
    const onViewportScroll = (event: Event): void => {
      if (event.target === fetchedModelMenu) return;
      closeFetchedModelMenu();
    };
    const onDocumentPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target === null || typeof target.nodeType !== 'number') return;
      if (fetchedModelMenu?.contains(target) || fetchedModelPicker?.contains(target)) return;
      closeFetchedModelMenu();
    };
    const detachFetchedModelMenuListeners = (): void => {
      fetchedModelDocument?.removeEventListener('pointerdown', onDocumentPointerDown, true);
      fetchedModelWindow?.removeEventListener('resize', onViewportChange);
      fetchedModelWindow?.removeEventListener('scroll', onViewportScroll, true);
      fetchedModelDocument = null;
      fetchedModelWindow = null;
    };
    const closeFetchedModelMenu = (): void => {
      detachFetchedModelMenuListeners();
      fetchedModelMenu?.remove();
      fetchedModelMenu = null;
      fetchedModelPicker?.setAttribute('aria-expanded', 'false');
    };
    const clearFetchedModels = (): void => {
      fetchedModels = [];
      closeFetchedModelMenu();
      fetchedModelPicker?.remove();
      fetchedModelPicker = null;
      modelField.classList.remove('has-fetched-models');
    };
    const renderFetchedModels = (): void => {
      if (fetchedModels.length === 0) return;
      modelField.classList.add('has-fetched-models');
      fetchedModelPicker = createEl('button', { cls: 'wechat-workbench-settings__ai-model-picker' });
      fetchedModelPicker.type = 'button';
      fetchedModelPicker.dataset.testid = `ai-${kind}-${selected}-fetched-model-toggle`;
      fetchedModelPicker.setAttribute('aria-label', '选择获取到的模型');
      fetchedModelPicker.setAttribute('aria-haspopup', 'listbox');
      fetchedModelPicker.setAttribute('aria-expanded', 'false');
      setIcon(fetchedModelPicker, 'chevron-down');
      fetchedModelPicker.addEventListener('click', () => {
        if (fetchedModelMenu !== null) {
          closeFetchedModelMenu();
          return;
        }
        const ownerDocument = fetchedModelPicker?.ownerDocument ?? model.ownerDocument;
        const ownerWindow = ownerDocument.win as ObsidianDomWindow;
        fetchedModelDocument = ownerDocument;
        fetchedModelWindow = ownerWindow;
        const menu = ownerWindow.createDiv('wechat-workbench-settings__ai-model-menu');
        fetchedModelMenu = menu;
        menu.dataset.testid = `ai-${kind}-${selected}-fetched-model-menu`;
        menu.setAttribute('role', 'listbox');
        fetchedModelPicker?.setAttribute('aria-expanded', 'true');
        for (const item of fetchedModels) {
          const option = ownerWindow.createEl('button', { text: item });
          option.type = 'button';
          option.dataset.testid = `ai-${kind}-${selected}-fetched-model-option-${item}`;
          option.setAttribute('role', 'option');
          option.addEventListener('click', () => {
            model.value = item;
            closeFetchedModelMenu();
          });
          menu.append(option);
        }
        ownerDocument.body.append(menu);
        if (fetchedModelPicker !== null) positionFetchedModelMenu(fetchedModelPicker, menu);
        ownerDocument.addEventListener('pointerdown', onDocumentPointerDown, true);
        ownerWindow.addEventListener('resize', onViewportChange);
        ownerWindow.addEventListener('scroll', onViewportScroll, true);
      });
      modelControl.append(fetchedModelPicker);
    };
    disposeDetails = clearFetchedModels;
    renderFetchedModels();
    const actions = createDiv('wechat-workbench-settings__ai-actions');
    const fetch = createEl('button', { text: '获取模型列表' });
    fetch.type = 'button';
    fetch.dataset.testid = `fetch-${kind}-${selected}-models`;
    const save = createEl('button', { cls: 'mod-cta', text: `保存并设为当前${kind === 'text' ? '文本' : '图片'}模型` });
    save.type = 'button';
    save.dataset.testid = `save-${kind}-${selected}`;
    const message = createSpan('wechat-workbench-settings__ai-status');
    actions.append(fetch, save, message);
    details.append(actions);
    fetch.addEventListener('click', () => {
      fetch.disabled = true;
      void service.listModels({ kind, provider: selected, baseUrl: baseUrl.value, apiKey: apiKey.value })
        .then(items => {
          clearFetchedModels();
          fetchedModels = items;
          renderFetchedModels();
          message.textContent = items.length > 0
            ? `已获取 ${items.length} 个模型，请选择后保存。`
            : '未获取到可选模型，请手动填写模型名称。';
        })
        .catch(() => {
          clearFetchedModels();
          message.textContent = '无法获取模型列表，请检查 base URL、API Key 和网络。';
        })
        .finally(() => { fetch.disabled = false; });
    });
    save.addEventListener('click', () => {
      save.disabled = true;
      void service.saveProfile({
        kind, provider: selected, baseUrl: baseUrl.value, model: model.value, apiKey: apiKey.value,
      })
        .then(() => { message.textContent = '已保存并设为当前模型；尚未联网验证。'; })
        .catch(() => { message.textContent = '保存失败，请检查 base URL、模型和 API Key。'; })
        .finally(() => { save.disabled = false; });
    });
  };
  for (const provider of availableProviders) {
    const button = createEl('button', { text: provider === 'agnes' ? 'Agnes' : 'DeepSeek' });
    button.type = 'button';
    button.dataset.testid = `ai-${kind}-provider-${provider}`;
    button.classList.toggle('is-active', provider === selected);
    button.addEventListener('click', () => {
      selected = provider;
      fetchedModels = [];
      for (const child of Array.from(providers.children)) child.classList.toggle('is-active', child === button);
      renderDetails();
    });
    providers.append(button);
  }
  layout.append(providers, details);
  container.append(layout);
  renderDetails();
  return () => {
    disposeDetails?.();
    disposeDetails = null;
  };
}

function positionFetchedModelMenu(trigger: HTMLElement, menu: HTMLElement): void {
  const margin = 8;
  const gap = 4;
  const maxMenuHeight = 208;
  const ownerDocument = trigger.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  const viewportWidth = ownerDocument.documentElement.clientWidth || ownerWindow?.innerWidth || 1024;
  const viewportHeight = ownerDocument.documentElement.clientHeight || ownerWindow?.innerHeight || 768;
  const triggerRect = trigger.getBoundingClientRect();
  const menuWidth = Math.min(288, Math.max(160, viewportWidth - margin * 2));
  const spaceBelow = Math.max(0, viewportHeight - triggerRect.bottom - gap - margin);
  const spaceAbove = Math.max(0, triggerRect.top - gap - margin);
  const placeBelow = spaceBelow >= 96 || spaceBelow >= spaceAbove;
  const availableHeight = placeBelow ? spaceBelow : spaceAbove;
  const menuHeight = Math.max(48, Math.min(maxMenuHeight, availableHeight));
  const left = Math.min(
    Math.max(margin, triggerRect.right - menuWidth),
    Math.max(margin, viewportWidth - menuWidth - margin),
  );
  const top = placeBelow
    ? Math.min(triggerRect.bottom + gap, viewportHeight - menuHeight - margin)
    : Math.max(margin, triggerRect.top - gap - menuHeight);
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  menu.style.width = `${Math.round(menuWidth)}px`;
  menu.style.maxHeight = `${Math.round(menuHeight)}px`;
}

function renderAccountStatus(
  statusBlock: HTMLElement,
  status: ReturnType<AccountConnectionService['snapshot']>,
  copyText: (value: string) => void,
  message?: string,
): void {
  statusBlock.replaceChildren();
  const stateText = status.state === 'CONNECTED'
    ? '公众号基础连接正常'
    : `连接状态：${connectionStateLabel(status.state)}`;
  statusBlock.append(createEl('p', { text: stateText }));
  if (message !== undefined) {
    const detail = createEl('p', {
      cls: 'wechat-workbench-settings__account-message',
      text: message,
    });
    detail.setAttribute('role', 'alert');
    statusBlock.append(detail);
  }
  if (status.verifiedAt !== null) {
    statusBlock.append(createEl('p', { text: `上次验证：${formatLocalTime(status.verifiedAt)}` }));
  }
  if (status.whitelistIp !== null) {
    const ipRow = createDiv('wechat-workbench-settings__whitelist-ip');
    ipRow.append(createSpan({ text: `微信返回的本机出口 IP：${status.whitelistIp}` }));
    const copy = createEl('button', { text: '复制 IP' });
    copy.type = 'button';
    copy.dataset.testid = 'account-copy-ip';
    copy.addEventListener('click', () => {
      copyText(status.whitelistIp!);
      new Notice('IP 已复制');
    });
    ipRow.append(copy);
    statusBlock.append(ipRow);
  }
}

function formatLocalTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function connectionStateLabel(
  state: ReturnType<AccountConnectionService['snapshot']>['state'],
): string {
  switch (state) {
    case 'UNCONFIGURED': return '未配置';
    case 'UNVERIFIED': return '待验证';
    case 'VERIFYING': return '验证中';
    case 'CONNECTED': return '已连接';
    case 'FAILED': return '验证失败';
  }
}
