import { DavError, networkError } from './errors.js';
import type { FetchLike, ProviderPreset } from './types.js';
import { isDavError } from './errors.js';

export interface FetchOnceOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  timeoutMs: number;
  signal?: AbortSignal;
  fetchImpl: FetchLike;
  provider?: ProviderPreset;
  redirect?: RequestRedirect;
}

export interface DavHttpResponse {
  status: number;
  statusText: string;
  headers: Headers;
  body: Uint8Array;
  url: string;
}

function mergeAbortSignals(signal: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  timedOut: () => boolean;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('WebDAV request timed out'));
  }, timeoutMs);
  // Do not keep a Node process alive just for the timeout.
  (timer as unknown as { unref?: () => void }).unref?.();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

/** One HTTP attempt: timeout, credentials already applied, body buffered. */
export async function fetchOnce(options: FetchOnceOptions): Promise<DavHttpResponse> {
  const { method, url, timeoutMs, fetchImpl, provider } = options;
  const abort = mergeAbortSignals(options.signal, timeoutMs);
  try {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    const init: RequestInit & { duplex?: 'half' } = {
      method,
      headers,
      signal: abort.signal,
      redirect: options.redirect ?? 'follow',
    };
    if (options.body !== undefined && options.body !== null && method !== 'GET' && method !== 'HEAD') {
      init.body = options.body;
      // Node's fetch requires duplex when the body is a stream.
      if (typeof ReadableStream !== 'undefined' && options.body instanceof ReadableStream) {
        init.duplex = 'half';
      }
    }
    const response = await fetchImpl(url, init);
    let body = new Uint8Array(0);
    if (method !== 'HEAD' && response.status !== 204 && response.status !== 304) {
      const buffer = await response.arrayBuffer();
      body = new Uint8Array(buffer);
    }
    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body,
      url: response.url || url,
    };
  } catch (cause) {
    if (isDavError(cause)) throw cause;
    if (options.signal?.aborted && !abort.timedOut()) {
      throw new DavError({
        code: 'NETWORK',
        message: `WebDAV ${method} ${url} was aborted by the caller`,
        method,
        url,
        providerId: provider?.id,
        retryable: false,
        cause,
      });
    }
    throw networkError(cause, {
      method,
      url,
      provider,
      timeout: abort.timedOut(),
    });
  } finally {
    abort.cleanup();
  }
}

/** Abort-aware sleep used by the retry loop. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DavError({ code: 'NETWORK', message: 'Request aborted' }));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    (timer as unknown as { unref?: () => void }).unref?.();
    const onAbort = () => {
      cleanup();
      reject(new DavError({ code: 'NETWORK', message: 'Request aborted' }));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/** Methods that are safe to replay after a network/5xx failure. */
const IDEMPOTENT = new Set(['GET', 'HEAD', 'OPTIONS', 'PROPFIND', 'PUT', 'DELETE', 'MKCOL']);

export function isIdempotent(method: string): boolean {
  return IDEMPOTENT.has(method.toUpperCase());
}

export function backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
  return Math.round(exponential * (0.5 + Math.random() * 0.5));
}
