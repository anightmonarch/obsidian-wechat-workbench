import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CodexRuntimeError } from './codex-errors';
import type { CodexLocatorPort } from './codex-locator';
import {
  codexEnvironment,
  type CodexProcessRunnerPort,
} from './codex-process-runner';

export interface CodexTemporaryDirectoryPort {
  create(): Promise<string>;
  remove(path: string): Promise<void>;
}

export interface CodexExecRequest {
  configuredExecutablePath: string;
  sandbox: 'read-only' | 'workspace-write';
  prompt: string;
  timeoutMs: number;
  imageGeneration: boolean;
  signal?: AbortSignal;
}

export interface CodexExecResult {
  threadId: string;
  finalMessage: string;
  completed: boolean;
}

export interface CodexExecPort {
  exec(request: Readonly<CodexExecRequest>): Promise<Readonly<CodexExecResult>>;
}

type EnvironmentSource = () => Readonly<Record<string, string | undefined>>;

const nodeTemporaryDirectories: CodexTemporaryDirectoryPort = Object.freeze({
  create: () => mkdtemp(join(tmpdir(), 'wechat-workbench-codex-')),
  remove: (path: string) => rm(path, { recursive: true, force: true }),
});

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function authenticationFailure(stderr: string): boolean {
  return /(?:not logged in|authentication required|run codex login|unauthenticated)/iu.test(stderr);
}

function parseEvents(stdout: string): Readonly<CodexExecResult> {
  let threadId = '';
  let finalMessage = '';
  let completed = false;
  for (const line of stdout.split(/\r?\n/u)) {
    if (line.trim().length === 0) continue;
    let event: Record<string, unknown>;
    try {
      event = record(JSON.parse(line) as unknown);
    } catch {
      continue;
    }
    if (event.type === 'thread.started' && typeof event.thread_id === 'string' && threadId.length === 0) {
      threadId = event.thread_id;
    }
    if (event.type === 'item.completed') {
      const item = record(event.item);
      if (item.type === 'agent_message' && typeof item.text === 'string') finalMessage = item.text;
    }
    if (event.type === 'turn.completed') completed = true;
  }
  if (threadId.length === 0 || finalMessage.length === 0 || !completed) {
    throw new CodexRuntimeError('CODEX_OUTPUT_INVALID');
  }
  return Object.freeze({ threadId, finalMessage, completed: true });
}

export class CodexExecClient implements CodexExecPort {
  constructor(
    private readonly locator: CodexLocatorPort,
    private readonly runner: CodexProcessRunnerPort,
    private readonly temporary: CodexTemporaryDirectoryPort = nodeTemporaryDirectories,
    private readonly environment: EnvironmentSource = () => process.env,
  ) {}

  async exec(request: Readonly<CodexExecRequest>): Promise<Readonly<CodexExecResult>> {
    const location = await this.locator.locate(request.configuredExecutablePath);
    const cwd = await this.temporary.create();
    try {
      const imageArguments = request.imageGeneration
        ? ['--enable', 'image_generation']
        : ['--disable', 'image_generation'];
      const result = await this.runner.run({
        executable: location.executablePath,
        args: [
          'exec', '--ephemeral', '--sandbox', request.sandbox, '--skip-git-repo-check',
          '--ignore-rules', '--ignore-user-config', '--disable', 'shell_tool',
          '--disable', 'apps', '--disable', 'browser_use', '--disable', 'computer_use',
          '--disable', 'plugins', ...imageArguments, '--json', '-',
        ],
        cwd,
        timeoutMs: request.timeoutMs,
        maxStdoutBytes: 2 * 1024 * 1024,
        maxStderrBytes: 512 * 1024,
        env: codexEnvironment(this.environment()),
        stdin: request.prompt,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
      if (result.exitCode !== 0) {
        throw new CodexRuntimeError(authenticationFailure(result.stderr)
          ? 'CODEX_NOT_AUTHENTICATED'
          : 'CODEX_PROCESS_FAILED');
      }
      return parseEvents(result.stdout);
    } finally {
      await this.temporary.remove(cwd).catch(() => undefined);
    }
  }
}
