import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import {
  augmentCodexPath,
  CodexProcessRunner,
  codexEnvironment,
  type CodexSpawn,
} from '../../../src/codex/codex-process-runner';

class FakeStdin extends EventEmitter {
  readonly end = vi.fn();
}

class FakeChild extends EventEmitter {
  readonly stdin = new FakeStdin();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly kill = vi.fn(() => true);
}

function request(overrides: Partial<Parameters<CodexProcessRunner['run']>[0]> = {}) {
  return {
    executable: '/synthetic/codex',
    args: ['--version'],
    cwd: '/tmp',
    timeoutMs: 1_000,
    maxStdoutBytes: 64,
    maxStderrBytes: 64,
    env: { HOME: '/home/user', PATH: '/bin' },
    ...overrides,
  };
}

describe('CodexProcessRunner', () => {
  it('uses an argument array, disables shell, closes stdin and preserves only the supplied environment', async () => {
    const child = new FakeChild();
    const spawnMock = vi.fn((_command: string, _args: readonly string[], _options: unknown) => child);
    const spawn = spawnMock as unknown as CodexSpawn;
    const runner = new CodexProcessRunner(spawn);

    const pending = runner.run(request({ stdin: 'private prompt' }));
    child.stdout.end('codex-cli 0.141.0');
    child.stderr.end('warning');
    child.emit('close', 0, null);

    await expect(pending).resolves.toEqual({
      exitCode: 0,
      stdout: 'codex-cli 0.141.0',
      stderr: 'warning',
    });
    expect(spawnMock).toHaveBeenCalledWith('/synthetic/codex', ['--version'], {
      cwd: '/tmp',
      env: { HOME: '/home/user', PATH: '/bin' },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    expect(child.stdin.end).toHaveBeenCalledWith('private prompt');
    expect(JSON.stringify(spawnMock.mock.calls[0]?.[2])).not.toContain('API_KEY');
  });

  it('kills a timed-out child and returns CODEX_TIMEOUT', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const runner = new CodexProcessRunner(vi.fn(() => child) as unknown as CodexSpawn);

    const pending = runner.run(request({ timeoutMs: 10 }));
    const rejection = expect(pending).rejects.toMatchObject({ code: 'CODEX_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(11);

    await rejection;
    expect(child.kill).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('waits for the process result when stdin closes early with EPIPE', async () => {
    const child = new FakeChild();
    const runner = new CodexProcessRunner(vi.fn(() => child) as unknown as CodexSpawn);

    const pending = runner.run(request({ stdin: 'private prompt' }));
    child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
    child.stderr.end('Not logged in.');
    child.emit('close', 1, null);

    await expect(pending).resolves.toMatchObject({ exitCode: 1, stderr: 'Not logged in.' });
  });

  it('kills and rejects stdout beyond its byte limit', async () => {
    const child = new FakeChild();
    const runner = new CodexProcessRunner(vi.fn(() => child) as unknown as CodexSpawn);

    const pending = runner.run(request());
    child.stdout.write(Buffer.alloc(65));

    await expect(pending).rejects.toMatchObject({ code: 'CODEX_OUTPUT_TOO_LARGE' });
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('maps an aborted request to CODEX_CANCELLED', async () => {
    const child = new FakeChild();
    const runner = new CodexProcessRunner(vi.fn(() => child) as unknown as CodexSpawn);
    const controller = new AbortController();

    const pending = runner.run(request({ signal: controller.signal }));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'CODEX_CANCELLED' });
    expect(child.kill).toHaveBeenCalledOnce();
  });
});

describe('codexEnvironment PATH augmentation', () => {
  it('prepends common prefixes when Obsidian GUI PATH is short', () => {
    expect(augmentCodexPath('/usr/bin:/bin', '/Users/demo')).toBe(
      '/opt/homebrew/bin:/usr/local/bin:/Users/demo/.n/bin:/Users/demo/.local/bin:/usr/bin:/bin',
    );
  });

  it('does not duplicate prefixes already present', () => {
    const existing = '/Users/demo/.n/bin:/opt/homebrew/bin:/usr/bin';
    expect(augmentCodexPath(existing, '/Users/demo')).toBe(
      '/usr/local/bin:/Users/demo/.local/bin:/Users/demo/.n/bin:/opt/homebrew/bin:/usr/bin',
    );
  });

  it('always sets PATH even when the source omitted it', () => {
    expect(codexEnvironment({ HOME: '/Users/demo' })).toEqual({
      HOME: '/Users/demo',
      PATH: '/opt/homebrew/bin:/usr/local/bin:/Users/demo/.n/bin:/Users/demo/.local/bin',
    });
  });

  it('keeps existing PATH entries while forwarding only allowlisted keys', () => {
    const env = codexEnvironment({
      HOME: '/Users/demo',
      PATH: '/usr/bin:/bin',
      SECRET: 'nope',
      LANG: 'en_US.UTF-8',
    });
    expect(env).toEqual({
      HOME: '/Users/demo',
      PATH: '/opt/homebrew/bin:/usr/local/bin:/Users/demo/.n/bin:/Users/demo/.local/bin:/usr/bin:/bin',
      LANG: 'en_US.UTF-8',
    });
    expect(JSON.stringify(env)).not.toContain('SECRET');
  });
});
