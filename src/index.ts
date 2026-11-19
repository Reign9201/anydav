/**
 * anydav — an aggregated WebDAV client.
 *
 * The public surface is intentionally small: one client, one error type, one
 * provider registry, and an optional JSON sync engine.
 */
export type {
  AuthScheme,
  ChunkedUpload,
  ConnectionInfo,
  DavResource,
  FetchLike,
  ListOptions,
  MkdirOptions,
  MoveCopyOptions,
  PasswordKind,
  ProviderAuth,
  ProviderCapabilities,
  ProviderCategory,
  ProviderDetect,
  ProviderLimits,
  ProviderMatch,
  ProviderPreset,
  ProviderQuirks,
  ProviderSpecFile,
  QuotaInfo,
  ReadOptions,
  ReadResult,
  Verification,
  WebDavClientOptions,
  WriteOptions,
} from './types.js';

export {
  DavError,
  errorFromStatus,
  hintForStatus,
  isDavError,
  networkError,
  parseRetryAfter,
  type DavErrorCode,
  type DavErrorInit,
} from './errors.js';

export {
  buildUrl,
  encodePath,
  hrefPath,
  isRootPath,
  nameFromPath,
  normalizeBaseUrl,
  normalizePath,
  parentPaths,
  parseContentLength,
  parseHttpDate,
  pathFromHref,
  pathsEqual,
  safeDecode,
  type NormalizedBaseUrl,
} from './paths.js';

export {
  PROVIDER_SPEC,
  PROVIDER_SPEC_FILE,
  PROVIDERS,
  detectProvider,
  fillUrlTemplate,
  getProvider,
  hasProvider,
  providerLabel,
  resolveProvider,
  type ResolvedProvider,
  type UrlTemplateVars,
} from './providers.js';

export {
  WebDavClient,
  createWebDavClient,
  type MoveCopyResult,
  type WriteResult,
} from './client.js';

export {
  JsonSyncEngine,
  MemorySyncCache,
  createJsonSync,
  stableStringify,
  type JsonSyncOptions,
  type MergeContext,
  type RemoteState,
  type SyncCache,
  type SyncCacheSnapshot,
  type SyncResult,
} from './sync.js';

export {
  DEFAULT_PROPS,
  buildPropfindBody,
  findChildren,
  findDescendants,
  findFirstChild,
  localNameEquals,
  parseMultiStatus,
  parseXml,
  textContent,
  trimmedText,
  type RawDavResponse,
  type XmlElement,
} from './xml.js';

export {
  WebDavAuth,
  base64Encode,
  basicAuthHeader,
  digestAuthHeader,
  parseDigestChallenge,
  type AuthOptions,
  type DigestAuthInput,
  type DigestChallenge,
} from './auth.js';

export { fetchOnce, backoffDelay, delay, type DavHttpResponse } from './transport.js';
