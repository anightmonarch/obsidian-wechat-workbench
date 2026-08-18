import { type EventRef, Plugin, type WorkspaceLeaf } from 'obsidian';

import { ClipboardAssetResolver } from './clipboard/asset-resolver';
import { ClipboardService } from './clipboard/clipboard-service';
import { ElectronClipboardPort } from './clipboard/electron-clipboard-port';
import { ObsidianVaultPorts, ObsidianWorkbenchSource } from './obsidian/workbench-adapters';
import { PreflightEngine } from './preflight/preflight-engine';
import { RenderArtifactBuilder } from './render/artifact-builder';
import { BrowserMermaidEngine, DiagramRenderer, ElectronSvgRasterizer } from './render/diagram-renderer';
import { NoteSnapshotService } from './render/note-snapshot-service';
import { DEFAULT_SETTINGS, type PluginSettings } from './settings/model';
import { SecretStore } from './settings/secret-store';
import { SettingsStore } from './settings/settings-store';
import { WeChatWorkbenchSettingTab } from './settings/settings-tab';
import { BUILTIN_THEMES } from './themes/builtin';
import { ThemeRegistry } from './themes/theme-registry';
import {
  openWorkbench,
  WORKBENCH_VIEW_TYPE,
} from './ui/open-workbench';
import { WorkbenchPreviewAssetResolver } from './ui/preview-asset-resolver';
import { WorkbenchController } from './ui/workbench-controller';
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
    const vaultPorts = new ObsidianVaultPorts(this.app);
    const source = new ObsidianWorkbenchSource(this.app);
    const themes = new ThemeRegistry(BUILTIN_THEMES, vaultPorts);
    await themes.load(this.pluginSettings.customThemeDirectory);
    const currentSettings = (): Readonly<PluginSettings> => this.pluginSettings;
    const snapshots = new NoteSnapshotService(vaultPorts, vaultPorts, {
      get defaultAuthor() { return currentSettings().defaultAuthor; },
      get defaultSourceUrl() { return currentSettings().defaultSourceUrl; },
      get defaultThemeId() { return currentSettings().defaultThemeId; },
    });
    const builder = new RenderArtifactBuilder(vaultPorts);
    const preflight = new PreflightEngine();
    const previewAssets = new WorkbenchPreviewAssetResolver(
      vaultPorts,
      new DiagramRenderer(new BrowserMermaidEngine(), new ElectronSvgRasterizer()),
    );
    const clipboard = new ClipboardService(
      new ClipboardAssetResolver(
        vaultPorts,
        new DiagramRenderer(new BrowserMermaidEngine(), new ElectronSvgRasterizer()),
      ),
      new ElectronClipboardPort(),
    );

    this.registerView(
      WORKBENCH_VIEW_TYPE,
      leaf => {
        const view = new WeChatWorkbenchView(leaf, previewAssets);
        view.setController(new WorkbenchController(
          source,
          snapshots,
          themes,
          builder,
          preflight,
          view,
          event => this.registerEvent(event as EventRef),
          () => this.pluginSettings.defaultThemeId,
          400,
          clipboard,
        ));
        return view;
      },
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
          await themes.load(this.pluginSettings.customThemeDirectory);
          for (const leaf of this.app.workspace.getLeavesOfType(WORKBENCH_VIEW_TYPE)) {
            if (leaf.view instanceof WeChatWorkbenchView) leaf.view.requestRebuild('settings');
          }
          return this.pluginSettings;
        },
      },
      secretStore,
    ));
  }
}
