import { describe, expect, it, vi } from 'vitest';

import { CodexLocator, codexCandidates } from '../../../src/codex/codex-locator';
import { CodexRuntimeError } from '../../../src/codex/codex-errors';
import type { CodexProcessRunnerPort } from '../../../src/codex/codex-process-runner';

describe('codexCandidates', () => {
  it('puts absolute darwin hints before bare codex after configuredPath', () => {
    const values = codexCandidates('/custom/codex', {
      platform: 'darwin',
      home: '/Users/demo',
    });
    expect(values).toEqual([
      '/custom/codex',
      '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
      '/Users/demo/.n/bin/codex',
      '/Users/demo/.local/bin/codex',
      '/opt/homebrew/bin/codex',
      '/usr/local/bin/codex',
      'codex',
    ]);
  });

  it('includes linux home and brew-style absolute hints without ChatGPT.app', () => {
    const values = codexCandidates('', { platform: 'linux', home: '/home/demo' });
    expect(values).toEqual([
      '/home/demo/.n/bin/codex',
      '/home/demo/.local/bin/codex',
      '/opt/homebrew/bin/codex',
      '/usr/local/bin/codex',
      'codex',
    ]);
  });
});

describe('CodexLocator', () => {
  it('prefers and verifies the configured executable', async () => {
    const run = vi.fn(async (request: Parameters<CodexProcessRunnerPort['run']>[0]) => ({
        exitCode: request.executable === '/custom/codex' ? 0 : 1,
        stdout: 'codex-cli 0.141.0\n',
        stderr: '',
      }));
    const runner: CodexProcessRunnerPort = { run };

    await expect(new CodexLocator(runner).locate('/custom/codex')).resolves.toEqual({
      executablePath: '/custom/codex',
      version: 'codex-cli 0.141.0',
    });
    expect(run).toHaveBeenCalledOnce();
  });

  it('prefers an absolute candidate over bare PATH when configured path fails', async () => {
    const run = vi.fn(async (request: Parameters<CodexProcessRunnerPort['run']>[0]) => {
      if (request.executable === '/Users/demo/.n/bin/codex') {
        return { exitCode: 0, stdout: 'codex-cli 0.165.0-alpha.1.2', stderr: '' };
      }
      throw new CodexRuntimeError('CODEX_NOT_FOUND');
    });
    const env = () => ({ HOME: '/Users/demo', PATH: '/usr/bin:/bin' });

    await expect(new CodexLocator({ run }, env).locate('/missing/codex')).resolves.toEqual({
      executablePath: '/Users/demo/.n/bin/codex',
      version: 'codex-cli 0.165.0-alpha.1.2',
    });
    const tried = run.mock.calls.map(call => call[0].executable);
    expect(tried[0]).toBe('/missing/codex');
    expect(tried).toContain('/Users/demo/.n/bin/codex');
    expect(tried).not.toContain('codex');
  });

  it('falls back to the PATH command after absolute candidates fail', async () => {
    const run = vi.fn(async (request: Parameters<CodexProcessRunnerPort['run']>[0]) => {
      if (request.executable === 'codex') {
        return { exitCode: 0, stdout: 'codex-cli 0.141.0', stderr: '' };
      }
      throw new CodexRuntimeError('CODEX_NOT_FOUND');
    });

    await expect(new CodexLocator({ run }).locate('/missing/codex')).resolves.toMatchObject({
      executablePath: 'codex',
    });
    expect(run.mock.calls.map(call => call[0].executable).slice(0, 2))
      .toEqual(['/missing/codex', expect.any(String)]);
  });

  it('returns CODEX_NOT_FOUND after every candidate fails', async () => {
    const runner: CodexProcessRunnerPort = {
      run: vi.fn(async () => { throw new CodexRuntimeError('CODEX_NOT_FOUND'); }),
    };

    await expect(new CodexLocator(runner).locate(''))
      .rejects.toMatchObject({ code: 'CODEX_NOT_FOUND' });
  });
});
