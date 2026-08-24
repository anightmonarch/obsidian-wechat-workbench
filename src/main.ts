import { Notice, type EventRef, Plugin, type WorkspaceLeaf } from 'obsidian';

import { ClipboardAssetResolver } from './clipboard/asset-resolver';
import { ClipboardService } from './clipboard/clipboard-service';
import { ElectronClipboardPort } from './clipboard/electron-clipboard-port';
import type { RenderArtifact } from './domain/artifact';
import { CoverStorage } from './cover/cover-storage';
import { CoverWorkflow } from './cover/cover-workflow';
import { ElectronImagePort } from './cover/electron-image-port';
import { OpenAiImageGenerator } from './cover/openai-image-generator';
import {
  IMAGE_PROVIDER_TIMEOUT_MS,
  TEXT_PROVIDER_TIMEOUT_MS,
} from './ai/provider-timeout-policy';
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
import { ArticleTextGenerationService } from './ai/article-text-service';
import { OpenAiTextGenerator } from './ai/openai-text-generator';
import { accountHashForAppId } from './settings/account';
import { AiServiceSettingsService } from './settings/ai-service-settings';
import { ArticleSettingsService } from './settings/article-settings';
import { AccountConnectionService } from './settings/account-connection-service';
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
import { ElectronExternalBrowser, openWeChatOfficialConsole } from './ui/external-browser';
import { openPluginSettings } from './ui/settings-navigator';
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
      openPluginSettings(() => {
        new Notice('请打开设置 → 第三方插件 → WeChat Workbench 完善公众号账号配置。');
      });
    };
    const externalBrowser = new ElectronExternalBrowser();
    const openConsole = (): Promise<void> => openWeChatOfficialConsole(externalBrowser);
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
    const textProviderHttp = new TimeoutHttpTransport(
      new PinnedNodeHttpTransport(),
      TEXT_PROVIDER_TIMEOUT_MS,
    );
    const imageProviderHttp = new TimeoutHttpTransport(
      new PinnedNodeHttpTransport(),
      IMAGE_PROVIDER_TIMEOUT_MS,
    );
    const tokens = new TokenService(secretStore, {
      get appId() { return currentSettings().appId; },
      get accessTokenExpiresAt() { return currentSettings().accessTokenExpiresAt; },
      saveAccessTokenMetadata: async expiresAt => {
        await updateSettings({ accessTokenExpiresAt: expiresAt });
      },
    } satisfies TokenSettingsPort, wechatHttp);
    const accountConnection = new AccountConnectionService(
      settingsAccess,
      {
        get: kind => secretStore.get(kind),
        set: (kind, value) => secretStore.set(kind, value),
        clear: kind => secretStore.clear(kind),
      },
      tokens,
    );
    const aiService = new AiServiceSettingsService(settingsAccess, {
      get: kind => secretStore.get(kind),
      set: (kind, value) => secretStore.set(kind, value),
      clear: kind => secretStore.clear(kind),
    });
    const articleText = new ArticleTextGenerationService(
      { get: () => ({ textApiEndpoint: currentSettings().textApiEndpoint, textApiModel: currentSettings().textApiModel }) },
      { get: () => secretStore.get('textApiKey') },
      new OpenAiTextGenerator(textProviderHttp),
    );
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
    const coverWorkflow = new CoverWorkflow(
      vaultPorts,
      new ElectronImagePort(),
      new CoverStorage(vaultPorts),
      new OpenAiImageGenerator(imageProviderHttp, remoteImages),
      vaultPorts,
      {
        get: () => ({
          globalDefaultCoverPath: this.pluginSettings.globalDefaultCoverPath,
          imageApiProtocol: this.pluginSettings.imageApiProtocol,
          imageApiEndpoint: this.pluginSettings.imageApiEndpoint,
          imageApiModel: this.pluginSettings.imageApiModel,
        }),
      },
      {
        get: () => secretStore.get('imageApiKey'),
        has: () => secretStore.status().imageApiKey,
      },
      remoteImages,
    );
    const publisher = new PublishWorkflow(
      {
        get: () => ({
          appId: this.pluginSettings.appId,
          accountHash: this.pluginSettings.accountHash,
        }),
      },
      state,
      coverWorkflow,
      preflight,
      coordinator,
      { receipts, tokens, reconciler: new AmbiguousReconciler(wechat) },
    );
    const covers = {
      model: coverWorkflow.model.bind(coverWorkflow),
      prepareSelection: coverWorkflow.prepareSelection.bind(coverWorkflow),
      prepareUpload: coverWorkflow.prepareUpload.bind(coverWorkflow),
      prepareAi: coverWorkflow.prepareAi.bind(coverWorkflow),
      confirm: coverWorkflow.confirm.bind(coverWorkflow),
      disclosure: (artifact: Readonly<RenderArtifact>, supplementalPrompt = '') => buildAiCoverDisclosure({
        title: artifact.metadata.title,
        digest: artifact.metadata.digest,
        plainText: artifact.plainText,
        supplementalPrompt,
      }, {
        imageApiProtocol: this.pluginSettings.imageApiProtocol,
        imageApiEndpoint: this.pluginSettings.imageApiEndpoint,
        imageApiModel: this.pluginSettings.imageApiModel,
      }),
    };

    this.registerView(
      WORKBENCH_VIEW_TYPE,
      leaf => {
        const view = new WeChatWorkbenchView(leaf, previewAssets, openAccountSettings, openConsole);
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
          articleText,
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
      accountConnection,
      aiService,
      value => new ElectronClipboardPort().write({ text: value }),
      openConsole,
    ));
  }
}
