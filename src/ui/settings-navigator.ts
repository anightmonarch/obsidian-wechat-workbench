export function openPluginSettings(
  fallback: () => void,
): boolean {
  // Obsidian exposes addSettingTab(), but not a public API for selecting a tab.
  // Keep this explicit so the UI never depends on app.setting internals.
  fallback();
  return false;
}
