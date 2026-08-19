import { describe, expect, it, vi } from 'vitest';

import { openPluginSettings } from '../../../src/ui/settings-navigator';

describe('openPluginSettings', () => {
  it('opens the plugin settings tab without requiring a login session', () => {
    const open = vi.fn();
    const openTabById = vi.fn();
    const fallback = vi.fn();

    const opened = openPluginSettings({ setting: { open, openTabById } }, 'wechat-workbench', fallback);

    expect(opened).toBe(true);
    expect(open).toHaveBeenCalledOnce();
    expect(openTabById).toHaveBeenCalledWith('wechat-workbench');
    expect(fallback).not.toHaveBeenCalled();
  });

  it('keeps the workbench usable when the host cannot open settings directly', () => {
    const fallback = vi.fn();

    expect(openPluginSettings({}, 'wechat-workbench', fallback)).toBe(false);
    expect(fallback).toHaveBeenCalledOnce();
  });
});
