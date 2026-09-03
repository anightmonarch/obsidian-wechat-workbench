export type CodexErrorCode =
  | 'CODEX_NOT_FOUND'
  | 'CODEX_NOT_AUTHENTICATED'
  | 'CODEX_IMAGEGEN_UNAVAILABLE'
  | 'CODEX_TIMEOUT'
  | 'CODEX_CANCELLED'
  | 'CODEX_PROCESS_FAILED'
  | 'CODEX_OUTPUT_INVALID'
  | 'CODEX_IMAGE_NOT_FOUND'
  | 'CODEX_OUTPUT_TOO_LARGE';

const MESSAGES: Readonly<Record<CodexErrorCode, string>> = Object.freeze({
  CODEX_NOT_FOUND: 'Local Codex executable was not found.',
  CODEX_NOT_AUTHENTICATED: 'Local Codex is not authenticated.',
  CODEX_IMAGEGEN_UNAVAILABLE: 'Local Codex image generation is unavailable.',
  CODEX_TIMEOUT: 'Local Codex generation timed out.',
  CODEX_CANCELLED: 'Local Codex generation was cancelled.',
  CODEX_PROCESS_FAILED: 'Local Codex process failed.',
  CODEX_OUTPUT_INVALID: 'Local Codex returned invalid output.',
  CODEX_IMAGE_NOT_FOUND: 'Local Codex did not produce a usable image.',
  CODEX_OUTPUT_TOO_LARGE: 'Local Codex output exceeded the safety limit.',
});

export class CodexRuntimeError extends Error {
  constructor(readonly code: CodexErrorCode) {
    super(MESSAGES[code]);
    this.name = 'CodexRuntimeError';
  }
}
