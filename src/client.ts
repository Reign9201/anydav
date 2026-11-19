import { WebDavAuth, type AuthOptions } from './auth.js';
import {
  DavError,
  errorFromStatus,
  isDavError,
  parseRetryAfter,
} from './errors.js';
import {
  buildUrl,
  isRootPath,
  nameFromPath,
  normalizeBaseUrl,
  normalizePath,
  parentPaths,
  parseContentLength,
  parseHttpDate,
  pathFromHref,
  hrefPath,
  pathsEqual,
  type NormalizedBaseUrl,
} from './paths.js';
import {
  detectProvider,
  resolveProvider,
  type ResolvedProvider,
} from './providers.js';
import { backoffDelay, delay, fetchOnce, isIdempotent } from './transport.js';
import type {
  ConnectionInfo,
  DavResource,
  ListOptions,
  MkdirOptions,
  MoveCopyOptions,
  ProviderPreset,
  QuotaInfo,
  ReadOptions,
  ReadResult,
  WebDavClientOptions,
  WriteOptions,
} from './types.js';
import { buildPropfindBody, parseMultiStatus, type RawDavResponse } from './xml.js';

export interface RequestOptions {
  body?: BodyInit | null;
  headers?: Record<string, string>;
  acceptStatuses?: number[];
  signal?: AbortSignal;
}

export interface WriteResult {
  status: number;
  etag?: string;
}

export interface MoveCopyResult {
  status: number;
}

const VERSION = '0.1.0';
const DEFAULT_ACCEPT = new Set([200, 201, 202, 204]);
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bodyToText(body: Uint8Array): string {
  return new TextDecoder().decode(body);
}


/**
 * Aggregated WebDAV client.
 *
 * ```ts
 * const client = new WebDavClient({
 *   provider: 'jianguoyun',
 *   baseUrl: 'https://dav.jianguoyun.com/dav/',
 *   username: 'me@example.com',
 *   password: 'app-password',
 * });
 * await client.writeJson('/myapp/state.json', { hello: 'world' });
 * ```
 */
export class WebDavClient {
  readonly base: NormalizedBaseUrl;
  readonly provider: ProviderPreset;
  readonly providerMatch: ResolvedProvider['match'];
  private readonly auth: WebDavAuth;
  private readonly options: Required<
    Pick<
      WebDavClientOptions,
      'timeoutMs' | 'retries' | 'retryDelayMs' | 'maxRetryDelayMs' | 'autoCreateParents'
    >
  > &
    WebDavClientOptions;
  private readonly createdDirs = new Set<string>();
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: WebDavClientOptions) {
    if (!options || typeof options.baseUrl !== 'string') {
      throw new DavError({ code: 'INVALID_URL', message: 'baseUrl is required' });
    }
    this.base = normalizeBaseUrl(options.baseUrl);
    const resolved = resolveProvider(options.provider, this.base.href);
    this.provider = resolved.provider;
    this.providerMatch = resolved.match;

    const scheme = options.auth ?? this.provider.auth.scheme;
    if (scheme === 'bearer' && !options.token) {
      throw new DavError({
        code: 'UNAUTHORIZED',
        message: 'Bearer auth requires a token',
      });
    }
    const authOptions: AuthOptions = {
      scheme,
      username: options.username,
      password: options.password,
      token: options.token,
    };
    this.auth = new WebDavAuth(authOptions);

    const timeoutMs = options.timeoutMs ?? 30_000;
    const retries = options.retries ?? 2;
    const retryDelayMs = options.retryDelayMs ?? 300;
    const maxRetryDelayMs = options.maxRetryDelayMs ?? 10_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new DavError({ code: 'INVALID_URL', message: 'timeoutMs must be a positive number' });
    }
    if (!Number.isInteger(retries) || retries < 0) {
      throw new DavError({ code: 'INVALID_URL', message: 'retries must be a non-negative integer' });
    }
    if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0 || !Number.isFinite(maxRetryDelayMs) || maxRetryDelayMs < 0) {
      throw new DavError({ code: 'INVALID_URL', message: 'retry delays must be non-negative numbers' });
    }
    this.options = {
      ...options,
      timeoutMs,
      retries,
      retryDelayMs,
      maxRetryDelayMs,
      autoCreateParents: options.autoCreateParents ?? true,
    };
    this.defaultHeaders = {
      'user-agent': options.userAgent ?? `anydav/${VERSION}`,
      ...(options.headers ?? {}),
    };
    this.createdDirs.add('/');
  }

  get authScheme() {
    return this.auth.scheme;
  }

  get baseUrl(): string {
    return this.base.href;
  }

  // ---------------------------------------------------------------- transport

  private async request(method: string, path: string, options: RequestOptions = {}): Promise<{
    response: Awaited<ReturnType<typeof fetchOnce>>;
    url: string;
  }> {
    const url = buildUrl(this.base, path);
    const urlObject = new URL(url);
    const accepted = options.acceptStatuses
      ? new Set(options.acceptStatuses)
      : DEFAULT_ACCEPT;
    let attempt = 0;
    let digestRetried = false;
    const replayable = this.bodyReplayable(options.body);

    for (;;) {
      const authHeaders = await this.auth.initialHeader(method, urlObject);
      let response;
      try {
        response = await fetchOnce({
          method,
          url,
          headers: { ...this.defaultHeaders, ...authHeaders, ...(options.headers ?? {}) },
          body: options.body,
          timeoutMs: this.options.timeoutMs,
          signal: options.signal,
          fetchImpl: this.options.fetch ?? fetch,
          provider: this.provider,
        });
      } catch (error) {
        if (
          isDavError(error) &&
          error.retryable &&
          isIdempotent(method) &&
          replayable &&
          attempt < this.options.retries
        ) {
          await delay(
            backoffDelay(attempt, this.options.retryDelayMs, this.options.maxRetryDelayMs),
            options.signal,
          );
          attempt++;
          continue;
        }
        if (isDavError(error)) throw error;
        throw error;
      }

      if (response.status === 401 && this.auth.scheme === 'digest' && !digestRetried) {
        const challenged = await this.auth.challengeHeader(
          method,
          urlObject,
          response.headers.get('www-authenticate'),
        );
        if (challenged) {
          digestRetried = true;
          continue;
        }
      }

      if (accepted.has(response.status) || (response.status >= 200 && response.status < 300 && !options.acceptStatuses)) {
        return { response, url };
      }

      if (
        RETRYABLE_STATUS.has(response.status) &&
        isIdempotent(method) &&
        replayable &&
        attempt < this.options.retries
      ) {
        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
        if (retryAfterMs !== undefined && retryAfterMs > this.options.maxRetryDelayMs) {
          throw errorFromStatus(response.status, {
            method,
            url,
            provider: this.provider,
            retryAfter: response.headers.get('retry-after'),
            body: bodyToText(response.body).slice(0, 2048),
          });
        }
        const waitMs =
          retryAfterMs ??
          backoffDelay(attempt, this.options.retryDelayMs, this.options.maxRetryDelayMs);
        await delay(waitMs, options.signal);
        attempt++;
        continue;
      }

      throw errorFromStatus(response.status, {
        method,
        url,
        provider: this.provider,
        retryAfter: response.headers.get('retry-after'),
        body: bodyToText(response.body).slice(0, 2048),
      });
    }
  }

  private propfind(path: string, depth: 0 | 1, options: { signal?: AbortSignal } = {}) {
    return this.request('PROPFIND', path, {
      headers: {
        depth: String(depth),
        'content-type': 'application/xml; charset=utf-8',
      },
      body: buildPropfindBody(),
      acceptStatuses: [200, 207, 404],
      signal: options.signal,
    });
  }

  private toResource(raw: RawDavResponse, requestPath: string, basePath: string): DavResource {
    const path = normalizePath(pathFromHref(raw.href, basePath, requestPath), {
      collection: raw.isCollection,
      decodeInput: false,
    });
    return {
      href: raw.href,
      path,
      name: nameFromPath(path),
      isCollection: raw.isCollection,
      etag: raw.props.getetag,
      size: parseContentLength(raw.props.getcontentlength),
      lastModified: parseHttpDate(raw.props.getlastmodified),
      contentType: raw.props.getcontenttype,
      displayName: raw.props.displayname,
      quotaAvailableBytes: raw.quotaAvailableBytes,
      quotaUsedBytes: raw.quotaUsedBytes,
      status: raw.status,
    };
  }

  /**
   * Account root as seen in hrefs. Normally this is `base.path`, but a
   * same-origin proxy (browser) or a reverse proxy may map the account to a
   * different path, so the self entry in a PROPFIND response is authoritative.
   */
  private effectiveBasePath(raws: RawDavResponse[], requestPath: string): string {
    const target = normalizePath(requestPath, { collection: true, decodeInput: false });
    const targetWithoutSlash = target.replace(/\/+$/, '');
    let best: string | undefined;
    for (const raw of raws) {
      let candidate = hrefPath(raw.href);
      if (!candidate.startsWith('/')) candidate = '/' + candidate;
      candidate = normalizePath(candidate, { collection: true, decodeInput: false });
      const matches =
        target === '/'
          ? candidate.endsWith('/')
          : candidate.endsWith(target) || candidate.endsWith(targetWithoutSlash);
      if (!matches) continue;
      if (!best || candidate.length < best.length) best = candidate;
    }
    if (!best) return this.base.path;
    if (target === '/') return best;
    const matched = best.endsWith(target) ? target : targetWithoutSlash;
    const prefix = best.slice(0, best.length - matched.length);
    return prefix.endsWith('/') ? prefix : prefix + '/';
  }

  private parseResources(xmlBody: Uint8Array, requestPath: string): DavResource[] {
    const raws = parseMultiStatus(bodyToText(xmlBody));
    const basePath = this.effectiveBasePath(raws, requestPath);
    const result: DavResource[] = [];
    const seen = new Set<string>();
    for (const raw of raws) {
      if (raw.status >= 400 && raw.propstatStatuses.every((s) => s >= 400)) continue;
      const resource = this.toResource(raw, requestPath, basePath);
      const key = resource.path.replace(/\/+$/, '') || '/';
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(resource);
    }
    return result;
  }

  // ------------------------------------------------------------------- verbs

  /** OPTIONS + Depth-0 PROPFIND. Returns server capabilities or throws. */
  async testConnection(): Promise<ConnectionInfo> {
    const started = Date.now();
    let dav: string[] | undefined;
    let optionsUnsupported = false;
    try {
      const { response } = await this.request('OPTIONS', '/', {
        acceptStatuses: [200, 204, 207],
      });
      const header = response.headers.get('dav');
      if (header) dav = header.split(',').map((v) => v.trim()).filter(Boolean);
    } catch (error) {
      if (isDavError(error) && (error.code === 'METHOD_NOT_ALLOWED' || error.code === 'NOT_IMPLEMENTED')) {
        optionsUnsupported = true;
      } else {
        throw error;
      }
    }
    const { response } = await this.propfind('/', 0);
    if (response.status !== 200 && response.status !== 207) {
      throw errorFromStatus(response.status, {
        method: 'PROPFIND',
        url: this.base.href,
        provider: this.provider,
        body: bodyToText(response.body).slice(0, 2048),
      });
    }
    if (!dav && response.headers.get('dav')) {
      dav = response.headers.get('dav')!.split(',').map((v) => v.trim()).filter(Boolean);
    }
    return {
      ok: true,
      status: response.status,
      provider: this.provider,
      baseUrl: this.base.href,
      latencyMs: Date.now() - started,
      dav,
      authScheme: this.auth.scheme,
      optionsUnsupported: optionsUnsupported || undefined,
    };
  }

  /** PROPFIND Depth 0. Returns null when the path does not exist. */
  async stat(path: string, options: { signal?: AbortSignal } = {}): Promise<DavResource | null> {
    const target = normalizePath(path);
    const { response } = await this.propfind(target, 0, options);
    if (response.status === 404) return null;
    const resources = this.parseResources(response.body, target);
    if (resources.length === 0) return null;
    if (resources[0].status >= 400) return null;
    return resources[0];
  }

  async exists(path: string, options: { signal?: AbortSignal } = {}): Promise<boolean> {
    return (await this.stat(path, options)) !== null;
  }

  /** PROPFIND listing. Depth 1 excludes the collection itself by default. */
  async list(path: string, options: ListOptions = {}): Promise<DavResource[]> {
    const depth = options.depth ?? 1;
    const target = normalizePath(path, { collection: true });
    const { response } = await this.propfind(target, depth, options);
    if (response.status === 404) {
      throw errorFromStatus(404, {
        method: 'PROPFIND',
        url: buildUrl(this.base, target),
        provider: this.provider,
        body: bodyToText(response.body).slice(0, 2048),
      });
    }
    const resources = this.parseResources(response.body, target);
    const includeSelf = options.includeSelf ?? depth === 0;
    if (includeSelf) return resources;
    return resources.filter((resource) => !pathsEqual(resource.path, target));
  }

  /** MKCOL, optionally creating every missing ancestor. */
  async mkdir(path: string, options: MkdirOptions = {}): Promise<void> {
    const target = normalizePath(path, { collection: true });
    if (target === '/') return;
    const configured = this.provider.quirks?.mkdirAlreadyExistsStatuses ?? [200, 201, 204, 301, 405];
    // RFC 4918 says 409 means "parent missing", but several providers also use
    // it for "already exists". Accept it only when the parent is known to exist.
    const accepted = configured.filter((status) => status !== 409);
    const parentOf = (collection: string): string => {
      const trimmed = collection.replace(/\/+$/, '');
      const index = trimmed.lastIndexOf('/');
      return index <= 0 ? '/' : trimmed.slice(0, index) + '/';
    };
    const make = async (collection: string) => {
      if (this.createdDirs.has(collection)) return;
      try {
        await this.request('MKCOL', collection, {
          acceptStatuses: accepted,
          signal: options.signal,
        });
      } catch (error) {
        if (
          isDavError(error) &&
          error.status === 409 &&
          configured.includes(409) &&
          this.createdDirs.has(parentOf(collection))
        ) {
          this.createdDirs.add(collection);
          return;
        }
        throw error;
      }
      this.createdDirs.add(collection);
    };
    if (options.recursive) {
      for (const parent of parentPaths(target)) await make(parent);
    }
    await make(target);
  }

  /**
   * A ReadableStream body cannot be replayed after the first attempt; such
   * uploads are sent exactly once and surfaced as errors so callers do not
   * silently duplicate or truncate a file.
   */
  private bodyReplayable(body: BodyInit | null | undefined): boolean {
    return !(typeof ReadableStream !== 'undefined' && body instanceof ReadableStream);
  }

  private async ensureParentDir(path: string, signal?: AbortSignal): Promise<void> {
    const parent = this.parentPath(path);
    if (isRootPath(parent)) return;
    await this.mkdir(parent, { recursive: true, signal });
  }

  private parentPath(path: string): string {
    const trimmed = path.replace(/\/+$/, '');
    const index = trimmed.lastIndexOf('/');
    return index <= 0 ? '/' : trimmed.slice(0, index);
  }

  /** PUT. Strings and Uint8Arrays are the common cases; Blob/stream are passed through. */
  async writeFile(
    path: string,
    data: Uint8Array | ArrayBuffer | string | Blob | ReadableStream<Uint8Array>,
    options: WriteOptions = {},
  ): Promise<WriteResult> {
    const target = normalizePath(path);
    if (target.endsWith('/')) {
      throw new DavError({
        code: 'INVALID_PATH',
        message: 'Cannot PUT to a collection path',
        hint: '去掉路径末尾的 /，或改用 mkdir()。',
      });
    }
    const createParents = options.createParents ?? this.options.autoCreateParents;
    if (createParents) await this.ensureParentDir(target, options.signal);
    const headers: Record<string, string> = {
      'content-type': options.contentType ?? 'application/octet-stream',
      ...(options.headers ?? {}),
    };
    if (options.ifMatch) headers['if-match'] = options.ifMatch;
    if (options.ifNoneMatch) headers['if-none-match'] = options.ifNoneMatch;
    const body = data as BodyInit;
    const replayable = this.bodyReplayable(body);
    const perform = () =>
      this.request('PUT', target, {
        body,
        headers,
        acceptStatuses: [200, 201, 204],
        signal: options.signal,
      });
    let response;
    try {
      response = (await perform()).response;
    } catch (error) {
      // A cached "parent exists" can be stale after external changes. Refresh
      // the parent chain once and retry the PUT.
      if (createParents && replayable && isDavError(error) && error.code === 'CONFLICT') {
        this.forgetDir(this.parentPath(target));
        await this.ensureParentDir(target, options.signal);
        response = (await perform()).response;
      } else {
        throw error;
      }
    }
    return { status: response.status, etag: response.headers.get('etag') ?? undefined };
  }

  async writeText(path: string, text: string, options: WriteOptions = {}): Promise<WriteResult> {
    return this.writeFile(path, text, {
      ...options,
      contentType: options.contentType ?? 'text/plain; charset=utf-8',
    });
  }

  async writeJson(path: string, value: unknown, options: WriteOptions = {}): Promise<WriteResult> {
    return this.writeText(path, JSON.stringify(value), {
      ...options,
      contentType: options.contentType ?? 'application/json; charset=utf-8',
    });
  }

  /** GET. Conditional 304 is returned as `notModified: true` instead of throwing. */
  async readFile(path: string, options: ReadOptions = {}): Promise<ReadResult> {
    const target = normalizePath(path);
    const headers: Record<string, string> = {};
    if (options.ifNoneMatch) headers['if-none-match'] = options.ifNoneMatch;
    if (options.range) {
      headers.range = `bytes=${options.range.start}-${options.range.end ?? ''}`;
    }
    const { response } = await this.request('GET', target, {
      headers,
      acceptStatuses: [200, 206, 304],
      signal: options.signal,
    });
    return {
      data: response.status === 304 ? new Uint8Array(0) : response.body,
      etag: response.headers.get('etag') ?? undefined,
      status: response.status,
      notModified: response.status === 304,
      contentType: response.headers.get('content-type') ?? undefined,
    };
  }

  async readText(path: string, options: ReadOptions = {}): Promise<{ text: string; etag?: string; notModified: boolean }> {
    const result = await this.readFile(path, options);
    return {
      text: result.notModified ? '' : new TextDecoder().decode(result.data),
      etag: result.etag,
      notModified: result.notModified,
    };
  }

  async readJson<T = unknown>(
    path: string,
    options: ReadOptions = {},
  ): Promise<{ value: T | null; etag?: string; notModified: boolean }> {
    let result: ReadResult;
    try {
      result = await this.readFile(path, options);
    } catch (error) {
      if (isDavError(error) && error.code === 'NOT_FOUND') {
        return { value: null, notModified: false };
      }
      throw error;
    }
    if (result.notModified) return { value: null, etag: result.etag, notModified: true };
    const text = new TextDecoder().decode(result.data);
    try {
      return { value: JSON.parse(text) as T, etag: result.etag, notModified: false };
    } catch (cause) {
      throw new DavError({
        code: 'PARSE',
        message: `Remote file is not valid JSON: ${path}`,
        url: buildUrl(this.base, normalizePath(path)),
        providerId: this.provider.id,
        responseBody: text.slice(0, 500),
        cause,
      });
    }
  }

  /** DELETE. */
  async remove(path: string, options: { signal?: AbortSignal } = {}): Promise<void> {
    const target = normalizePath(path);
    if (target === '/') {
      throw new DavError({
        code: 'INVALID_PATH',
        message: 'Refusing to DELETE the WebDAV account root',
        hint: '请指定要删除的子目录或文件。',
      });
    }
    await this.request('DELETE', target, {
      acceptStatuses: [200, 202, 204],
      signal: options.signal,
    });
    this.forgetDir(target);
  }

  /** DELETE, returning false when the path was already gone. */
  async removeIfExists(path: string, options: { signal?: AbortSignal } = {}): Promise<boolean> {
    try {
      await this.remove(path, options);
      return true;
    } catch (error) {
      if (isDavError(error) && error.code === 'NOT_FOUND') return false;
      throw error;
    }
  }

  async move(from: string, to: string, options: MoveCopyOptions = {}): Promise<MoveCopyResult> {
    return this.transfer('MOVE', from, to, options);
  }

  async copy(from: string, to: string, options: MoveCopyOptions = {}): Promise<MoveCopyResult> {
    return this.transfer('COPY', from, to, options);
  }

  private async transfer(
    method: 'MOVE' | 'COPY',
    from: string,
    to: string,
    options: MoveCopyOptions,
  ): Promise<MoveCopyResult> {
    const source = normalizePath(from);
    const destination = normalizePath(to);
    if (source === '/') {
      throw new DavError({
        code: 'INVALID_PATH',
        message: `Refusing to ${method} the WebDAV account root`,
      });
    }
    if (destination === '/') {
      throw new DavError({
        code: 'INVALID_PATH',
        message: 'Destination must not be the WebDAV account root',
      });
    }
    const { response } = await this.request(method, source, {
      headers: {
        destination: buildUrl(this.base, destination),
        overwrite: options.overwrite ? 'T' : 'F',
        depth: 'infinity',
      },
      acceptStatuses: [200, 201, 204],
      signal: options.signal,
    });
    if (method === 'MOVE') {
      this.forgetDir(source);
      this.forgetDir(destination);
    }
    return { status: response.status };
  }

  /** Quota properties (Nextcloud/ownCloud/SabreDAV). Null when unsupported. */
  async getQuota(path = '/'): Promise<QuotaInfo | null> {
    const target = normalizePath(path);
    const { response } = await this.propfind(target, 0);
    if (response.status === 404) return null;
    const resources = this.parseResources(response.body, target);
    const resource = resources[0];
    if (!resource) return null;
    if (resource.quotaUsedBytes === undefined && resource.quotaAvailableBytes === undefined) return null;
    const info: QuotaInfo = {
      usedBytes: resource.quotaUsedBytes,
      availableBytes: resource.quotaAvailableBytes,
    };
    if (info.usedBytes !== undefined && info.availableBytes !== undefined) {
      info.totalBytes = info.usedBytes + info.availableBytes;
    }
    return info;
  }

  private forgetDir(path: string): void {
    const normalized = normalizePath(path, { collection: true });
    for (const dir of [...this.createdDirs]) {
      if (dir === normalized || dir.startsWith(normalized.endsWith('/') ? normalized : normalized + '/')) {
        this.createdDirs.delete(dir);
      }
    }
  }

  /** No-op for fetch, kept for API symmetry with socket-based clients. */
  close(): void {
    this.createdDirs.clear();
  }
}

export function createWebDavClient(options: WebDavClientOptions): WebDavClient {
  return new WebDavClient(options);
}

export { detectProvider };
export type { ProviderPreset };
