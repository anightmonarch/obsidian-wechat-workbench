import { describe, expect, it, vi } from 'vitest';
import { shell } from 'electron';

import {
  ElectronExternalBrowser,
  openWeChatOfficialConsole,
  WECHAT_OFFICIAL_CONSOLE_URL,
  type ExternalBrowserPort,
} from '../../../src/ui/external-browser';

describe('external browser entry', () => {
  it('opens only the fixed official-account backend URL', async () => {
    const open = vi.fn(async () => undefined);
    const browser: ExternalBrowserPort = { open };

    await openWeChatOfficialConsole(browser);

    expect(open).toHaveBeenCalledWith(WECHAT_OFFICIAL_CONSOLE_URL);
  });

  it('does not allow the Electron adapter to open another URL', async () => {
    const openExternal = vi.spyOn(shell, 'openExternal').mockResolvedValue(undefined);

    await expect(new ElectronExternalBrowser().open('https://evil.example.test'))
      .rejects.toThrow('固定公众号后台地址');
    expect(openExternal).not.toHaveBeenCalled();
  });
});
