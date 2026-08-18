import { readFile, stat } from 'node:fs/promises';

const EXPECTED = Object.freeze({
  id: 'wechat-workbench',
  name: 'WeChat Workbench',
  minAppVersion: '1.11.4',
  isDesktopOnly: true,
});

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function assertNonEmptyFile(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size === 0) throw new Error(`Release asset is missing or empty: ${path}`);
}

async function verifyRelease() {
  const manifest = await readJson('manifest.json');
  const versions = await readJson('versions.json');

  for (const [key, expected] of Object.entries(EXPECTED)) {
    assertEqual(manifest[key], expected, `manifest.${key}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error(`manifest.version is not semantic x.y.z: ${String(manifest.version)}`);
  }
  assertEqual(versions[manifest.version], manifest.minAppVersion, 'versions.json mapping');

  await Promise.all([
    assertNonEmptyFile('main.js'),
    assertNonEmptyFile('manifest.json'),
    assertNonEmptyFile('styles.css'),
  ]);

  process.stdout.write('Release assets verified: main.js, manifest.json, styles.css.\n');
}

try {
  await verifyRelease();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown release verification failure';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
