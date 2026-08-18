import { clipboard } from 'electron';

import type { ClipboardPort, ClipboardWrite } from './clipboard-service';

export class ElectronClipboardPort implements ClipboardPort {
  write(content: Readonly<ClipboardWrite>): void {
    clipboard.write(content);
  }
}
