import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../../../src/settings/model';
import { buildSettingsPresentation } from '../../../src/settings/settings-tab';

describe('buildSettingsPresentation', () => {
  it('shows configuration status without exposing stored secret values', () => {
    const presentation = buildSettingsPresentation(DEFAULT_SETTINGS, {
      appSecret: true,
      accessToken: true,
      imageApiKey: false,
    });

    expect(presentation.appIdValue).toBe('');
    expect(presentation.secretRows).toEqual([
      { kind: 'appSecret', label: 'AppSecret', status: '已配置', inputValue: '' },
      { kind: 'imageApiKey', label: '图片 API Key', status: '未配置', inputValue: '' },
    ]);
    expect(JSON.stringify(presentation)).not.toContain('accessToken');
  });
});
