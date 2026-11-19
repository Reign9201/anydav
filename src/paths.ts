import { DavError } from './errors.js';

/**
 * Path contract
 * -------------
 * Public paths are *decoded* UTF-8 relative to the account root and start with
 * `/`: `/我的 文件/配置.json`. The SDK percent-encodes each segment when it
 * builds a URL. For convenience a path that already contains valid `%XX`
 * escapes is decoded once, so both `/我的 文件` and `/%E6%88%91%E7%9A%84%20%E6%96%87%E4%BB%B6`
 * mean the same thing. Paths are normalized to Unicode NFC.
 */

export interface NormalizedBaseUrl {
  /** Raw URL string with a trailing slash and no query/fragment. */
  href: string;
  /** Parsed URL object. */
  url: URL;
  /** Decoded pathname, always ending with `/`. */
  path: string;
}

const VALID_SCHEMES = new Set(['http:', 'https:']);

export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Decode a single input path once when it looks percent-encoded. */
function decodeInputPath(value: string): string {
  if (!/%[0-9A-Fa-f]{2}/.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeBaseUrl(raw: string): NormalizedBaseUrl {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new DavError({ code: 'INVALID_URL', message: 'WebDAV baseUrl is empty' });
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new DavError({
      code: 'INVALID_URL',
      message: `Invalid WebDAV baseUrl: ${trimmed}`,
      hint: '地址必须以 http:// 或 https:// 开头，例如 https://dav.jianguoyun.com/dav/',
    });
  }
  if (!VALID_SCHEMES.has(url.protocol)) {
    throw new DavError({
      code: 'INVALID_URL',
      message: `Unsupported URL scheme: ${url.protocol}`,
      hint: 'WebDAV 只支持 http:// 或 https://；生产环境请使用 https://。',
    });
  }
  if (!url.hostname) {
    throw new DavError({ code: 'INVALID_URL', message: `WebDAV baseUrl has no host: ${trimmed}` });
  }
  if (url.username || url.password) {
    throw new DavError({
      code: 'INVALID_URL',
      message: 'Credentials must not be embedded in the URL',
      hint: '请把用户名和密码放在 username / password 字段，不要写进 URL。',
    });
  }
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  url.pathname = url.pathname.replace(/\/{2,}/g, '/');
  return { href: url.toString(), url, path: safeDecode(url.pathname) };
}

export interface NormalizePathOptions {
  /** Treat the path as a collection (append a trailing slash). */
  collection?: boolean;
  /**
   * Decode valid `%XX` escapes before normalizing. Default true for
   * user-supplied paths; resource paths that came from an href are already
   * decoded and must pass false to avoid double-decoding a literal `%20`.
   */
  decodeInput?: boolean;
}

/**
 * Normalize a decoded path. The result always starts with `/`; duplicate
 * slashes and `.` segments are removed; `..` is rejected.
 */
export function normalizePath(input: string, options: NormalizePathOptions = {}): string {
  if (input.includes('\0')) {
    throw new DavError({ code: 'INVALID_PATH', message: 'Path contains a NUL byte' });
  }
  if (input.includes('\\')) {
    throw new DavError({
      code: 'INVALID_PATH',
      message: 'Path contains a backslash',
      hint: 'WebDAV 路径使用 /；文件名中的反斜杠需要由调用方转义或避免。',
    });
  }
  let value = options.decodeInput === false ? input.trim() : decodeInputPath(input.trim());
  const hadTrailingSlash = value.endsWith('/');
  const segments: string[] = [];
  for (const segment of value.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      throw new DavError({
        code: 'INVALID_PATH',
        message: 'Path must not contain ".." segments',
        hint: 'SDK 只接受账号根目录下的相对路径。',
      });
    }
    segments.push(segment.normalize('NFC'));
  }
  let result = '/' + segments.join('/');
  if ((options.collection || hadTrailingSlash) && result !== '/') result += '/';
  return result;
}

/** Percent-encode a normalized (decoded) path for use in a URL. */
export function encodePath(path: string): string {
  const normalized = normalizePath(path, { decodeInput: false });
  const trailing = normalized.endsWith('/') && normalized !== '/';
  const segments = normalized.split('/').filter(Boolean).map((s) => encodeURIComponent(s));
  return '/' + segments.join('/') + (trailing ? '/' : '');
}

/** Join the encoded base href and an encoded path. Base must end with `/`. */
export function joinUrl(baseHref: string, encodedPath: string): string {
  return baseHref + (encodedPath.startsWith('/') ? encodedPath.slice(1) : encodedPath);
}

/** Build an absolute URL for a decoded SDK path. */
export function buildUrl(base: NormalizedBaseUrl, path: string): string {
  return joinUrl(base.href, encodePath(path));
}

export function nameFromPath(path: string): string {
  const clean = path.replace(/\/+$/, '');
  if (!clean) return '';
  const index = clean.lastIndexOf('/');
  return clean.slice(index + 1);
}

export function isRootPath(path: string): boolean {
  return normalizePath(path) === '/';
}

/** Ancestor collections of a path, excluding `/` itself. */
export function parentPaths(path: string): string[] {
  const normalized = normalizePath(path, { decodeInput: false }).replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  const result: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    result.push('/' + parts.slice(0, i).join('/'));
  }
  return result;
}

export function pathsEqual(a: string, b: string): boolean {
  const norm = (p: string) => {
    const v = normalizePath(p, { decodeInput: false });
    return v !== '/' ? v.replace(/\/+$/, '') : v;
  };
  return norm(a) === norm(b);
}

/**
 * Decoded pathname of an href, without resolving it against a base. Servers
 * may return absolute URLs, absolute paths or relative paths.
 */
export function hrefPath(href: string): string {
  const raw = href.trim();
  let pathname = raw;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      pathname = new URL(raw).pathname;
    } catch {
      // keep raw
    }
  } else {
    const cut = pathname.search(/[?#]/);
    if (cut >= 0) pathname = pathname.slice(0, cut);
  }
  return safeDecode(pathname);
}

/**
 * Resolve a PROPFIND href to a path relative to the account root.
 *
 * Servers return hrefs in several shapes: absolute URLs, absolute paths, paths
 * with or without a reverse-proxy prefix. We first strip the configured base
 * path, then the requested path, and finally fall back to the raw server path.
 */
export function pathFromHref(href: string, basePath: string, requestPath: string): string {
  const decoded = hrefPath(href);
  const base = basePath.endsWith('/') ? basePath : basePath + '/';
  if (decoded === base.slice(0, -1)) return '/';
  if (decoded.startsWith(base)) {
    return normalizePath('/' + decoded.slice(base.length), { decodeInput: false });
  }
  const request = normalizePath(requestPath, { decodeInput: false });
  const requestCandidates = request === '/' ? [] : [request, request.replace(/\/+$/, '')];
  for (const candidate of requestCandidates) {
    if (!candidate) continue;
    const index = decoded.indexOf(candidate);
    if (index < 0) continue;
    const after = decoded[index + candidate.length];
    if (after === undefined || after === '/') {
      return normalizePath(decoded.slice(index), { decodeInput: false });
    }
  }
  return normalizePath(decoded.startsWith('/') ? decoded : '/' + decoded, { decodeInput: false });
}

/** RFC 7231 HTTP-date or ISO timestamp. */
export function parseHttpDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time);
}

export function parseContentLength(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
