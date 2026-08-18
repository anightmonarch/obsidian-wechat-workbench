import { Plugin, type WorkspaceLeaf } from 'obsidian';

import { DEFAULT_SETTINGS, type PluginSettings } from './settings/model';
import { SecretStore } from './settings/secret-store';
import { SettingsStore } from './settings/settings-store';
import { WeChatWorkbenchSettingTab } from './settings/settings-tab';
import {
  openWorkbench,
  WORKBENCH_VIEW_TYPE,
} from './ui/open-workbench';
import { WeChatWorkbenchView } from './ui/workbench-view';

export default class WeChatWorkbenchPlugin extends Plugin {
  private pluginSettings: Readonly<PluginSettings> = DEFAULT_SETTINGS;

  override async onload(): Promise<void> {
    const settingsStore = new SettingsStore({
      loadData: () => this.loadData() as Promise<unknown>,
      saveData: data => this.saveData(data),
    });
    this.pluginSettings = await settingsStore.load();
    const secretStore = new SecretStore(this.app.secretStorage);

    this.registerView(
      WORKBENCH_VIEW_TYPE,
      leaf => new WeChatWorkbenchView(leaf),
    );

    const revealWorkbench = (): void => {
      void openWorkbench({
        getLeavesOfType: type => this.app.workspace.getLeavesOfType(type),
        getRightLeaf: split => this.app.workspace.getRightLeaf(split),
        revealLeaf: leaf => this.app.workspace.revealLeaf(leaf as WorkspaceLeaf),
      });
    };

    this.addRibbonIcon('newspaper', '打开 WeChat Workbench', revealWorkbench);
    this.addCommand({
      id: 'open-workbench',
      name: 'Open workbench',
      callback: revealWorkbench,
    });

    this.addSettingTab(new WeChatWorkbenchSettingTab(
      this.app,
      this,
      {
        get: () => this.pluginSettings,
        update: async patch => {
          this.pluginSettings = await settingsStore.save({ ...this.pluginSettings, ...patch });
          return this.pluginSettings;
        },
      },
      secretStore,
    ));
  }
}
