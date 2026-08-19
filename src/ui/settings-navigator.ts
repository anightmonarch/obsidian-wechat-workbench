interface SettingsHost {
  setting?: {
    open(): void;
    openTabById(id: string): void;
  };
}

function hasSettingsHost(app: unknown): app is SettingsHost {
  if (typeof app !== 'object' || app === null || !('setting' in app)) return false;
  const setting = (app as { setting?: unknown }).setting;
  return typeof setting === 'object'
    && setting !== null
    && 'open' in setting
    && 'openTabById' in setting
    && typeof (setting as { open?: unknown }).open === 'function'
    && typeof (setting as { openTabById?: unknown }).openTabById === 'function';
}

export function openPluginSettings(
  app: unknown,
  pluginId: string,
  fallback: () => void,
): boolean {
  if (!hasSettingsHost(app) || app.setting === undefined) {
    fallback();
    return false;
  }
  app.setting.open();
  app.setting.openTabById(pluginId);
  return true;
}
