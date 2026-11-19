/**
 * Public types for the anydav SDK.
 *
 * The provider registry is the aggregate layer: callers pick a provider id (or
 * let the SDK detect it from the URL), and the client applies that provider's
 * URL/auth/limit conventions on top of a standard WebDAV transport.
 */

export type ProviderCategory =
  | 'consumer'
  | 'nas'
  | 'self-hosted'
  | 'gateway'
  | 'generic';

export type AuthScheme = 'basic' | 'digest' | 'bearer' | 'none';

export type PasswordKind =
  | 'account'
  | 'app-password'
  | 'webdav-password'
  | 'sub-account'
  | 'token';

export type Verification = 'live' | 'documented' | 'unverified';

export type ChunkedUpload = false | 'nextcloud';

export interface ProviderAuth {
  scheme: AuthScheme;
  passwordKind: PasswordKind;
  usernameHint?: string;
  passwordHint?: string;
  note?: string;
  noteZh?: string;
  twoFactor?: string;
}

export interface ProviderCapabilities {
  quota: boolean | null;
  move: boolean | null;
  copy: boolean | null;
  rangeRead: boolean | null;
  etag: boolean | null;
  depthInfinity: boolean | null;
  chunkedUpload: ChunkedUpload | null;
}

export interface ProviderLimits {
  maxUploadBytes?: number;
  propfindMaxEntries?: number;
  requestsPer30Min?: { free?: number; paid?: number };
  note?: string;
  noteZh?: string;
}

export interface ProviderQuirks {
  appPasswordRequired?: boolean;
  putParentMustExist?: boolean;
  mkdirAlreadyExistsStatuses?: number[];
  knownIssues?: string[];
  knownIssuesZh?: string[];
}

export interface ProviderDetect {
  hosts?: string[];
  hostSuffixes?: string[];
  pathIncludes?: string[];
  ports?: number[];
}

export interface ProviderPreset {
  id: string;
  name: string;
  nameZh?: string;
  category: ProviderCategory;
  baseUrl?: string | null;
  urlTemplate?: string | null;
  urlHints?: string[];
  auth: ProviderAuth;
  capabilities: ProviderCapabilities;
  limits?: ProviderLimits | null;
  quirks?: ProviderQuirks | null;
  detect?: ProviderDetect | null;
  docsUrl?: string;
  verification: Verification;
  notes?: string[];
  notesZh?: string[];
}

export interface ProviderSpecFile {
  schemaVersion: 1;
  updatedAt: string;
  providers: ProviderPreset[];
}

export interface ProviderMatch {
  provider: ProviderPreset;
  /** high: exact host; medium: suffix/path; low: port/fuzzy; none: generic fallback. */
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason: string;
}

/** Options accepted by {@link createWebDavClient}. */
export interface WebDavClientOptions {
  /**
   * WebDAV account root. Must include the provider-specific prefix, e.g.
   * `https://dav.jianguoyun.com/dav/` or
   * `https://cloud.example.com/remote.php/dav/files/alice/`.
   */
  baseUrl: string;
  username?: string;
  password?: string;
  /** Provider id (`nextcloud`) or a preset object. Detected from baseUrl when omitted. */
  provider?: string | ProviderPreset;
  /** Overrides the provider's auth scheme. */
  auth?: AuthScheme;
  /** Bearer token when `auth: 'bearer'`. */
  token?: string;
  /** Extra headers added to every request. */
  headers?: Record<string, string>;
  /** Per-request timeout. Default 30_000 ms. */
  timeoutMs?: number;
  /** Retries for idempotent requests. Default 2 (three attempts total). */
  retries?: number;
  /** First backoff delay. Default 300 ms. */
  retryDelayMs?: number;
  /** Backoff cap. Default 10_000 ms. */
  maxRetryDelayMs?: number;
  /** Custom fetch implementation (proxy, instrumentation, tests). */
  fetch?: typeof fetch;
  /** User-Agent header. Default `anydav/<version>`. */
  userAgent?: string;
  /** Automatically MKCOL parent collections before PUT. Default true. */
  autoCreateParents?: boolean;
}

export interface DavResource {
  /** Raw href exactly as returned by PROPFIND. */
  href: string;
  /** Decoded path relative to the account root, always starting with `/`. */
  path: string;
  /** Decoded last path segment. Empty for the account root. */
  name: string;
  isCollection: boolean;
  etag?: string;
  size?: number;
  lastModified?: Date;
  contentType?: string;
  displayName?: string;
  quotaAvailableBytes?: number;
  quotaUsedBytes?: number;
  /** Per-resource propstat status; 200 for a normal entry. */
  status: number;
}

export interface ListOptions {
  /** PROPFIND depth. Default 1. */
  depth?: 0 | 1;
  /** Include the collection itself. Default false for depth 1, true for depth 0. */
  includeSelf?: boolean;
  /** Abort signal. */
  signal?: AbortSignal;
}

export interface ReadOptions {
  /** Sends If-None-Match; a 304 yields `notModified: true`. */
  ifNoneMatch?: string;
  /** Single range read. */
  range?: { start: number; end?: number };
  signal?: AbortSignal;
}

export interface WriteOptions {
  contentType?: string;
  /** Sends If-Match; a 412 becomes PRECONDITION_FAILED. */
  ifMatch?: string;
  /** Sends If-None-Match; use `*` for create-only. */
  ifNoneMatch?: string;
  /** Create missing parent collections first. Defaults to client option. */
  createParents?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface MkdirOptions {
  recursive?: boolean;
  signal?: AbortSignal;
}

export interface MoveCopyOptions {
  /** Overwrite destination. Default false. */
  overwrite?: boolean;
  signal?: AbortSignal;
}

export interface ReadResult {
  data: Uint8Array;
  etag?: string;
  status: number;
  notModified: boolean;
  contentType?: string;
}

export interface ConnectionInfo {
  ok: boolean;
  status: number;
  provider: ProviderPreset;
  baseUrl: string;
  latencyMs: number;
  /** DAV compliance classes advertised by the server, e.g. ['1', '2']. */
  dav?: string[];
  /** Auth scheme chosen/observed. */
  authScheme: AuthScheme;
  /** True when OPTIONS was rejected but PROPFIND succeeded. */
  optionsUnsupported?: boolean;
}

export interface QuotaInfo {
  usedBytes?: number;
  availableBytes?: number;
  totalBytes?: number;
}

export interface UploadProgress {
  loaded: number;
  total?: number;
}

export type FetchLike = typeof fetch;
