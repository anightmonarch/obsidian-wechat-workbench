import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

import type { PluginSettings } from './model';
import type { AccountConnectionService } from './account-connection-service';
import type { AiServiceInput, AiServiceSettingsService } from './ai-service-settings';
import type { SecretKind, SecretStatus, SecretStore } from './secret-store';
import { AccountDisconnectModal } from '../ui/account-disconnect-modal';
import { PublicError } from '../wechat/errors';

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
  textApiEndpoint: string;
  textApiModel: string;
  imageApiEndpoint: string;
  imageApiModel: string;
  imageApiBaseUrl: string;
  secretRows: SecretSettingRow[];
}

interface AiServiceCardOptions {
  kind: 'text' | 'image';
  title: string;
  description: string;
  endpoint: string;
  model: string;
  keySaved: boolean;
  save(input: Readonly<AiServiceInput>): Promise<Readonly<PluginSettings>>;
}

export function buildSettingsPresentation(
  settings: Readonly<PluginSettings>,
  status: SecretStatus,
): SettingsPresentation {
  return {
    appIdValue: settings.appId,
    textApiEndpoint: settings.textApiEndpoint,
    textApiModel: settings.textApiModel,
    imageApiEndpoint: settings.imageApiEndpoint,
    imageApiModel: settings.imageApiModel,
    imageApiBaseUrl: settings.imageApiBaseUrl,
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

    const heading = createEl('h2', {
      cls: 'wechat-workbench-settings__section-title',
      text: '微信公众号',
    });
    this.containerEl.append(heading);

    this.renderAccountSection();
    this.renderAiServiceSection();
  }

  private renderAiServiceSection(): void {
    const current = this.settings.get();
    const status = this.secrets.status();
    const heading = createEl('h2', {
      cls: 'wechat-workbench-settings__section-title',
      text: 'AI 内容生成',
    });
    this.containerEl.append(heading);
    const grid = createDiv('wechat-workbench-settings__ai-grid');
    appendAiServiceCard(grid, {
      kind: 'text',
      title: '文本生成服务',
      description: '用于生成标题候选和摘要候选。',
      endpoint: current.textApiEndpoint,
      model: current.textApiModel,
      keySaved: status.textApiKey,
      save: input => this.aiService.saveText(input),
    });
    appendAiServiceCard(grid, {
      kind: 'image',
      title: '图片生成服务',
      description: '用于一次生成一张公众号封面候选。',
      endpoint: current.imageApiEndpoint,
      model: current.imageApiModel,
      keySaved: status.imageApiKey,
      save: input => this.aiService.saveImage(input),
    });
    this.containerEl.append(grid);
  }

  private renderAccountSection(): void {
    const current = this.settings.get();
    let displayName = current.accountDisplayName;
    let appId = current.appId;
    let appSecret = '';
    let pending = false;
    const status = this.connection.snapshot();
    const accountCard = createDiv('wechat-workbench-settings__account-card');
    accountCard.dataset.testid = 'account-card';
    const statusBlock = createDiv('wechat-workbench-settings__account-status');
    statusBlock.dataset.testid = 'account-status';
    renderAccountStatus(statusBlock, status, this.copyText);

    const guidance = createDiv('wechat-workbench-settings__account-guidance');
    const guidanceCopy = createDiv('wechat-workbench-settings__account-guidance-copy');
    guidanceCopy.append(
      createEl('p', { text: '插件直接从本地连接公众号，安全可控。' }),
      createEl('p', { text: '点击下方验证按钮，将微信验证返回的本机出口 IP 加入公众号平台：“开发与设置 → 安全中心 → IP 白名单”。' }),
    );
    const openConsoleButton = createEl('button', { text: '打开公众号后台' });
    openConsoleButton.type = 'button';
    openConsoleButton.dataset.testid = 'account-open-console';
    openConsoleButton.addEventListener('click', () => {
      void this.openConsole().catch(() => {
        new Notice('无法打开公众号后台，请在浏览器访问 mp.weixin.qq.com。');
      });
    });
    guidance.append(guidanceCopy);
    accountCard.append(guidance);

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

    new Setting(accountCard)
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
        saveButton.disabled = true;
        verifyButton.disabled = true;
        disconnectButton.disabled = true;
        verifyButton.textContent = '验证中…';
        renderAccountStatus(statusBlock, {
          state: 'VERIFYING', verifiedAt: null, errorCode: null, errcode: null, whitelistIp: null,
        }, this.copyText);
        try {
          await this.connection.verify();
          this.display();
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
          this.display();
        } finally {
          pending = false;
        }
      }).open();
    });

    const actions = createDiv('wechat-workbench-settings__actions');
    actions.append(saveButton, verifyButton, disconnectButton, openConsoleButton);
    accountCard.append(actions);
    accountCard.append(statusBlock);
    this.containerEl.append(accountCard);
  }
}

function appendAiServiceCard(
  container: HTMLElement,
  options: Readonly<AiServiceCardOptions>,
): void {
  const card = createDiv('wechat-workbench-settings__ai-card');
  card.append(createEl('h3', { text: options.title }));
  card.append(createEl('p', {
    cls: 'setting-item-description',
    text: options.description,
  }));
  let endpoint = options.endpoint;
  let model = options.model;
  let apiKey = '';
  const endpointSetting = new Setting(card)
    .setName('完整 Endpoint URL')
    .addText(text => {
      text.setValue(endpoint).onChange(value => { endpoint = value; });
      text.inputEl.dataset.testid = `${options.kind}-ai-endpoint`;
      text.inputEl.placeholder = options.kind === 'text'
        ? 'https://api.example.com/v1/chat/completions'
        : 'https://api.example.com/v1/images/generations';
    });
  endpointSetting.settingEl.dataset.testid = `${options.kind}-ai-endpoint-setting`;
  new Setting(card)
    .setName('API Key')
    .addText(text => {
      text.inputEl.type = 'password';
      text.inputEl.dataset.testid = `${options.kind}-ai-key`;
      text.inputEl.placeholder = options.keySaved ? '已保存 · 输入新值以替换' : '输入 API Key';
      text.setValue('').onChange(value => { apiKey = value; });
    });
  new Setting(card)
    .setName('模型名称')
    .addText(text => {
      text.setValue(model).onChange(value => { model = value; });
      text.inputEl.dataset.testid = `${options.kind}-ai-model`;
      text.inputEl.placeholder = 'your-model-name';
    });
  const actions = createDiv('wechat-workbench-settings__ai-actions');
  const status = createSpan('wechat-workbench-settings__ai-status');
  status.textContent = '尚未修改';
  status.dataset.testid = `${options.kind}-ai-status`;
  const save = createEl('button', {
    cls: 'mod-cta',
    text: `保存${options.kind === 'text' ? '文本' : '图片'}配置`,
  });
  save.type = 'button';
  save.dataset.testid = `save-${options.kind}-ai`;
  save.addEventListener('click', () => {
    const endpointInput = card.querySelector<HTMLInputElement>(`[data-testid="${options.kind}-ai-endpoint"]`);
    const modelInput = card.querySelector<HTMLInputElement>(`[data-testid="${options.kind}-ai-model"]`);
    const keyInput = card.querySelector<HTMLInputElement>(`[data-testid="${options.kind}-ai-key"]`);
    save.disabled = true;
    void options.save({
      endpoint: endpointInput?.value ?? endpoint,
      model: modelInput?.value ?? model,
      apiKey: keyInput?.value ?? apiKey,
    })
      .then(() => {
        status.textContent = '已保存到本机 · 尚未联网验证';
        apiKey = '';
        if (keyInput !== null) keyInput.value = '';
      })
      .catch(() => {
        status.textContent = '保存失败，请检查 Endpoint、模型名称和 API Key';
      })
      .finally(() => { save.disabled = false; });
  });
  actions.append(save, status);
  card.append(actions);
  container.append(card);
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
