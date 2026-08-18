import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runNode(
  script: string,
  args: string[] = [],
  env: NodeJS.ProcessEnv = {},
): Promise<ProcessResult> {
  try {
    const result = await execFileAsync(process.execPath, [script, ...args], {
      cwd: projectRoot,
      env: { ...process.env, ...env },
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
    };
  }
}

async function makeTempVault(): Promise<string> {
  const vault = await mkdtemp(join(tmpdir(), 'wechat-workbench-vault-'));
  await mkdir(join(vault, '.obsidian'));
  return vault;
}

describe('local development scripts', () => {
  it('copies only Obsidian runtime assets into the plugin folder', async () => {
    const vault = await makeTempVault();

    const result = await runNode('scripts/sync-test-vault.mjs', [], {
      WECHAT_WORKBENCH_TEST_VAULT: vault,
    });

    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    const files = await readdir(join(vault, '.obsidian', 'plugins', 'wechat-workbench'));
    expect(files.sort()).toEqual(['main.js', 'manifest.json', 'styles.css']);
  });

  it('refuses the primary knowledge vault', async () => {
    const result = await runNode('scripts/sync-test-vault.mjs', [], {
      WECHAT_WORKBENCH_TEST_VAULT: '$HOME/workspace/Github/commit_note',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Refusing to use the primary vault');
  });

  it('verifies the current release assets', async () => {
    const result = await runNode('scripts/verify-release.mjs');

    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(result.stdout).toContain('Release assets verified');
  });

  it('fails when a scanned directory contains a credential-shaped value', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wechat-workbench-secret-scan-'));
    const synthetic = ['sk', 'proj', 'a'.repeat(40)].join('-');
    await writeFile(join(root, 'leak.txt'), `imageApiKey = "${synthetic}"\n`);

    const result = await runNode('scripts/scan-secrets.mjs', ['--root', root]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Potential secret detected');
    expect(result.stderr).not.toContain(synthetic);
  });
});
