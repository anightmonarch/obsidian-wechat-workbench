import { readFile, stat } from 'node:fs/promises';

const EXPECTED = Object.freeze({
  id: 'wechat-workbench',
  name: 'WeChat Workbench',
  minAppVersion: '1.11.4',
  isDesktopOnly: true,
});
const REQUIRED_DOCS = Object.freeze([
  'README.md', 'LICENSE', 'SECURITY.md', 'PRIVACY.md',
  'docs/user-guide/getting-started.md',
  'docs/user-guide/themes.md',
  'docs/user-guide/covers.md',
  'docs/user-guide/recovery.md',
  'docs/user-guide/wechat-ip-whitelist.md',
]);
const FORBIDDEN_WECHAT_ENDPOINTS = Object.freeze([
  '/cgi-bin/freepublish/',
  '/cgi-bin/message/mass/',
  '/cgi-bin/draft/delete',
]);

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
  const packageJson = await readJson('package.json');

  for (const [key, expected] of Object.entries(EXPECTED)) {
    assertEqual(manifest[key], expected, `manifest.${key}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error(`manifest.version is not semantic x.y.z: ${String(manifest.version)}`);
  }
  assertEqual(versions[manifest.version], manifest.minAppVersion, 'versions.json mapping');
  assertEqual(packageJson.version, manifest.version, 'package.json version');
  assertEqual(packageJson.license, 'MIT', 'package.json license');

  await Promise.all([
    assertNonEmptyFile('main.js'),
    assertNonEmptyFile('manifest.json'),
    assertNonEmptyFile('styles.css'),
    ...REQUIRED_DOCS.map(assertNonEmptyFile),
  ]);

  const bundle = await readFile('main.js', 'utf8');
  for (const endpoint of FORBIDDEN_WECHAT_ENDPOINTS) {
    if (bundle.includes(endpoint)) throw new Error(`Forbidden WeChat endpoint found in bundle: ${endpoint}`);
  }

  process.stdout.write('Release assets verified; public contracts verified.\n');
}

try {
  await verifyRelease();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown release verification failure';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
