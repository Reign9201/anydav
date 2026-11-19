import type { ProviderPreset } from './types.js';

export type DavErrorCode =
  | 'INVALID_URL'
  | 'INVALID_PATH'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFLICT'
  | 'PRECONDITION_FAILED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'LOCKED'
  | 'RATE_LIMITED'
  | 'INSUFFICIENT_STORAGE'
  | 'SERVER_ERROR'
  | 'NOT_IMPLEMENTED'
  | 'SERVICE_UNAVAILABLE'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'TLS'
  | 'PARSE'
  | 'PROVIDER_UNKNOWN';

export interface DavErrorInit {
  code: DavErrorCode;
  message: string;
  status?: number;
  method?: string;
  url?: string;
  providerId?: string;
  retryable?: boolean;
  retryAfterMs?: number;
  hint?: string;
  cause?: unknown;
  responseBody?: string;
}

/**
 * Single error type for the whole SDK. Callers switch on `code` instead of
 * parsing provider prose; `hint` carries the provider-specific next step.
 */
export class DavError extends Error {
  readonly code: DavErrorCode;
  readonly status?: number;
  readonly method?: string;
  readonly url?: string;
  readonly providerId?: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly hint?: string;
  readonly responseBody?: string;
  override readonly cause?: unknown;

  constructor(init: DavErrorInit) {
    super(init.message);
    this.name = 'DavError';
    this.code = init.code;
    this.status = init.status;
    this.method = init.method;
    this.url = init.url;
    this.providerId = init.providerId;
    this.retryable = init.retryable ?? false;
    this.retryAfterMs = init.retryAfterMs;
    this.hint = init.hint;
    this.responseBody = init.responseBody;
    this.cause = init.cause;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.status,
      method: this.method,
      url: this.url,
      providerId: this.providerId,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      hint: this.hint,
    };
  }
}

export function isDavError(error: unknown): error is DavError {
  return error instanceof DavError;
}

export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

const STATUS_CODES: Record<number, DavErrorCode> = {
  400: 'CONFLICT',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  412: 'PRECONDITION_FAILED',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  423: 'LOCKED',
  429: 'RATE_LIMITED',
  500: 'SERVER_ERROR',
  501: 'NOT_IMPLEMENTED',
  502: 'SERVICE_UNAVAILABLE',
  503: 'SERVICE_UNAVAILABLE',
  504: 'SERVICE_UNAVAILABLE',
  507: 'INSUFFICIENT_STORAGE',
};

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

/** Provider-aware hint for the common failure modes. */
export function hintForStatus(status: number, method: string | undefined, provider?: ProviderPreset): string | undefined {
  const id = provider?.id;
  if (status === 401 || status === 403) {
    if (id === 'jianguoyun') {
      return status === 401
        ? '坚果云需要使用「第三方应用密码」，不是登录密码。网页版：账户信息 → 安全选项 → 第三方应用管理。'
        : '坚果云 403 常见于访问频率超限（免费 600 次/30 分钟、付费 1500 次）或目录权限不足；请稍后重试并减少请求数。';
    }
    if (id === 'infinicloud') return 'InfiniCLOUD 需要使用 My Page 中单独设置的 WebDAV 密码。';
    if (id === 'koofr') return 'Koofr 开启两步验证后必须使用应用密码（Preferences → Security → App passwords）。';
    if (id === 'mailbox') return 'mailbox.org 必须使用应用专用密码（Settings → Security → App passwords）。';
    if (id === 'yandex' || id === 'mailru') return '该服务要求使用应用专用密码，不是登录密码。';
    if (id === 'pcloud') return '请确认账号区域（美国 webdav.pcloud.com / 欧洲 ewebdav.pcloud.com）以及两步验证设置。';
    if (id === 'nextcloud' || id === 'owncloud' || id === 'magentacloud') {
      return '请使用应用密码；WebDAV 地址必须包含用户名（/remote.php/dav/files/用户名/）。';
    }
    if (id === 'pikpak') return '请使用 PikPak App「实验室功能 → WebDAV」页面显示的账号和密码。';
    if (status === 403) return '服务器拒绝访问：检查账号权限、应用密码或网盘空间状态。';
    return '认证失败：确认用户名/密码；开启两步验证时通常需要应用专用密码。';
  }
  if (status === 404) {
    if (method === 'PROPFIND') return '路径或 WebDAV 根地址不存在：确认 baseUrl 包含服务商要求的完整前缀。';
    return '文件或目录不存在。';
  }
  if (status === 405) {
    if (method === 'MKCOL') return '目录已经存在（部分服务器用 405 表示），可按成功处理。';
    return '服务器不支持该操作或路径类型不匹配。';
  }
  if (status === 409) {
    if (method === 'PUT' || method === 'MKCOL') return '父目录不存在：先调用 mkdir(path, { recursive: true })。';
    return '目标路径与现有资源冲突。';
  }
  if (status === 412) return 'If-Match / If-None-Match 条件不满足：远端文件已被修改，请重新读取后再写入。';
  if (status === 413) return '上传内容超过服务商限制；坚果云默认单文件 500MB，可在客户端设置中调整。';
  if (status === 429) return '请求过多：客户端应退避重试；若为坚果云，等下一个 30 分钟窗口更可靠。';
  if (status === 507) return '网盘空间不足。';
  if (status >= 500) return '服务端临时故障，可稍后重试。';
  return undefined;
}

export function errorFromStatus(
  status: number,
  init: {
    method: string;
    url: string;
    provider?: ProviderPreset;
    retryAfter?: string | null;
    body?: string;
  },
): DavError {
  const code = STATUS_CODES[status] ?? (status >= 500 ? 'SERVER_ERROR' : 'PROVIDER_UNKNOWN');
  const retryAfterMs = parseRetryAfter(init.retryAfter);
  return new DavError({
    code,
    message: `WebDAV ${init.method} ${init.url} failed with HTTP ${status}`,
    status,
    method: init.method,
    url: init.url,
    providerId: init.provider?.id,
    retryable: RETRYABLE_STATUS.has(status),
    retryAfterMs,
    hint: hintForStatus(status, init.method, init.provider),
    responseBody: init.body,
  });
}

export function networkError(
  cause: unknown,
  init: { method: string; url: string; provider?: ProviderPreset; timeout?: boolean },
): DavError {
  const message = cause instanceof Error ? cause.message : String(cause);
  const isTls = /certificate|handshake|tls|ssl|self[- ]signed/i.test(message);
  const isAbort = cause instanceof Error && (cause.name === 'AbortError' || /aborted/i.test(message));
  const browser = typeof navigator !== 'undefined' && /Mozilla|Chrome|Safari|Firefox/.test(navigator.userAgent ?? '');
  const corsHint = browser
    ? '浏览器直连 WebDAV 通常被 CORS 拦截：请通过同源服务端代理转发，或传入自定义 fetch。'
    : undefined;
  return new DavError({
    code: init.timeout ? 'TIMEOUT' : isTls ? 'TLS' : 'NETWORK',
    message: init.timeout
      ? `WebDAV ${init.method} ${init.url} timed out`
      : `WebDAV ${init.method} ${init.url} failed: ${message}`,
    method: init.method,
    url: init.url,
    providerId: init.provider?.id,
    retryable: !isTls,
    hint: isTls
      ? 'TLS 证书校验失败：检查证书链、域名和系统时间；不要为生产环境关闭校验。'
      : corsHint,
    cause: isAbort && init.timeout ? undefined : cause,
  });
}
