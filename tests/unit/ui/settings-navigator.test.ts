import { describe, expect, it, vi } from 'vitest';

import { openPluginSettings } from '../../../src/ui/settings-navigator';

describe('openPluginSettings', () => {
  it('uses the official settings fallback without probing private Obsidian APIs', () => {
    const fallback = vi.fn();

    const opened = openPluginSettings(fallback);

    expect(opened).toBe(false);
    expect(fallback).toHaveBeenCalledOnce();
  });
});
