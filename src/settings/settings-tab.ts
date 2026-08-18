import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

import type { PluginSettings } from './model';
import type { SecretKind, SecretStatus, SecretStore } from './secret-store';

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
  globalDefaultCoverPath: string;
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
    globalDefaultCoverPath: settings.globalDefaultCoverPath,
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
  ) {
    super(app, plugin);
  }

  display(): void {
    this.containerEl.replaceChildren();
    const presentation = buildSettingsPresentation(this.settings.get(), this.secrets.status());

    const heading = createEl('h2');
    heading.textContent = 'WeChat Workbench';
    this.containerEl.append(heading);

    new Setting(this.containerEl)
      .setName('公众号 AppID')
      .setDesc('保存在本地插件设置中，不属于密钥。')
      .addText(text => text
        .setPlaceholder('例如 wx123...')
        .setValue(presentation.appIdValue)
        .onChange(async value => {
          await this.settings.update({ appId: value.trim() });
        }));

    new Setting(this.containerEl)
      .setName('默认封面路径')
      .setDesc('Vault 内图片路径；选择“插件默认封面”时使用。')
      .addText(text => text
        .setPlaceholder('例如 assets/default-cover.png')
        .setValue(presentation.globalDefaultCoverPath)
        .onChange(async value => {
          await this.settings.update({ globalDefaultCoverPath: value.trim() });
        }));

    new Setting(this.containerEl)
      .setName('图片服务地址')
      .setDesc('兼容第三方图片生成接口；生成前会再次展示并确认。')
      .addText(text => text
        .setPlaceholder('例如 https://api.example.com')
        .setValue(presentation.imageApiBaseUrl)
        .onChange(async value => {
          await this.settings.update({ imageApiBaseUrl: value.trim() });
        }));

    new Setting(this.containerEl)
      .setName('图片模型')
      .setDesc('由图片服务提供方定义的模型名称。')
      .addText(text => text
        .setPlaceholder('例如 image-model')
        .setValue(presentation.imageApiModel)
        .onChange(async value => {
          await this.settings.update({ imageApiModel: value.trim() });
        }));

    for (const row of presentation.secretRows) {
      let pendingValue = '';
      new Setting(this.containerEl)
        .setName(row.label)
        .setDesc(`${row.status}。仅保存到 Obsidian SecretStorage。`)
        .addText(text => {
          text.inputEl.type = 'password';
          text
            .setPlaceholder(row.status === '已配置' ? '输入新值以替换' : '输入密钥')
            .setValue(row.inputValue)
            .onChange(value => {
              pendingValue = value;
            });
        })
        .addButton(button => button
          .setButtonText('保存')
          .onClick(() => {
            if (pendingValue.length === 0) {
              new Notice(`${row.label} 不能为空`);
              return;
            }
            this.secrets.set(row.kind, pendingValue);
            if (row.kind === 'appSecret') this.secrets.clear('accessToken');
            pendingValue = '';
            new Notice(`${row.label} 已保存到 SecretStorage`);
            this.display();
          }))
        .addButton(button => button
          .setButtonText('清除')
          .onClick(async () => {
            this.secrets.clear(row.kind);
            if (row.kind === 'appSecret') {
              this.secrets.clear('accessToken');
              await this.settings.update({ accessTokenExpiresAt: null });
            }
            new Notice(`${row.label} 已从 SecretStorage 清除`);
            this.display();
          }));
    }
  }
}
