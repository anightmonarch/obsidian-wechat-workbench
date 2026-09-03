import { tmpdir } from 'node:os';

import { CodexRuntimeError } from './codex-errors';
import {
  codexEnvironment,
  type CodexProcessRunnerPort,
} from './codex-process-runner';

export interface CodexLocation {
  executablePath: string;
  version: string;
}

export interface CodexLocatorPort {
  locate(configuredPath: string): Promise<Readonly<CodexLocation>>;
}

type EnvironmentSource = () => Readonly<Record<string, string | undefined>>;

function candidates(configuredPath: string): readonly string[] {
  const values = [
    configuredPath.trim(),
    'codex',
    ...(process.platform === 'darwin' ? ['/opt/homebrew/bin/codex', '/usr/local/bin/codex'] : []),
  ].filter(value => value.length > 0);
  return Object.freeze([...new Set(values)]);
}

function versionText(value: string): string | null {
  const line = value.split(/\r?\n/u).map(item => item.trim()).find(item => item.length > 0);
  return line !== undefined && /^codex(?:-cli)?\s+\S+/iu.test(line) ? line.slice(0, 120) : null;
}

export class CodexLocator implements CodexLocatorPort {
  constructor(
    private readonly runner: CodexProcessRunnerPort,
    private readonly environment: EnvironmentSource = () => process.env,
  ) {}

  async locate(configuredPath: string): Promise<Readonly<CodexLocation>> {
    for (const executable of candidates(configuredPath)) {
      try {
        const result = await this.runner.run({
          executable,
          args: ['--version'],
          cwd: tmpdir(),
          timeoutMs: 10_000,
          maxStdoutBytes: 4_096,
          maxStderrBytes: 4_096,
          env: codexEnvironment(this.environment()),
        });
        const version = result.exitCode === 0 ? versionText(result.stdout) : null;
        if (version !== null) return Object.freeze({ executablePath: executable, version });
      } catch {
        // Continue through the fixed candidate list without exposing local process details.
      }
    }
    throw new CodexRuntimeError('CODEX_NOT_FOUND');
  }
}
