import { type EventRef, Plugin, type WorkspaceLeaf } from 'obsidian';

import { ClipboardAssetResolver } from './clipboard/asset-resolver';
import { ClipboardService } from './clipboard/clipboard-service';
import { ElectronClipboardPort } from './clipboard/electron-clipboard-port';
import type { RenderArtifact } from './domain/artifact';
import { CoverStorage } from './cover/cover-storage';
import { CoverWorkflow } from './cover/cover-workflow';
import { ElectronImagePort } from './cover/electron-image-port';
import { OpenAiImageGenerator } from './cover/openai-image-generator';
import { ObsidianVaultPorts, ObsidianWorkbenchSource } from './obsidian/workbench-adapters';
import { PreflightEngine } from './preflight/preflight-engine';
import { AssetCache, type AssetCacheDataPort } from './publish/asset-cache';
import { AssetUploadService } from './publish/asset-upload-service';
import { PublishCoordinator } from './publish/publish-coordinator';
import { PublishStateStore } from './publish/publish-state-store';
import { PublishWorkflow } from './publish/publish-workflow';
import { publishPayloadHash } from './publish/publish-content';
import { AmbiguousReconciler } from './publish/reconcile-ambiguous';
import { RecoveryReceiptStore, type RecoveryDataPort } from './publish/recovery-receipt-store';
import { RenderArtifactBuilder } from './render/artifact-builder';
import { hashContent } from './render/canonicalize';
import { BrowserMermaidEngine, DiagramRenderer, ElectronSvgRasterizer } from './render/diagram-renderer';
import { NoteSnapshotService } from './render/note-snapshot-service';
import { RemoteImageFetcher } from './security/remote-image-fetcher';
import { accountHashForAppId } from './settings/account';
import { ArticleSettingsService } from './settings/article-settings';
import { DEFAULT_SETTINGS, type PluginSettings } from './settings/model';
import { SecretStore } from './settings/secret-store';
import { SettingsStore } from './settings/settings-store';
import { CodeThemeRegistry } from './styles/code-theme-registry';
import { StyleCompiler } from './styles/style-compiler';
import { StyleFrontmatterStore } from './styles/style-frontmatter-store';
import { StyleResolver } from './styles/style-resolver';
import { StyleWorkflow } from './styles/style-workflow';
import { WeChatWorkbenchSettingTab } from './settings/settings-tab';
import { BUILTIN_THEMES } from './themes/builtin';
import { ThemeRegistry } from './themes/theme-registry';
import {
  openWorkbench,
  WORKBENCH_VIEW_TYPE,
} from './ui/open-workbench';
import { buildAiCoverDisclosure } from './ui/ai-cover-confirmation';
import { WorkbenchPreviewAssetResolver } from './ui/preview-asset-resolver';
import { WorkbenchController } from './ui/workbench-controller';
import { WeChatWorkbenchView } from './ui/workbench-view';
import { AccountSettingsModal } from './ui/account-settings-modal';
import { ObsidianHttpTransport } from './wechat/obsidian-http-transport';
import { PinnedNodeHttpTransport } from './wechat/pinned-node-http-transport';
import { TokenService, type TokenSettingsPort } from './wechat/token-service';
import { TimeoutHttpTransport } from './wechat/timeout-http-transport';
import { WeChatClient } from './wechat/wechat-client';

export default class WeChatWorkbenchPlugin extends Plugin {
  private pluginSettings: Readonly<PluginSettings> = DEFAULT_SETTINGS;

  override async onload(): Promise<void> {
    const settingsStore = new SettingsStore({
      loadData: () => this.loadData() as Promise<unknown>,
      saveData: data => this.saveData(data),
    });
    this.pluginSettings = await settingsStore.load();
    const secretStore = new SecretStore(this.app.secretStorage);
    let settingsMutation: Promise<void> = Promise.resolve();
    const updateSettings = async (
      patch: Partial<PluginSettings>,
    ): Promise<Readonly<PluginSettings>> => {
      let updated = this.pluginSettings;
      const operation = settingsMutation.then(async () => {
        const normalizedPatch = { ...patch };
        if (patch.appId !== undefined) {
          normalizedPatch.accountHash = accountHashForAppId(patch.appId);
          normalizedPatch.accessTokenExpiresAt = null;
          if (patch.appId !== this.pluginSettings.appId) secretStore.clear('accessToken');
        }
        updated = await settingsStore.save({ ...this.pluginSettings, ...normalizedPatch });
        this.pluginSettings = updated;
      });
      settingsMutation = operation.then(() => undefined, () => undefined);
      await operation;
      return updated;
    };
    const expectedAccountHash = accountHashForAppId(this.pluginSettings.appId);
    if (this.pluginSettings.accountHash !== expectedAccountHash) {
      await updateSettings({ accountHash: expectedAccountHash });
    }
    const vaultPorts = new ObsidianVaultPorts(this.app);
    const articleSettings = new ArticleSettingsService(vaultPorts);
    const source = new ObsidianWorkbenchSource(this.app);
    const themes = new ThemeRegistry(BUILTIN_THEMES, vaultPorts);
    await themes.load(this.pluginSettings.customThemeDirectory);
    const refreshWorkbenchSettings = async (
      patch: Partial<PluginSettings>,
    ): Promise<Readonly<PluginSettings>> => {
      await updateSettings(patch);
      await themes.load(this.pluginSettings.customThemeDirectory);
      for (const leaf of this.app.workspace.getLeavesOfType(WORKBENCH_VIEW_TYPE)) {
        if (leaf.view instanceof WeChatWorkbenchView) leaf.view.requestRebuild('settings');
      }
      return this.pluginSettings;
    };
    const settingsAccess = {
      get: () => this.pluginSettings,
      update: refreshWorkbenchSettings,
    };
    const openAccountSettings = (): void => {
      new AccountSettingsModal(this.app, settingsAccess, secretStore).open();
    };
    const currentSettings = (): Readonly<PluginSettings> => this.pluginSettings;
    const snapshots = new NoteSnapshotService(vaultPorts, vaultPorts, {
      get defaultAuthor() { return currentSettings().defaultAuthor; },
      get defaultSourceUrl() { return currentSettings().defaultSourceUrl; },
      get defaultThemeId() { return currentSettings().defaultThemeId; },
    });
    const builder = new RenderArtifactBuilder(vaultPorts);
    const styleWorkflow = new StyleWorkflow(
      new StyleResolver(),
      {
        get: () => ({
          defaultStyle: this.pluginSettings.defaultStyle,
          recentStyles: this.pluginSettings.recentStyles,
        }),
        update: async patch => { await updateSettings(patch); },
      },
      themes,
      new StyleCompiler(new CodeThemeRegistry()),
      new StyleFrontmatterStore(vaultPorts),
    );
    const buildCurrentArtifact = async (file: { path: string; basename: string; modifiedAt: number }): Promise<Readonly<RenderArtifact>> => {
      const current = await snapshots.snapshot(file);
      const resolved = styleWorkflow.resolve(current);
      const theme = styleWorkflow.materialize(resolved);
      return builder.build(
        current,
        theme,
        resolved.renderMode === 'compiled' ? resolved.config : null,
      );
    };
    const preflight = new PreflightEngine();
    const diagrams = new DiagramRenderer(new BrowserMermaidEngine(), new ElectronSvgRasterizer());
    const previewAssets = new WorkbenchPreviewAssetResolver(
      vaultPorts,
      diagrams,
    );
    const clipboard = new ClipboardService(
      new ClipboardAssetResolver(
        vaultPorts,
        diagrams,
      ),
      new ElectronClipboardPort(),
    );
    const wechatHttp = new TimeoutHttpTransport(new ObsidianHttpTransport(), 35_000);
    const providerHttp = new TimeoutHttpTransport(new PinnedNodeHttpTransport(), 35_000);
    const tokens = new TokenService(secretStore, {
      get appId() { return currentSettings().appId; },
      get accessTokenExpiresAt() { return currentSettings().accessTokenExpiresAt; },
      saveAccessTokenMetadata: async expiresAt => {
        await updateSettings({ accessTokenExpiresAt: expiresAt });
      },
    } satisfies TokenSettingsPort, wechatHttp);
    const mediaCacheData: AssetCacheDataPort = {
      get entries() { return currentSettings().mediaCache; },
      save: async entries => { await updateSettings({ mediaCache: entries }); },
    };
    const recoveryData: RecoveryDataPort = {
      get receipts() { return currentSettings().recoveryReceipts; },
      save: async receipts => { await updateSettings({ recoveryReceipts: receipts }); },
    };
    const state = new PublishStateStore(vaultPorts, vaultPorts);
    const receipts = new RecoveryReceiptStore(recoveryData);
    const wechat = new WeChatClient(wechatHttp);
    const remoteImages = new RemoteImageFetcher();
    const uploadAssets = new AssetUploadService(
      vaultPorts,
      remoteImages,
      diagrams,
      wechat,
      new AssetCache(mediaCacheData),
    );
    const coordinator = new PublishCoordinator({
      preflight,
      tokens,
      assets: uploadAssets,
      drafts: wechat,
      state,
      receipts,
      currentSourceHash: async file => (await snapshots.snapshot(file)).sourceHash,
      currentPayloadHash: async command => publishPayloadHash(await buildCurrentArtifact(command.file)),
      currentCover: async command => {
        const current = await snapshots.snapshot(command.file);
        const configured = current.metadata.cover;
        const path = configured === null
          ? command.coverPath
          : await vaultPorts.resolveLink(configured, command.file.path) ?? configured;
        return { path, hash: hashContent(await vaultPorts.readBinary(path)) };
      },
    });
    const publisher = new PublishWorkflow(
      {
        get: () => ({
          appId: this.pluginSettings.appId,
          accountHash: this.pluginSettings.accountHash,
          defaultCoverStrategy: this.pluginSettings.defaultCoverStrategy,
        }),
      },
      state,
      vaultPorts,
      preflight,
      coordinator,
      { receipts, tokens, reconciler: new AmbiguousReconciler(wechat) },
    );
    const coverWorkflow = new CoverWorkflow(
      vaultPorts,
      new ElectronImagePort(),
      new CoverStorage(vaultPorts),
      new OpenAiImageGenerator(providerHttp, remoteImages),
      vaultPorts,
      {
        get: () => ({
          globalDefaultCoverPath: this.pluginSettings.globalDefaultCoverPath,
          imageApiBaseUrl: this.pluginSettings.imageApiBaseUrl,
          imageApiModel: this.pluginSettings.imageApiModel,
        }),
      },
      {
        get: () => secretStore.get('imageApiKey'),
        has: () => secretStore.status().imageApiKey,
      },
    );
    const covers = {
      model: coverWorkflow.model.bind(coverWorkflow),
      prepareSelection: coverWorkflow.prepareSelection.bind(coverWorkflow),
      prepareLocal: coverWorkflow.prepareLocal.bind(coverWorkflow),
      prepareAi: coverWorkflow.prepareAi.bind(coverWorkflow),
      confirm: coverWorkflow.confirm.bind(coverWorkflow),
      disclosure: (artifact: Readonly<RenderArtifact>) => buildAiCoverDisclosure({
        title: artifact.metadata.title,
        digest: artifact.metadata.digest,
        plainText: artifact.plainText,
      }, {
        imageApiBaseUrl: this.pluginSettings.imageApiBaseUrl,
        imageApiModel: this.pluginSettings.imageApiModel,
      }),
    };

    this.registerView(
      WORKBENCH_VIEW_TYPE,
      leaf => {
        const view = new WeChatWorkbenchView(leaf, previewAssets, openAccountSettings);
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
          publisher,
          covers,
          articleSettings,
          styleWorkflow,
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
      settingsAccess,
      secretStore,
    ));
  }
}
