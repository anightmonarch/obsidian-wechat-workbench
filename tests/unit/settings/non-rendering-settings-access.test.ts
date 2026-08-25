import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS, type PluginSettings } from '../../../src/settings/model';
import { createNonRenderingSettingsAccess } from '../../../src/settings/non-rendering-settings-access';

describe('createNonRenderingSettingsAccess', () => {
  it('persists account and AI changes without a workbench-refresh dependency', async () => {
    const current = { ...DEFAULT_SETTINGS };
    const update = vi.fn(async (patch: Partial<PluginSettings>) => ({ ...current, ...patch }));
    const access = createNonRenderingSettingsAccess(() => current, update);

    await access.update({ accountDisplayName: 'Commit 日记' });
    await access.update({ textApiModel: 'agnes-2.5-flash' });

    expect(access.get()).toBe(current);
    expect(update).toHaveBeenNthCalledWith(1, { accountDisplayName: 'Commit 日记' });
    expect(update).toHaveBeenNthCalledWith(2, { textApiModel: 'agnes-2.5-flash' });
  });
});
