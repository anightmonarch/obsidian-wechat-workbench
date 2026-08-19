import { App, Modal, Notice, Setting } from 'obsidian';

import { buildSettingsPresentation, type SettingsAccess } from '../settings/settings-tab';
import type { SecretStore } from '../settings/secret-store';

/**
 * A small, official-API-only account entry point for the Workbench header.
 *
 * The full PluginSettingTab remains the canonical place for all plugin
 * options. This modal only exposes the values needed to connect the current
 * single local account, so the primary Workbench action stays discoverable
 * without probing Obsidian's private settings internals.
 */
export class AccountSettingsModal extends Modal {
  constructor(
    app: App,
    private readonly settings: SettingsAccess,
    private readonly secrets: SecretStore,
    private readonly onChange?: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.render();
  }

  private render(): void {
    this.titleEl.textContent = '本地公众号账号';
    this.contentEl.replaceChildren();

    const presentation = buildSettingsPresentation(this.settings.get(), this.secrets.status());
    new Setting(this.contentEl)
      .setName('公众号 AppID')
      .setDesc('保存在本地插件设置中，用于连接当前单个公众号账号。')
      .addText(text => text
        .setPlaceholder('例如 wx123...')
        .setValue(presentation.appIdValue)
        .onChange(async value => {
          await this.settings.update({ appId: value.trim() });
          this.onChange?.();
        }));

    const appSecret = presentation.secretRows.find(row => row.kind === 'appSecret');
    let pendingAppSecret = '';
    new Setting(this.contentEl)
      .setName('AppSecret')
      .setDesc(`${appSecret?.status ?? '未配置'}。密钥只写入 Obsidian SecretStorage，不会回填或显示。`)
      .addText(text => {
        text.inputEl.type = 'password';
        text.inputEl.dataset.testid = 'account-app-secret';
        text
          .setPlaceholder(appSecret?.status === '已配置' ? '输入新值以替换' : '输入 AppSecret')
          .setValue('')
          .onChange(value => {
            pendingAppSecret = value;
          });
      })
      .addButton(button => {
        button.setButtonText('保存').setCta();
        button.buttonEl.dataset.testid = 'account-secret-save';
        button.onClick(() => {
          if (pendingAppSecret.length === 0) {
            new Notice('AppSecret 不能为空');
            return;
          }
          this.secrets.set('appSecret', pendingAppSecret);
          this.secrets.clear('accessToken');
          pendingAppSecret = '';
          new Notice('密钥已保存到本地安全存储');
          this.onChange?.();
          this.render();
        });
        return button;
      })
      .addButton(button => {
        button.setButtonText('清除');
        button.buttonEl.dataset.testid = 'account-secret-clear';
        button.onClick(async () => {
          this.secrets.clear('appSecret');
          this.secrets.clear('accessToken');
          await this.settings.update({ accessTokenExpiresAt: null });
          new Notice('密钥已从本地安全存储清除');
          this.onChange?.();
          this.render();
        });
        return button;
      });

    const accessToken = this.secrets.status().accessToken;
    new Setting(this.contentEl)
      .setName('访问令牌')
      .setDesc(`${accessToken ? '已缓存' : '未缓存'}。Access token 由插件按需获取，并仅保存在本地安全存储，不显示令牌内容。`);

    const hint = createEl('p');
    hint.textContent = '完整主题、封面和图片服务配置仍可在插件设置页管理。';
    this.contentEl.append(hint);
  }
}
