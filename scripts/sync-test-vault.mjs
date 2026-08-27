import { copyFile, mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const primaryVault = resolve(homedir(), 'workspace', 'Github', 'commit_note');
const runtimeAssets = ['main.js', 'manifest.json', 'styles.css'];

function isInside(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === '' || !pathFromParent.startsWith(`..${sep}`) && pathFromParent !== '..';
}

async function assertDirectory(path, label) {
  const info = await stat(path);
  if (!info.isDirectory()) throw new Error(`${label} is not a directory: ${path}`);
}

async function syncTestVault() {
  const configuredVault = process.env.WECHAT_WORKBENCH_TEST_VAULT;
  if (configuredVault === undefined || configuredVault.length === 0) {
    throw new Error('WECHAT_WORKBENCH_TEST_VAULT is required');
  }
  if (!isAbsolute(configuredVault)) {
    throw new Error('WECHAT_WORKBENCH_TEST_VAULT must be an absolute path');
  }

  const vault = resolve(configuredVault);
  if (isInside(primaryVault, vault)) {
    throw new Error('Refusing to use the primary vault');
  }

  await assertDirectory(vault, 'Test vault');
  await assertDirectory(join(vault, '.obsidian'), 'Test vault .obsidian directory');

  for (const asset of runtimeAssets) {
    const source = join(projectRoot, asset);
    const info = await stat(source);
    if (!info.isFile() || info.size === 0) throw new Error(`Runtime asset is missing or empty: ${asset}`);
  }

  const destination = join(vault, '.obsidian', 'plugins', 'wechat-workbench');
  await mkdir(destination, { recursive: true });
  await Promise.all(runtimeAssets.map(asset => (
    copyFile(join(projectRoot, asset), join(destination, asset))
  )));

  process.stdout.write(`Synced ${runtimeAssets.length} runtime assets to the isolated test vault.\n`);
}

try {
  await syncTestVault();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown sync failure';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
