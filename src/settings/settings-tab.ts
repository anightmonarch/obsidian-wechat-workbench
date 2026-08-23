import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

import type { PluginSettings } from './model';
import type { AccountConnectionService } from './account-connection-service';
import type { AiServiceSettingsService } from './ai-service-settings';
import type { SecretKind, SecretStatus, SecretStore } from './secret-store';
import { AccountDisconnectModal } from '../ui/account-disconnect-modal';

export interface SettingsAccess {
  get(): Readonly<PluginSettings>;
  update(patch: Partial<PluginSettings>): Promise<Readonly<PluginSettings>>;
}

export interface SecretSettingRow {
  kind: Extract<SecretKind, 'appSecret' | 'imageApiKey'>;
  label: string;
  status: '已配置' | '未配置';
  inputValue: '';
}

export interface SettingsPresentation {
  appIdValue: string;
  imageApiBaseUrl: string;
  imageApiModel: string;
  secretRows: SecretSettingRow[];
}

export function buildSettingsPresentation(
  settings: Readonly<PluginSettings>,
  status: SecretStatus,
): SettingsPresentation {
  return {
    appIdValue: settings.appId,
    imageApiBaseUrl: settings.imageApiBaseUrl,
    imageApiModel: settings.imageApiModel,
    secretRows: [
      {
        kind: 'appSecret',
        label: 'AppSecret',
        status: status.appSecret ? '已配置' : '未配置',
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
  constructor(
    app: App,
    plugin: Plugin,
    private readonly settings: SettingsAccess,
    private readonly secrets: SecretStore,
    private readonly connection: AccountConnectionService,
    private readonly aiService: AiServiceSettingsService,
    private readonly copyText: (value: string) => void = () => undefined,
    private readonly openConsole: () => Promise<void> = async () => undefined,
  ) {
    super(app, plugin);
  }

  display(): void {
    this.containerEl.replaceChildren();

    const heading = createEl('h2');
    heading.textContent = '微信公众号';
    this.containerEl.append(heading);

    this.renderAccountSection();
    this.renderAiServiceSection();
  }

  private renderAiServiceSection(): void {
    const current = this.settings.get();
    let protocol = current.imageApiProtocol;
    let baseUrl = current.imageApiBaseUrl;
    let model = current.imageApiModel;
    let apiKey = '';
    const heading = createEl('h2', { text: '智能封面服务' });
    this.containerEl.append(heading);

    const protocolSelect = createEl('select');
    protocolSelect.dataset.testid = 'ai-protocol';
    protocolSelect.append(new Option('OpenAI 兼容', 'openai-compatible'), new Option('Anthropic', 'anthropic'));
    protocolSelect.value = protocol;
    protocolSelect.addEventListener('change', () => {
      protocol = protocolSelect.value as typeof protocol;
    });
    const protocolField = createDiv('wechat-workbench-settings__field');
    protocolField.append(createSpan({ text: '接口协议' }), protocolSelect);
    this.containerEl.append(protocolField);

    const baseUrlInput = createEl('input');
    baseUrlInput.dataset.testid = 'ai-base-url';
    baseUrlInput.placeholder = '例如 https://api.example.com/v1';
    baseUrlInput.value = baseUrl;
    baseUrlInput.addEventListener('change', () => { baseUrl = baseUrlInput.value; });
    const baseUrlField = createDiv('wechat-workbench-settings__field');
    baseUrlField.append(createSpan({ text: '服务地址' }), baseUrlInput);
    this.containerEl.append(baseUrlField);

    new Setting(this.containerEl)
      .setName('图片 API Key')
      .addText(text => {
        text.inputEl.type = 'password';
        text.inputEl.dataset.testid = 'ai-api-key';
        text.inputEl.placeholder = '输入新值以替换';
        text.setValue('').onChange(value => { apiKey = value; });
      });

    const modelSelect = createEl('select');
    modelSelect.dataset.testid = 'ai-model';
    if (model.length > 0) modelSelect.append(new Option(model, model));
    modelSelect.value = model;
    modelSelect.addEventListener('change', () => { model = modelSelect.value; });
    const modelField = createDiv('wechat-workbench-settings__field');
    modelField.append(createSpan({ text: '可用模型' }), modelSelect);
    this.containerEl.append(modelField);

    const modelError = createEl('p', {
      cls: 'wechat-workbench-settings__error',
      text: '模型列表获取失败，请检查服务地址和 API Key 后重试。',
    });
    modelError.hidden = true;
    this.containerEl.append(modelError);

    const refreshButton = createEl('button', { text: '获取模型' });
    refreshButton.dataset.testid = 'ai-refresh-models';
    refreshButton.addEventListener('click', () => {
      void (async () => {
        refreshButton.disabled = true;
        modelError.hidden = true;
        try {
          const models = await this.aiService.refreshModels({ protocol, baseUrl, apiKey });
          modelSelect.replaceChildren();
          for (const option of models) {
            const label = option.capability === 'PROMPT_PLANNING_ONLY'
              ? `${option.id}（只支持封面策划，未提供图片输出）`
              : option.id;
            modelSelect.append(new Option(label, option.id));
          }
          model = models[0]?.id ?? '';
          modelSelect.value = model;
        } catch {
          modelError.hidden = false;
        } finally {
          refreshButton.disabled = false;
        }
      })();
    });

    const saveButton = createEl('button', { text: '保存服务配置' });
    saveButton.dataset.testid = 'ai-save';
    saveButton.addEventListener('click', () => {
      void (async () => {
        try {
          await this.aiService.save({
            protocol,
            baseUrl: (this.containerEl.querySelector<HTMLInputElement>('[data-testid="ai-base-url"]') ?? { value: baseUrl }).value,
            model: (this.containerEl.querySelector<HTMLSelectElement>('[data-testid="ai-model"]') ?? { value: model }).value,
            apiKey: (this.containerEl.querySelector<HTMLInputElement>('[data-testid="ai-api-key"]') ?? { value: apiKey }).value,
          });
          const apiKeyInput = this.containerEl.querySelector<HTMLInputElement>('[data-testid="ai-api-key"]');
          if (apiKeyInput !== null) apiKeyInput.value = '';
          apiKey = '';
        } catch {
          new Notice('图片服务配置保存失败，请先获取并选择可用模型。');
        }
      })();
    });

    const actions = createDiv('wechat-workbench-settings__actions');
    actions.append(refreshButton, saveButton);
    this.containerEl.append(actions);
  }

  private renderAccountSection(): void {
    const current = this.settings.get();
    let displayName = current.accountDisplayName;
    let appId = current.appId;
    let appSecret = '';
    let pending = false;
    const status = this.connection.snapshot();

    const guidance = createDiv('wechat-workbench-settings__account-guidance');
    guidance.append(createEl('p', {
      text: '插件直接从本机连接公众号。请将微信验证返回的本机出口 IP 加入公众号平台“开发 → 基本配置 → IP 白名单”。',
    }));
    const openConsoleButton = createEl('button', { text: '打开公众号后台' });
    openConsoleButton.type = 'button';
    openConsoleButton.dataset.testid = 'account-open-console';
    openConsoleButton.addEventListener('click', () => {
      void this.openConsole().catch(() => {
        new Notice('无法打开公众号后台，请在浏览器访问 mp.weixin.qq.com。');
      });
    });
    guidance.append(openConsoleButton);
    this.containerEl.append(guidance);

    new Setting(this.containerEl)
      .setName('公众号名称')
      .addText(text => {
        text.inputEl.dataset.testid = 'account-name';
        text.setValue(displayName).onChange(value => { displayName = value; });
      });

    new Setting(this.containerEl)
      .setName('AppID')
      .addText(text => {
        text.inputEl.dataset.testid = 'account-app-id';
        text.setValue(appId).onChange(value => { appId = value; });
      });

    new Setting(this.containerEl)
      .setName('AppSecret')
      .addText(text => {
        text.inputEl.type = 'password';
        text.inputEl.dataset.testid = 'account-secret';
        text.inputEl.placeholder = '输入新值以替换';
        text.setValue('').onChange(value => { appSecret = value; });
      });

    const saveButton = createEl('button', { text: '保存账号配置' });
    saveButton.dataset.testid = 'account-save';
    saveButton.addEventListener('click', () => {
      displayName = (this.containerEl.querySelector<HTMLInputElement>('[data-testid="account-name"]') ?? { value: displayName }).value;
      appId = (this.containerEl.querySelector<HTMLInputElement>('[data-testid="account-app-id"]') ?? { value: appId }).value;
      appSecret = (this.containerEl.querySelector<HTMLInputElement>('[data-testid="account-secret"]') ?? { value: appSecret }).value;
      void (async () => {
        if (pending) return;
        pending = true;
        try {
          await this.connection.save({ displayName, appId, appSecret });
          this.display();
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
        verifyButton.disabled = true;
        disconnectButton.disabled = true;
        try {
          await this.connection.verify();
          this.display();
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
          this.display();
        } finally {
          pending = false;
        }
      }).open();
    });

    const actions = createDiv('wechat-workbench-settings__actions');
    actions.append(saveButton, verifyButton, disconnectButton);
    this.containerEl.append(actions);

    const stateText = status.state === 'CONNECTED'
      ? '公众号基础连接正常'
      : `连接状态：${connectionStateLabel(status.state)}`;
    const statusBlock = createDiv('wechat-workbench-settings__account-status');
    statusBlock.dataset.testid = 'account-status';
    statusBlock.append(createEl('p', { text: stateText }));
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
        this.copyText(status.whitelistIp!);
        new Notice('IP 已复制');
      });
      ipRow.append(copy);
      statusBlock.append(ipRow);
    }
    this.containerEl.append(statusBlock);
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
