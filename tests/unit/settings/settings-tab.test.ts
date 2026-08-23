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
    saveText: vi.fn(async () => settings.current),
    saveImage: vi.fn(async () => settings.current),
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

function button(host: HTMLElement, testId: string): HTMLButtonElement {
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
    expect(presentation).toMatchObject({
      textApiEndpoint: '',
      textApiModel: '',
      imageApiEndpoint: '',
      imageApiModel: '',
    });
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

    it('renders one compact account section without exposing secrets', () => {
      const { tab } = createHarness();
      document.body.append(tab.containerEl);
      tab.display();

      expect(tab.containerEl.textContent).toContain('微信公众号');
      expect(tab.containerEl.textContent).toContain('公众号名称');
      expect(tab.containerEl.textContent).toContain('AppID');
      expect(tab.containerEl.textContent).toContain('AppSecret');
      expect(tab.containerEl.textContent).toContain('公众号基础连接正常');
      expect(tab.containerEl.textContent).toContain('上次验证：');
      expect(tab.containerEl.textContent).not.toContain('插件默认封面');
      expect(tab.containerEl.querySelector('[data-testid="default-cover-path"]')).toBeNull();
      expect(JSON.stringify(tab.containerEl.innerHTML)).not.toContain('SYNTHETIC_APP_SECRET');
      expect(input(tab.containerEl, 'account-secret').value).toBe('');
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
  });

  describe('ai service section', () => {
    beforeEach(() => {
      document.body.replaceChildren();
    });

    it('renders two independent cards without protocol or model discovery controls', () => {
      const { tab } = createHarness();
      document.body.append(tab.containerEl);
      tab.display();

      expect(tab.containerEl.textContent).toContain('AI 内容生成');
      expect(tab.containerEl.textContent).toContain('文本生成服务');
      expect(tab.containerEl.textContent).toContain('图片生成服务');
      expect(tab.containerEl.textContent).toContain('完整 Endpoint URL');
      expect(tab.containerEl.textContent).toContain('OpenAI compatible');
      expect(tab.containerEl.textContent).not.toContain('Anthropic');
      expect(tab.containerEl.textContent).not.toContain('获取模型');
      expect(tab.containerEl.textContent).not.toContain('可用模型');
      expect(tab.containerEl.querySelector('select')).toBeNull();
      expect(input(tab.containerEl, 'text-ai-endpoint')).toBeTruthy();
      expect(input(tab.containerEl, 'image-ai-endpoint')).toBeTruthy();
      expect(input(tab.containerEl, 'text-ai-model')).toBeTruthy();
      expect(input(tab.containerEl, 'image-ai-model')).toBeTruthy();
    });

    it('saves text configuration locally without making a network request', async () => {
      const { tab, ai } = createHarness();
      document.body.append(tab.containerEl);
      tab.display();
      input(tab.containerEl, 'text-ai-endpoint').value = 'https://text.example.test/v1/chat';
      input(tab.containerEl, 'text-ai-model').value = 'text-model';
      input(tab.containerEl, 'text-ai-key').value = 'synthetic-text-key';

      button(tab.containerEl, 'save-text-ai').click();

      await vi.waitFor(() => expect(ai.saveText).toHaveBeenCalledWith({
        endpoint: 'https://text.example.test/v1/chat',
        model: 'text-model',
        apiKey: 'synthetic-text-key',
      }));
      expect(tab.containerEl.textContent).toContain('已保存到本机 · 尚未联网验证');
      expect(input(tab.containerEl, 'text-ai-key').value).toBe('');
    });

    it('saves image configuration independently from text configuration', async () => {
      const { tab, ai } = createHarness();
      document.body.append(tab.containerEl);
      tab.display();
      input(tab.containerEl, 'image-ai-endpoint').value = 'https://images.example.test/v1/images';
      input(tab.containerEl, 'image-ai-model').value = 'image-model';
      button(tab.containerEl, 'save-image-ai').click();

      await vi.waitFor(() => expect(ai.saveImage).toHaveBeenCalledWith({
        endpoint: 'https://images.example.test/v1/images',
        model: 'image-model',
        apiKey: '',
      }));
      expect(ai.saveText).not.toHaveBeenCalled();
    });
  });
});
