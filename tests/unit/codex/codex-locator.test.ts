import { describe, expect, it, vi } from 'vitest';

import { CodexLocator } from '../../../src/codex/codex-locator';
import { CodexRuntimeError } from '../../../src/codex/codex-errors';
import type { CodexProcessRunnerPort } from '../../../src/codex/codex-process-runner';

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

  it('falls back to the PATH command after a configured path fails', async () => {
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
      .toEqual(['/missing/codex', 'codex']);
  });

  it('returns CODEX_NOT_FOUND after every candidate fails', async () => {
    const runner: CodexProcessRunnerPort = {
      run: vi.fn(async () => { throw new CodexRuntimeError('CODEX_NOT_FOUND'); }),
    };

    await expect(new CodexLocator(runner).locate(''))
      .rejects.toMatchObject({ code: 'CODEX_NOT_FOUND' });
  });
});
