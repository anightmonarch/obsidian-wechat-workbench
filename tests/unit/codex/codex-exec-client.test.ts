import { describe, expect, it, vi } from 'vitest';

import { CodexExecClient } from '../../../src/codex/codex-exec-client';
import { CodexRuntimeError } from '../../../src/codex/codex-errors';
import type { CodexLocatorPort } from '../../../src/codex/codex-locator';
import type { CodexProcessRunnerPort } from '../../../src/codex/codex-process-runner';

const location = { executablePath: '/opt/homebrew/bin/codex', version: 'codex-cli 0.141.0' };

function clientFor(result: Awaited<ReturnType<CodexProcessRunnerPort['run']>>) {
  const locator: CodexLocatorPort = { locate: vi.fn(async () => location) };
  const run = vi.fn(async (_request: Parameters<CodexProcessRunnerPort['run']>[0]) => result);
  const runner: CodexProcessRunnerPort = { run };
  const temporary = {
    create: vi.fn(async () => '/tmp/wechat-workbench-codex-test'),
    remove: vi.fn(async () => undefined),
  };
  return { client: new CodexExecClient(locator, runner, temporary, () => ({
    HOME: '/home/user', PATH: '/bin', API_KEY: 'must-not-pass',
  })), locator, runner, run, temporary };
}

describe('CodexExecClient', () => {
  it('uses stable restricted arguments, sends the prompt through stdin, and keeps a minimal environment', async () => {
    const fixture = clientFor({
      exitCode: 0,
      stdout: [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
        JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '{"ok":true}' } }),
        JSON.stringify({ type: 'turn.completed' }),
      ].join('\n'),
      stderr: 'non-fatal warning',
    });

    await expect(fixture.client.exec({
      configuredExecutablePath: '',
      sandbox: 'read-only',
      prompt: 'synthetic prompt',
      timeoutMs: 120_000,
      imageGeneration: false,
    })).resolves.toEqual({ threadId: 'thread-1', finalMessage: '{"ok":true}', completed: true });

    const request = fixture.run.mock.calls[0]?.[0];
    expect(request?.args).toEqual([
      'exec', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check',
      '--ignore-rules', '--ignore-user-config', '--disable', 'shell_tool',
      '--disable', 'apps', '--disable', 'browser_use', '--disable', 'computer_use',
      '--disable', 'plugins', '--disable', 'image_generation', '--json', '-',
    ]);
    expect(request?.stdin).toBe('synthetic prompt');
    expect(request?.args).not.toContain('synthetic prompt');
    expect(request?.env).toEqual({ HOME: '/home/user', PATH: '/bin' });
    expect(fixture.temporary.remove).toHaveBeenCalledWith('/tmp/wechat-workbench-codex-test');
  });

  it('ignores reconnect events and returns the final completed message', async () => {
    const fixture = clientFor({
      exitCode: 0,
      stdout: [
        '{not-json}',
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
        JSON.stringify({ type: 'error', message: 'Reconnecting...' }),
        JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'first' } }),
        JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'final' } }),
        JSON.stringify({ type: 'turn.completed' }),
      ].join('\n'),
      stderr: 'warning',
    });

    await expect(fixture.client.exec({
      configuredExecutablePath: '', sandbox: 'read-only', prompt: 'x', timeoutMs: 1_000,
      imageGeneration: false,
    })).resolves.toMatchObject({ finalMessage: 'final', completed: true });
  });

  it('maps an explicit authentication failure without exposing stderr', async () => {
    const fixture = clientFor({
      exitCode: 1,
      stdout: '',
      stderr: 'Not logged in. Run codex login. synthetic-secret',
    });

    await expect(fixture.client.exec({
      configuredExecutablePath: '', sandbox: 'read-only', prompt: 'x', timeoutMs: 1_000,
      imageGeneration: false,
    })).rejects.toEqual(new CodexRuntimeError('CODEX_NOT_AUTHENTICATED'));
  });
});
