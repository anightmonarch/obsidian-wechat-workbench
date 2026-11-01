import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';

import { CodexRuntimeError } from './codex-errors';

export interface CodexRunRequest {
  executable: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  env: Readonly<Record<string, string>>;
  stdin?: string;
  signal?: AbortSignal;
}

export interface CodexRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CodexProcessRunnerPort {
  run(request: Readonly<CodexRunRequest>): Promise<Readonly<CodexRunResult>>;
}

export type CodexSpawn = typeof spawn;

const ALLOWED_ENVIRONMENT_KEYS = Object.freeze([
  'HOME', 'CODEX_HOME', 'PATH', 'TMPDIR', 'TMP', 'TEMP',
  'USER', 'USERNAME', 'LANG', 'LC_ALL',
] as const);

const COMMON_PATH_PREFIXES = Object.freeze([
  '/opt/homebrew/bin',
  '/usr/local/bin',
] as const);

/** Ensure GUI-short PATH still finds Homebrew / ~/.n / ~/.local for node shebangs. */
export function augmentCodexPath(
  existingPath: string,
  home: string | undefined,
): string {
  const parts = existingPath.split(':').map(part => part.trim()).filter(part => part.length > 0);
  const seen = new Set(parts);
  const prefixes: string[] = [...COMMON_PATH_PREFIXES];
  if (typeof home === 'string' && home.length > 0) {
    prefixes.push(`${home}/.n/bin`, `${home}/.local/bin`);
  }
  const missing = prefixes.filter(prefix => !seen.has(prefix));
  return [...missing, ...parts].join(':');
}

export function codexEnvironment(
  source: Readonly<Record<string, string | undefined>> = process.env,
): Readonly<Record<string, string>> {
  const entries: Array<readonly [string, string]> = [];
  for (const key of ALLOWED_ENVIRONMENT_KEYS) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) entries.push([key, value]);
  }
  const env = Object.fromEntries(entries) as Record<string, string>;
  const home = typeof source.HOME === 'string' && source.HOME.length > 0 ? source.HOME : undefined;
  env.PATH = augmentCodexPath(env.PATH ?? '', home);
  return Object.freeze(env);
}

function spawnFailure(error: unknown): CodexRuntimeError {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  return new CodexRuntimeError(code === 'ENOENT' ? 'CODEX_NOT_FOUND' : 'CODEX_PROCESS_FAILED');
}

export class CodexProcessRunner implements CodexProcessRunnerPort {
  constructor(private readonly spawnProcess: CodexSpawn = spawn) {}

  run(request: Readonly<CodexRunRequest>): Promise<Readonly<CodexRunResult>> {
    if (request.signal?.aborted === true) {
      return Promise.reject(new CodexRuntimeError('CODEX_CANCELLED'));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let stdoutBytes = 0;
      let stderrBytes = 0;
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      const child = this.spawnProcess(request.executable, [...request.args], {
        cwd: request.cwd,
        env: { ...request.env },
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const cleanup = (): void => {
        window.clearTimeout(timer);
        request.signal?.removeEventListener('abort', onAbort);
      };
      const finish = (operation: () => void): void => {
        if (settled) return;
        settled = true;
        cleanup();
        operation();
      };
      const stop = (error: CodexRuntimeError): void => finish(() => {
        child.kill();
        reject(error);
      });
      const onAbort = (): void => stop(new CodexRuntimeError('CODEX_CANCELLED'));
      const timer = window.setTimeout(
        () => stop(new CodexRuntimeError('CODEX_TIMEOUT')),
        Math.max(1, request.timeoutMs),
      );

      child.stdout.on('data', (chunk: Buffer | string) => {
        if (settled) return;
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        stdoutBytes += value.byteLength;
        if (stdoutBytes > request.maxStdoutBytes) {
          stop(new CodexRuntimeError('CODEX_OUTPUT_TOO_LARGE'));
          return;
        }
        stdout.push(value);
      });
      child.stderr.on('data', (chunk: Buffer | string) => {
        if (settled) return;
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        stderrBytes += value.byteLength;
        if (stderrBytes > request.maxStderrBytes) {
          stop(new CodexRuntimeError('CODEX_OUTPUT_TOO_LARGE'));
          return;
        }
        stderr.push(value);
      });
      child.stdin.on('error', () => {
        // The CLI can close stdin before the prompt write finishes (for example,
        // on authentication failure). Its exit code and stderr remain authoritative.
      });
      child.once('error', error => finish(() => reject(spawnFailure(error))));
      child.once('close', code => finish(() => {
        if (code === null) {
          reject(new CodexRuntimeError('CODEX_PROCESS_FAILED'));
          return;
        }
        resolve(Object.freeze({
          exitCode: code,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        }));
      }));
      request.signal?.addEventListener('abort', onAbort, { once: true });
      child.stdin.end(request.stdin);
    });
  }
}
