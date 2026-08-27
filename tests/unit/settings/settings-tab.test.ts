import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS, type PluginSettings } from '../../../src/settings/model';
import {
  buildSettingsPresentation,
  WeChatWorkbenchSettingTab,
  type SettingsAccess,
} from '../../../src/settings/settings-tab';
import type { AccountConnectionService } from '../../../src/settings/account-connection-service';
import type { SecretStore } from '../../../src/settings/secret-store';
import type { AiServiceSettingsService } from '../../../src/settings/ai-service-settings';
import { PublicError } from '../../../src/wechat/errors';

function createHarness() {
  const settings = {
    current: { ...DEFAULT_SETTINGS },
    update: vi.fn(async (patch: Partial<PluginSettings>) => {
      settings.current = { ...settings.current, ...patch };
      return settings.current;
    }),
  };
  const secrets = {
    status: vi.fn(() => ({ appSecret: true, accessToken: false, textApiKey: false, imageApiKey: false })),
    get: vi.fn((kind: string) => {
      if (kind === 'appSecret') return 'synthetic-saved-app-secret';
      return kind === 'textDeepseekApiKey' ? 'synthetic-saved-key' : null;
    }),
  };
  const connection = {
    snapshot: vi.fn<() => ReturnType<AccountConnectionService['snapshot']>>(() => ({
      state: 'CONNECTED',
      verifiedAt: 1_755_000_000_000,
      errorCode: null,
      errcode: null,
      whitelistIp: null,
    })),
    save: vi.fn(async () => settings.current),
    verify: vi.fn(async (): Promise<{
      state: 'CONNECTED';
      verifiedAt: number;
      errorCode: null;
      errcode: null;
      whitelistIp: null;
    }> => ({
      state: 'CONNECTED',
      verifiedAt: 1_755_000_000_000,
      errorCode: null,
      errcode: null,
      whitelistIp: null,
    })),
    disconnect: vi.fn(async () => undefined),
  };
  const ai = {
    saveProfile: vi.fn(async () => settings.current),
    listModels: vi.fn(async () => ['synthetic-model']),
  };
  const copyIp = vi.fn();
  const openConsole = vi.fn(async () => undefined);
  const access: SettingsAccess = { get: () => settings.current, update: settings.update };
  const tab = new WeChatWorkbenchSettingTab(
    {} as never,
    {} as never,
    access,
    secrets as unknown as SecretStore,
    connection as unknown as AccountConnectionService,
    ai as unknown as AiServiceSettingsService,
    copyIp,
    openConsole,
  );
  return { tab, settings, secrets, connection, access, ai, copyIp, openConsole };
}

function button(host: ParentNode, testId: string): HTMLButtonElement {
  const element = host.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (element === null) throw new Error(`Missing button ${testId}`);
  return element;
}

function input(host: HTMLElement, testId: string): HTMLInputElement {
  const element = host.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`);
  if (element === null) throw new Error(`Missing input ${testId}`);
  return element;
}

describe('buildSettingsPresentation', () => {
  it('shows configuration status without exposing stored secret values', () => {
    const presentation = buildSettingsPresentation(DEFAULT_SETTINGS, {
      appSecret: true,
      accessToken: true,
      textApiKey: false,
      imageApiKey: false,
    });

    expect(presentation.appIdValue).toBe('');
    expect(presentation).toMatchObject({ textProvider: null, imageProvider: null });
    expect(presentation.secretRows).toEqual([
      { kind: 'appSecret', label: 'AppSecret', status: '已配置', inputValue: '' },
      { kind: 'textApiKey', label: '文本 API Key', status: '未配置', inputValue: '' },
      { kind: 'imageApiKey', label: '图片 API Key', status: '未配置', inputValue: '' },
    ]);
    expect(JSON.stringify(presentation)).not.toContain('accessToken');
  });

  describe('account section', () => {
    beforeEach(() => {
      document.body.replaceChildren();
    });

    it('renders one compact account section with its saved AppSecret masked', () => {
      const { tab } = createHarness();
      document.body.append(tab.containerEl);
      tab.display();

      const accountCard = tab.containerEl.querySelector<HTMLElement>('[data-testid="account-card"]');
      expect(accountCard).not.toBeNull();
      const actions = accountCard?.querySelector<HTMLElement>('.wechat-workbench-settings__actions');
      expect(actions?.querySelector('[data-testid="account-open-console"]')).not.toBeNull();
      expect(actions?.lastElementChild?.getAttribute('data-testid')).toBe('account-open-console');
      expect(accountCard?.querySelector('[data-testid="account-name"]')).not.toBeNull();
      expect(accountCard?.querySelector('[data-testid="account-app-id"]')).not.toBeNull();
      expect(accountCard?.querySelector('[data-testid="account-secret"]')).not.toBeNull();
      expect(accountCard?.querySelector('[data-testid="account-save"]')).not.toBeNull();
      expect(accountCard?.querySelector('[data-testid="account-verify"]')).not.toBeNull();
      expect(accountCard?.querySelector('[data-testid="account-disconnect"]')).not.toBeNull();
      expect(accountCard?.querySelector('[data-testid="account-status"]')).not.toBeNull();
      expect(tab.containerEl.textContent).toContain('微信公众号');
      expect(tab.containerEl.textContent).toContain('公众号名称');
      expect(tab.containerEl.textContent).toContain('AppID');
      expect(tab.containerEl.textContent).toContain('AppSecret');
      expect(tab.containerEl.textContent).toContain('公众号基础连接正常');
      expect(tab.containerEl.textContent).toContain('上次验证：');
      expect(tab.containerEl.textContent).toContain('插件直接从本地连接公众号，安全可控。');
      expect(tab.containerEl.textContent).toContain('点击下方验证按钮，将微信验证返回的本机出口 IP 加入公众号平台：“开发与设置 → 安全中心 → IP 白名单”。');
      expect(tab.containerEl.textContent).not.toContain('文本和图片服务相互独立。');
      expect(tab.containerEl.textContent).not.toContain('插件默认封面');
      expect(tab.containerEl.querySelector('[data-testid="default-cover-path"]')).toBeNull();
      const secret = input(tab.containerEl, 'account-secret');
      expect(secret.type).toBe('password');
      expect(secret.value).toBe('synthetic-saved-app-secret');
      expect(button(tab.containerEl, 'account-secret-toggle').getAttribute('aria-label')).toBe('显示 AppSecret');
    });

    it('reveals and hides the saved AppSecret only in the current settings form', () => {
      const { tab } = createHarness();
      document.body.append(tab.containerEl);
      tab.display();

      const secret = input(tab.containerEl, 'account-secret');
      button(tab.containerEl, 'account-secret-toggle').click();
      expect(secret.type).toBe('text');
      expect(button(tab.containerEl, 'account-secret-toggle').getAttribute('aria-label')).toBe('隐藏 AppSecret');

      button(tab.containerEl, 'account-secret-toggle').click();
      expect(secret.type).toBe('password');
      expect(button(tab.containerEl, 'account-secret-toggle').getAttribute('aria-label')).toBe('显示 AppSecret');
    });

    it('maps internal connection states to user-facing labels', () => {
      const { tab, connection } = createHarness();
      connection.snapshot.mockReturnValue({
        state: 'UNVERIFIED', verifiedAt: null, errorCode: null, errcode: null, whitelistIp: null,
      });
      document.body.append(tab.containerEl);
      tab.display();

      expect(tab.containerEl.textContent).toContain('连接状态：待验证');
      expect(tab.containerEl.textContent).not.toContain('UNVERIFIED');
    });

    it('shows whitelist guidance and copies only the IP returned by WeChat', () => {
      const { tab, connection, copyIp } = createHarness();
      connection.snapshot.mockReturnValue({
        state: 'FAILED', verifiedAt: 1_755_000_000_000, errorCode: 'WECHAT_API_REJECTED',
        errcode: 40164, whitelistIp: '203.0.113.4',
      });
      document.body.append(tab.containerEl);
      tab.display();

      expect(tab.containerEl.textContent).toContain('IP 白名单');
      expect(tab.containerEl.textContent).toContain('203.0.113.4');
      button(tab.containerEl, 'account-copy-ip').click();
      expect(copyIp).toHaveBeenCalledWith('203.0.113.4');
    });

    it('does not verify on display and saves through one explicit action', async () => {
      const { tab, connection } = createHarness();
      document.body.append(tab.containerEl);
      tab.display();

      expect(connection.verify).not.toHaveBeenCalled();
      input(tab.containerEl, 'account-name').value = 'Commit 日记';
      input(tab.containerEl, 'account-app-id').value = 'wx-new-id';
      input(tab.containerEl, 'account-secret').value = 'synthetic-app-secret';
      button(tab.containerEl, 'account-save').click();
      await vi.waitFor(() => expect(connection.save).toHaveBeenCalledWith({
        displayName: 'Commit 日记',
        appId: 'wx-new-id',
        appSecret: 'synthetic-app-secret',
      }));
      expect(connection.verify).not.toHaveBeenCalled();
    });

    it('verifies explicitly and disables duplicate actions while pending', async () => {
      const { tab, connection } = createHarness();
      let release!: () => void;
      connection.verify.mockImplementation((() => new Promise<void>(resolve => {
        release = resolve;
      })) as never);
      document.body.append(tab.containerEl);
      tab.display();

      button(tab.containerEl, 'account-verify').click();
      expect(button(tab.containerEl, 'account-verify').disabled).toBe(true);
      expect(button(tab.containerEl, 'account-disconnect').disabled).toBe(true);
      release();
      await vi.waitFor(() => expect(connection.verify).toHaveBeenCalledOnce());
    });

    it('shows an actionable missing-secret error instead of leaving verification stuck', async () => {
      const { tab, connection } = createHarness();
      connection.snapshot.mockReturnValue({
        state: 'UNCONFIGURED', verifiedAt: null, errorCode: null, errcode: null, whitelistIp: null,
      });
      connection.verify.mockRejectedValue(new PublicError({
        code: 'WECHAT_ACCOUNT_NOT_CONFIGURED',
        stage: 'TOKEN',
        errcode: null,
        errmsg: '微信公众号账号尚未配置完整。',
        rid: null,
        remoteEffect: 'NONE',
        retryable: false,
        nextAction: '在插件设置中保存 AppID 和 AppSecret。',
      }));
      document.body.append(tab.containerEl);
      tab.display();

      button(tab.containerEl, 'account-verify').click();

      await vi.waitFor(() => expect(tab.containerEl.textContent)
        .toContain('请先填写并保存 AppSecret，再验证连接。'));
      expect(button(tab.containerEl, 'account-verify').disabled).toBe(false);
      expect(button(tab.containerEl, 'account-verify').textContent).toBe('验证连接');
    });
  });

  describe('ai service section', () => {
    beforeEach(() => {
      document.body.replaceChildren();
    });

    it('renders one active mode with independent provider profiles and one binding action', () => {
      const { tab } = createHarness();
      document.body.append(tab.containerEl);
      tab.display();

      expect(tab.containerEl.textContent).toContain('AI 内容生成');
      expect(tab.containerEl.textContent).toContain('文本模型配置');
      expect(tab.containerEl.textContent).toContain('图片模型配置');
      expect(tab.containerEl.textContent).not.toContain('选择一种模型用途，再配置并设为当前服务。');
      expect(tab.containerEl.textContent).toContain('用于发布设置中的生成标题、生成摘要。');
      expect(tab.containerEl.textContent).toContain('Agnes 供应商设置');
      expect(tab.containerEl.textContent).toContain('Base URL');
      expect(tab.containerEl.textContent).toContain('获取模型列表');
      expect(tab.containerEl.textContent).toContain('保存并设为当前文本模型');
      expect(tab.containerEl.textContent).not.toContain('API 请求格式（固定）');
      expect(tab.containerEl.querySelector('[data-testid="ai-text-provider-agnes"]')).not.toBeNull();
      expect(tab.containerEl.querySelector('[data-testid="ai-text-provider-deepseek"]')).not.toBeNull();
      expect(input(tab.containerEl, 'ai-text-agnes-base-url')).toBeTruthy();
    });

    it('saves a text provider profile and makes it the current text binding', async () => {
      const { tab, ai } = createHarness();
      document.body.append(tab.containerEl);
      tab.display();
      input(tab.containerEl, 'ai-text-agnes-base-url').value = 'https://text.example.test/v1';
      input(tab.containerEl, 'ai-text-agnes-model').value = 'text-model';
      input(tab.containerEl, 'ai-text-agnes-key').value = 'synthetic-text-key';

      button(tab.containerEl, 'save-text-agnes').click();

      await vi.waitFor(() => expect(ai.saveProfile).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'text', provider: 'agnes', baseUrl: 'https://text.example.test/v1', model: 'text-model', apiKey: 'synthetic-text-key',
      })));
      expect(tab.containerEl.textContent).toContain('已保存并设为当前模型；尚未联网验证。');
      expect(input(tab.containerEl, 'ai-text-agnes-key').value).toBe('synthetic-text-key');
    });

    it('switches to image mode and saves an independent image provider profile', async () => {
      const { tab, ai } = createHarness();
      document.body.append(tab.containerEl);
      tab.display();
      button(tab.containerEl, 'ai-mode-image').click();
      input(tab.containerEl, 'ai-image-agnes-base-url').value = 'https://images.example.test/v1';
      input(tab.containerEl, 'ai-image-agnes-model').value = 'image-model';
      button(tab.containerEl, 'save-image-agnes').click();

      await vi.waitFor(() => expect(ai.saveProfile).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'image', provider: 'agnes', baseUrl: 'https://images.example.test/v1', model: 'image-model',
      })));
    });

    it('does not expose DeepSeek in image configuration', () => {
      const { tab } = createHarness();
      document.body.append(tab.containerEl);
      tab.display();

      button(tab.containerEl, 'ai-mode-image').click();

      expect(tab.containerEl.querySelector('[data-testid="ai-image-provider-agnes"]')).not.toBeNull();
      expect(tab.containerEl.querySelector('[data-testid="ai-image-provider-deepseek"]')).toBeNull();
      expect(tab.containerEl.textContent).not.toContain('DeepSeek 供应商设置');
    });

    it('pre-fills the official Base URL, removes endpoint override, and toggles a saved key locally', () => {
      const { tab } = createHarness();
      document.body.append(tab.containerEl);
      tab.display();
      button(tab.containerEl, 'ai-text-provider-deepseek').click();

      const key = input(tab.containerEl, 'ai-text-deepseek-key');
      expect(input(tab.containerEl, 'ai-text-deepseek-base-url').value).toBe('https://api.deepseek.com');
      expect(tab.containerEl.querySelector('[data-testid="ai-text-deepseek-endpoint"]')).toBeNull();
      expect(key.type).toBe('password');
      expect(key.value).toBe('synthetic-saved-key');
      expect(key.parentElement?.classList.contains('wechat-workbench-settings__ai-key-control')).toBe(true);
      expect(key.parentElement?.querySelector('[data-testid="ai-text-deepseek-key-toggle"]')).not.toBeNull();

      button(tab.containerEl, 'ai-text-deepseek-key-toggle').click();
      expect(key.type).toBe('text');
      expect(button(tab.containerEl, 'ai-text-deepseek-key-toggle').getAttribute('aria-label')).toBe('隐藏 API Key');
    });

    it('keeps a compact fetched-model picker after writing a menu selection into the model input', async () => {
      const { tab, ai } = createHarness();
      ai.listModels.mockResolvedValueOnce(['agnes-2.5-flash', 'agnes-2.5-pro']);
      document.body.append(tab.containerEl);
      tab.display();

      button(tab.containerEl, 'fetch-text-agnes-models').click();

      await vi.waitFor(() => expect(tab.containerEl.querySelector('[data-testid="ai-text-agnes-fetched-model-toggle"]')).not.toBeNull());
      const picker = button(tab.containerEl, 'ai-text-agnes-fetched-model-toggle');
      expect(picker.getAttribute('aria-expanded')).toBe('false');
      picker.click();
      expect(picker.getAttribute('aria-expanded')).toBe('true');
      const menu = document.querySelector<HTMLElement>('[data-testid="ai-text-agnes-fetched-model-menu"]');
      expect(menu?.parentElement).toBe(document.body);
      expect(menu?.style.top).not.toBe('');
      expect(menu?.style.left).not.toBe('');
      expect(menu?.style.maxHeight).not.toBe('');
      button(document, 'ai-text-agnes-fetched-model-option-agnes-2.5-pro').click();

      expect(input(tab.containerEl, 'ai-text-agnes-model').value).toBe('agnes-2.5-pro');
      expect(tab.containerEl.querySelector('[data-testid="ai-text-agnes-fetched-model-toggle"]')).not.toBeNull();
      expect(tab.containerEl.querySelector('[data-testid="ai-text-agnes-fetched-model-menu"]')).toBeNull();
      expect(tab.containerEl.querySelector('.wechat-workbench-settings__ai-model-field')?.classList.contains('has-fetched-models'))
        .toBe(true);
    });

    it('opens the fetched-model menu in the settings window that owns the picker', async () => {
      const { tab, ai } = createHarness();
      ai.listModels.mockResolvedValueOnce(['agnes-2.5-flash', 'agnes-2.5-pro']);
      const settingsWindow = document.createElement('iframe');
      document.body.append(settingsWindow);
      const settingsDocument = settingsWindow.contentDocument;
      if (settingsDocument === null) throw new Error('Missing settings-window document');
      const settingsDomWindow = settingsDocument.defaultView;
      if (settingsDomWindow === null) throw new Error('Missing settings-window runtime');
      Object.defineProperty(settingsDocument, 'win', { configurable: true, value: settingsDomWindow });
      Object.assign(settingsDomWindow, {
        createDiv: (className?: string): HTMLDivElement => {
          const node = settingsDocument.createElement('div');
          if (className !== undefined) node.className = className;
          return node;
        },
        createEl: (tag: 'button', options?: { text?: string }): HTMLButtonElement => {
          const node = settingsDocument.createElement(tag);
          if (options?.text !== undefined) node.textContent = options.text;
          return node;
        },
      });
      settingsDocument.body.append(tab.containerEl);
      tab.display();

      button(settingsDocument, 'fetch-text-agnes-models').click();
      await vi.waitFor(() => expect(settingsDocument.querySelector('[data-testid="ai-text-agnes-fetched-model-toggle"]')).not.toBeNull());
      button(settingsDocument, 'ai-text-agnes-fetched-model-toggle').click();

      expect(settingsDocument.querySelector('[data-testid="ai-text-agnes-fetched-model-menu"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="ai-text-agnes-fetched-model-menu"]')).toBeNull();
      settingsWindow.remove();
    });

    it('keeps the fetched-model menu open while its own list scrolls', async () => {
      const { tab, ai } = createHarness();
      ai.listModels.mockResolvedValueOnce([
        'agnes-2.0-flash',
        'agnes-2.5-flash',
        'agnes-2.5-pro',
        'agnes-2.5-pro-alpha',
        'agnes-image-2.1-flash',
      ]);
      document.body.append(tab.containerEl);
      tab.display();

      button(tab.containerEl, 'fetch-text-agnes-models').click();
      await vi.waitFor(() => expect(tab.containerEl.querySelector('[data-testid="ai-text-agnes-fetched-model-toggle"]')).not.toBeNull());
      button(tab.containerEl, 'ai-text-agnes-fetched-model-toggle').click();
      const menu = button(document, 'ai-text-agnes-fetched-model-option-agnes-2.0-flash').parentElement;
      if (menu === null) throw new Error('Missing fetched-model menu');

      menu.dispatchEvent(new Event('scroll'));

      expect(document.querySelector('[data-testid="ai-text-agnes-fetched-model-menu"]')).not.toBeNull();
      button(document, 'ai-text-agnes-fetched-model-option-agnes-image-2.1-flash').click();
      expect(input(tab.containerEl, 'ai-text-agnes-model').value).toBe('agnes-image-2.1-flash');
    });

    it('closes the fetched-model menu when the outer settings viewport scrolls', async () => {
      const { tab } = createHarness();
      document.body.append(tab.containerEl);
      tab.display();

      button(tab.containerEl, 'fetch-text-agnes-models').click();
      await vi.waitFor(() => expect(tab.containerEl.querySelector('[data-testid="ai-text-agnes-fetched-model-toggle"]')).not.toBeNull());
      button(tab.containerEl, 'ai-text-agnes-fetched-model-toggle').click();
      expect(document.querySelector('[data-testid="ai-text-agnes-fetched-model-menu"]')).not.toBeNull();

      window.dispatchEvent(new Event('scroll'));

      expect(document.querySelector('[data-testid="ai-text-agnes-fetched-model-menu"]')).toBeNull();
    });

    it('clears temporary fetched models when the user switches provider or mode', async () => {
      const { tab } = createHarness();
      document.body.append(tab.containerEl);
      tab.display();

      button(tab.containerEl, 'fetch-text-agnes-models').click();
      await vi.waitFor(() => expect(tab.containerEl.querySelector('[data-testid="ai-text-agnes-fetched-model-toggle"]')).not.toBeNull());
      button(tab.containerEl, 'ai-text-agnes-fetched-model-toggle').click();
      expect(document.querySelector('[data-testid="ai-text-agnes-fetched-model-menu"]')).not.toBeNull();

      button(tab.containerEl, 'ai-text-provider-deepseek').click();
      expect(tab.containerEl.querySelector('[data-testid="ai-text-agnes-fetched-model-toggle"]')).toBeNull();
      expect(document.querySelector('[data-testid="ai-text-agnes-fetched-model-menu"]')).toBeNull();
      button(tab.containerEl, 'ai-mode-image').click();
      expect(tab.containerEl.querySelector('[data-testid="ai-image-agnes-fetched-model-toggle"]')).toBeNull();
    });
  });
});
