export type WeChatStage =
  | 'TOKEN'
  | 'REMOTE_IMAGE'
  | 'UPLOAD_BODY_IMAGE'
  | 'UPLOAD_COVER'
  | 'DRAFT_CREATE'
  | 'DRAFT_UPDATE'
  | 'DRAFT_READ'
  | 'LOCAL_STATE';

export type RemoteEffect = 'NONE' | 'COMMITTED' | 'UNKNOWN';

export interface PublicErrorFields {
  code: string;
  stage: WeChatStage;
  errcode: number | null;
  errmsg: string;
  rid: string | null;
  remoteEffect: RemoteEffect;
  retryable: boolean;
  nextAction: string;
}

export class PublicError extends Error implements PublicErrorFields {
  readonly code: string;
  readonly stage: WeChatStage;
  readonly errcode: number | null;
  readonly errmsg: string;
  readonly rid: string | null;
  readonly remoteEffect: RemoteEffect;
  readonly retryable: boolean;
  readonly nextAction: string;

  constructor(fields: PublicErrorFields) {
    super(fields.errmsg);
    this.name = 'PublicError';
    this.code = fields.code;
    this.stage = fields.stage;
    this.errcode = fields.errcode;
    this.errmsg = fields.errmsg;
    this.rid = fields.rid;
    this.remoteEffect = fields.remoteEffect;
    this.retryable = fields.retryable;
    this.nextAction = fields.nextAction;
  }
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/((?:["']?authorization["']?)\s*[:=]\s*["']?bearer\s+)[^\s,;"'}]+/giu, '$1[REDACTED_SECRET]')
    .replace(/((?:access[_-]?token|accessToken|appsecret|api[_-]?key|apiKey|secret)["']?\s*[:=]\s*["']?)[^&\s,"'}]+/gu, '$1[REDACTED_SECRET]');
}

export function toPublicError(error: unknown, stage: WeChatStage): PublicError {
  if (error instanceof PublicError) return error;
  const rawMessage = error instanceof Error ? error.message : 'Unknown request failure.';
  return new PublicError({
    code: 'WECHAT_TRANSPORT_FAILED',
    stage,
    errcode: null,
    errmsg: redactSensitiveText(rawMessage),
    rid: null,
    remoteEffect: 'NONE',
    retryable: true,
    nextAction: 'Check the network and retry this safe stage.',
  });
}

export function weChatApiError(
  stage: WeChatStage,
  payload: Readonly<{ errcode: number; errmsg?: unknown; rid?: unknown }>,
): PublicError {
  const errmsg = typeof payload.errmsg === 'string' ? payload.errmsg : 'WeChat API rejected the request.';
  return new PublicError({
    code: 'WECHAT_API_ERROR',
    stage,
    errcode: payload.errcode,
    errmsg: redactSensitiveText(errmsg),
    rid: typeof payload.rid === 'string' ? payload.rid : null,
    remoteEffect: 'NONE',
    retryable: payload.errcode === -1,
    nextAction: payload.errcode === -1
      ? 'Retry after a short delay.'
      : 'Check account configuration, IP whitelist, and API permissions.',
  });
}
