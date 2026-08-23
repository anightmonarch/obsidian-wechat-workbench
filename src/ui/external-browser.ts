import { shell } from 'electron';

export const WECHAT_OFFICIAL_CONSOLE_URL = 'https://mp.weixin.qq.com/';

export interface ExternalBrowserPort {
  open(url: string): Promise<void>;
}

export class ElectronExternalBrowser implements ExternalBrowserPort {
  async open(url: string): Promise<void> {
    if (url !== WECHAT_OFFICIAL_CONSOLE_URL) {
      throw new Error('只允许打开固定公众号后台地址。');
    }
    await shell.openExternal(url);
  }
}

export function openWeChatOfficialConsole(
  browser: ExternalBrowserPort = new ElectronExternalBrowser(),
): Promise<void> {
  return browser.open(WECHAT_OFFICIAL_CONSOLE_URL);
}
