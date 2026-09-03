import { tmpdir } from 'node:os';

import { CodexRuntimeError } from './codex-errors';
import type { CodexLocatorPort } from './codex-locator';
import {
  codexEnvironment,
  type CodexProcessRunnerPort,
} from './codex-process-runner';

export interface CodexCapabilities {
  available: boolean;
  executablePath: string | null;
  version: string | null;
  imageGeneration: boolean;
  errorCode: string | null;
}

export interface CodexCapabilityPort {
  detect(configuredPath: string): Promise<Readonly<CodexCapabilities>>;
}

type EnvironmentSource = () => Readonly<Record<string, string | undefined>>;

export class CodexCapabilityService implements CodexCapabilityPort {
  constructor(
    private readonly locator: CodexLocatorPort,
    private readonly runner: CodexProcessRunnerPort,
    private readonly environment: EnvironmentSource = () => process.env,
  ) {}

  async detect(configuredPath: string): Promise<Readonly<CodexCapabilities>> {
    try {
      const location = await this.locator.locate(configuredPath);
      const features = await this.runner.run({
        executable: location.executablePath,
        args: ['features', 'list'],
        cwd: tmpdir(),
        timeoutMs: 10_000,
        maxStdoutBytes: 128 * 1024,
        maxStderrBytes: 32 * 1024,
        env: codexEnvironment(this.environment()),
      });
      const imageGeneration = features.exitCode === 0
        && features.stdout.split(/\r?\n/u).some(line => /^image_generation\s+\S+\s+true\s*$/iu.test(line));
      return Object.freeze({
        available: true,
        executablePath: location.executablePath,
        version: location.version,
        imageGeneration,
        errorCode: features.exitCode === 0 ? null : 'CODEX_PROCESS_FAILED',
      });
    } catch (error) {
      const code = error instanceof CodexRuntimeError ? error.code : 'CODEX_PROCESS_FAILED';
      return Object.freeze({
        available: false,
        executablePath: null,
        version: null,
        imageGeneration: false,
        errorCode: code,
      });
    }
  }
}
