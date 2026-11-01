import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

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

const CHATGPT_BUNDLED_CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';

/** Absolute-first candidate list for Obsidian GUI PATH (short PATH without ~/.n/bin). */
export function codexCandidates(
  configuredPath: string,
  options: Readonly<{ platform?: NodeJS.Platform; home?: string }> = {},
): readonly string[] {
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  const absoluteHints: string[] = [];
  if (platform === 'darwin') absoluteHints.push(CHATGPT_BUNDLED_CODEX);
  if (platform === 'darwin' || platform === 'linux') {
    absoluteHints.push(
      join(home, '.n/bin/codex'),
      join(home, '.local/bin/codex'),
      '/opt/homebrew/bin/codex',
      '/usr/local/bin/codex',
    );
  }
  const values = [
    configuredPath.trim(),
    ...absoluteHints,
    'codex',
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
    const env = this.environment();
    const home = typeof env.HOME === 'string' && env.HOME.length > 0 ? env.HOME : undefined;
    for (const executable of codexCandidates(configuredPath, home === undefined ? {} : { home })) {
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
