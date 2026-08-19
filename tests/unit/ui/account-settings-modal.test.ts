import { describe, expect, it, vi } from 'vitest';

import '../../mocks/obsidian';
import { DEFAULT_SETTINGS, type PluginSettings } from '../../../src/settings/model';
import { SecretStore, type SecretStoragePort } from '../../../src/settings/secret-store';
import { AccountSettingsModal } from '../../../src/ui/account-settings-modal';

class MemorySecrets implements SecretStoragePort {
  readonly values = new Map<string, string>();

  setSecret(id: string, secret: string): void { this.values.set(id, secret); }
  getSecret(id: string): string | null { return this.values.get(id) ?? null; }
}

describe('AccountSettingsModal', () => {
  it('renders local account controls without prefilling secrets', async () => {
    const secrets = new MemorySecrets();
    secrets.setSecret('wechat-workbench-app-secret', 'synthetic-secret');
    const settings = {
      get: () => DEFAULT_SETTINGS,
      update: vi.fn(async (patch: Partial<PluginSettings>) => ({ ...DEFAULT_SETTINGS, ...patch })),
    };
    const modal = new AccountSettingsModal({} as never, settings, new SecretStore(secrets));

    modal.open();

    expect(modal.titleEl.textContent).toBe('本地公众号账号');
    expect(modal.contentEl.textContent).toContain('公众号 AppID');
    expect(modal.contentEl.textContent).toContain('AppSecret');
    expect(modal.contentEl.textContent).toContain('Access token');
    expect(modal.contentEl.querySelector<HTMLInputElement>('[data-testid="account-app-secret"]')?.value)
      .toBe('');
    expect(modal.contentEl.textContent).not.toContain('synthetic-secret');
  });

  it('writes a newly entered AppSecret only through SecretStorage', async () => {
    const secrets = new MemorySecrets();
    const settings = {
      get: () => DEFAULT_SETTINGS,
      update: vi.fn(async (patch: Partial<PluginSettings>) => ({ ...DEFAULT_SETTINGS, ...patch })),
    };
    const modal = new AccountSettingsModal({} as never, settings, new SecretStore(secrets));
    modal.open();

    const input = modal.contentEl.querySelector<HTMLInputElement>('[data-testid="account-app-secret"]');
    if (input === null) throw new Error('AppSecret input missing.');
    input.value = 'new-secret';
    input.dispatchEvent(new Event('change'));
    modal.contentEl.querySelector<HTMLButtonElement>('[data-testid="account-secret-save"]')?.click();
    await Promise.resolve();

    expect(secrets.getSecret('wechat-workbench-app-secret')).toBe('new-secret');
    expect(settings.update).not.toHaveBeenCalledWith({ appSecret: 'new-secret' });
  });
});
