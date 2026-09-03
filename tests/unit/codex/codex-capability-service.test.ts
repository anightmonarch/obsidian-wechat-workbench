import { describe, expect, it, vi } from 'vitest';

import { CodexCapabilityService } from '../../../src/codex/codex-capability-service';
import { CodexRuntimeError } from '../../../src/codex/codex-errors';
import type { CodexLocatorPort } from '../../../src/codex/codex-locator';
import type { CodexProcessRunnerPort } from '../../../src/codex/codex-process-runner';

describe('CodexCapabilityService', () => {
  it('detects image_generation from features list without invoking a model', async () => {
    const locator: CodexLocatorPort = {
      locate: vi.fn(async () => ({
        executablePath: '/opt/homebrew/bin/codex', version: 'codex-cli 0.141.0',
      })),
    };
    const run = vi.fn(async (_request: Parameters<CodexProcessRunnerPort['run']>[0]) => ({
        exitCode: 0, stdout: 'image_generation stable true\nplugins stable true\n', stderr: '',
      }));
    const runner: CodexProcessRunnerPort = { run };

    await expect(new CodexCapabilityService(locator, runner, () => ({ HOME: '/home/user' }))
      .detect('')).resolves.toEqual({
        available: true,
        executablePath: '/opt/homebrew/bin/codex',
        version: 'codex-cli 0.141.0',
        imageGeneration: true,
        errorCode: null,
      });
    expect(run.mock.calls[0]?.[0].args).toEqual(['features', 'list']);
  });

  it('returns a public unavailable status when Codex is not found', async () => {
    const locator: CodexLocatorPort = {
      locate: vi.fn(async () => { throw new CodexRuntimeError('CODEX_NOT_FOUND'); }),
    };
    const runner: CodexProcessRunnerPort = { run: vi.fn() };

    await expect(new CodexCapabilityService(locator, runner).detect('')).resolves.toEqual({
      available: false,
      executablePath: null,
      version: null,
      imageGeneration: false,
      errorCode: 'CODEX_NOT_FOUND',
    });
  });
});
