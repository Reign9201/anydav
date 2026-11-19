import { DavError, isDavError } from './errors.js';
import { normalizePath } from './paths.js';
import type { DavResource } from './types.js';
import type { WebDavClient } from './client.js';

/**
 * Optional multi-device JSON sync built on the transport client.
 *
 * The pattern is the one used by several local-first apps: every device writes
 * only its own `<deviceId>.json` file into a shared folder; a sync round lists
 * the folder, downloads files whose ETag changed, hands every state to the
 * caller's `merge` function, and uploads the merged state back to its own file
 * when the fingerprint changed.
 *
 * The merge semantics stay in the application: this module only owns
 * transport, ETag caching, conditional writes and fingerprinting.
 */

export interface RemoteState<T> {
  deviceId: string;
  fileName: string;
  state: T;
  etag?: string;
}

export interface MergeContext<T> {
  local: T | null;
  remotes: RemoteState<T>[];
  now: number;
}

export interface SyncCacheSnapshot {
  etags: Record<string, string>;
  states: Record<string, unknown>;
  uploaded: Record<string, string>;
}

export interface SyncCache {
  getEtag(key: string): string | undefined;
  setEtag(key: string, etag: string): void;
  getState<T>(key: string): T | undefined;
  setState(key: string, state: unknown): void;
  getUploaded(key: string): string | undefined;
  setUploaded(key: string, fingerprint: string): void;
  snapshot(): SyncCacheSnapshot;
}

/** In-memory cache. Persist `snapshot()` if you want to skip re-downloads across launches. */
export class MemorySyncCache implements SyncCache {
  private readonly etags = new Map<string, string>();
  private readonly states = new Map<string, unknown>();
  private readonly uploaded = new Map<string, string>();

  getEtag(key: string): string | undefined {
    return this.etags.get(key);
  }

  setEtag(key: string, etag: string): void {
    this.etags.set(key, etag);
  }

  getState<T>(key: string): T | undefined {
    return this.states.get(key) as T | undefined;
  }

  setState(key: string, state: unknown): void {
    this.states.set(key, state);
  }

  getUploaded(key: string): string | undefined {
    return this.uploaded.get(key);
  }

  setUploaded(key: string, fingerprint: string): void {
    this.uploaded.set(key, fingerprint);
  }

  snapshot(): SyncCacheSnapshot {
    return {
      etags: Object.fromEntries(this.etags),
      states: Object.fromEntries(this.states),
      uploaded: Object.fromEntries(this.uploaded),
    };
  }

  restore(snapshot: SyncCacheSnapshot): void {
    for (const [key, value] of Object.entries(snapshot.etags ?? {})) this.etags.set(key, value);
    for (const [key, value] of Object.entries(snapshot.states ?? {})) this.states.set(key, value);
    for (const [key, value] of Object.entries(snapshot.uploaded ?? {})) this.uploaded.set(key, value);
  }
}

export interface JsonSyncOptions<T> {
  client: WebDavClient;
  /** Shared folder under the account root. Default `/`. */
  folder?: string;
  /** Stable per-device id; used as the file name. `[A-Za-z0-9._-]{1,64}`. */
  deviceId: string;
  /** File extension. Default `.json`. */
  extension?: string;
  /** Application merge function. Must be deterministic for a given input set. */
  merge: (context: MergeContext<T>) => T;
  /** Optional stable fingerprint; defaults to stable JSON stringify. */
  fingerprint?: (state: T) => string;
  /** Serialize before upload. Default JSON.stringify. */
  encode?: (state: T) => string;
  /** Parse after download. Default JSON.parse. */
  decode?: (text: string, resource: DavResource) => T;
  cache?: SyncCache;
  /** Retries when If-Match fails because the device file changed concurrently. Default 1. */
  maxConflictRetries?: number;
  /** Skip malformed remote files instead of failing the round. Default true. */
  skipInvalid?: boolean;
  signal?: AbortSignal;
}

export interface SyncResult<T> {
  state: T;
  uploaded: boolean;
  downloaded: string[];
  devices: string[];
  skipped: string[];
  syncedAt: number;
  etag?: string;
}

const DEVICE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const EXTENSION = /^\.[A-Za-z0-9._-]{1,16}$/;

/** Deterministic JSON: object keys are sorted recursively. */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const sort = (node: unknown): unknown => {
    if (node === null || typeof node !== 'object') return node;
    if (seen.has(node as object)) {
      throw new DavError({ code: 'PARSE', message: 'Cannot fingerprint a cyclic value' });
    }
    seen.add(node as object);
    try {
      if (Array.isArray(node)) return node.map(sort);
      const source = node as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(source).sort()) result[key] = sort(source[key]);
      return result;
    } finally {
      seen.delete(node as object);
    }
  };
  return JSON.stringify(sort(value));
}

export class JsonSyncEngine<T> {
  private readonly client: WebDavClient;
  private readonly folder: string;
  private readonly deviceId: string;
  private readonly extension: string;
  private readonly merge: JsonSyncOptions<T>['merge'];
  private readonly fingerprint: (state: T) => string;
  private readonly encode: (state: T) => string;
  private readonly decode: (text: string, resource: DavResource) => T;
  private readonly cache: SyncCache;
  private readonly maxConflictRetries: number;
  private readonly skipInvalid: boolean;
  private readonly namespace: string;
  private readonly optionSignal?: AbortSignal;

  constructor(options: JsonSyncOptions<T>) {
    if (!DEVICE_ID.test(options.deviceId)) {
      throw new DavError({
        code: 'INVALID_PATH',
        message: `Invalid deviceId: ${options.deviceId}`,
        hint: 'deviceId 只能包含字母、数字、点、下划线和连字符，长度 1–64。',
      });
    }
    const extension = options.extension ?? '.json';
    if (!EXTENSION.test(extension)) {
      throw new DavError({
        code: 'INVALID_PATH',
        message: `Invalid sync file extension: ${extension}`,
      });
    }
    this.client = options.client;
    this.folder = normalizePath(options.folder ?? '/', { collection: true });
    this.deviceId = options.deviceId;
    this.extension = extension;
    this.merge = options.merge;
    this.fingerprint = options.fingerprint ?? ((state) => stableStringify(state));
    this.encode = options.encode ?? ((state) => JSON.stringify(state));
    this.decode =
      options.decode ??
      ((text) => {
        try {
          return JSON.parse(text) as T;
        } catch (cause) {
          throw new DavError({
            code: 'PARSE',
            message: 'Remote sync file is not valid JSON',
            responseBody: text.slice(0, 500),
            cause,
          });
        }
      });
    this.cache = options.cache ?? new MemorySyncCache();
    this.maxConflictRetries = options.maxConflictRetries ?? 1;
    this.skipInvalid = options.skipInvalid ?? true;
    this.optionSignal = options.signal;
    this.namespace = `${this.client.baseUrl}${this.folder}`;
  }

  private cacheKey(name: string): string {
    return `${this.namespace}${name}`;
  }

  private uploadedKey(): string {
    return `${this.namespace}::${this.deviceId}`;
  }

  /** Run one sync round. */
  async sync(local: T | null, options: { signal?: AbortSignal; dryRun?: boolean } = {}): Promise<SyncResult<T>> {
    const signal = options.signal ?? this.optionSignal;
    for (let conflictAttempt = 0; ; conflictAttempt++) {
      try {
        return await this.round(local, options.dryRun ?? false, signal);
      } catch (error) {
        if (
          isDavError(error) &&
          error.status === 412 &&
          conflictAttempt < this.maxConflictRetries
        ) {
          continue;
        }
        throw error;
      }
    }
  }

  private async round(local: T | null, dryRun: boolean, signal?: AbortSignal): Promise<SyncResult<T>> {
    await this.client.mkdir(this.folder, { recursive: true, signal });
    const resources = await this.client.list(this.folder, { signal });
    const ownName = `${this.deviceId}${this.extension}`;
    const own = resources.find((resource) => !resource.isCollection && resource.name === ownName);
    const remotes: RemoteState<T>[] = [];
    const downloaded: string[] = [];
    const skipped: string[] = [];
    const devices: string[] = [];

    for (const resource of resources) {
      if (resource.isCollection) continue;
      if (!resource.name.endsWith(this.extension)) continue;
      if (resource.name === ownName) continue;
      const deviceId = resource.name.slice(0, -this.extension.length);
      devices.push(deviceId);
      const key = this.cacheKey(resource.name);
      const cachedEtag = this.cache.getEtag(key);
      if (resource.etag && cachedEtag && cachedEtag === resource.etag) {
        const cached = this.cache.getState<T>(key);
        if (cached !== undefined) {
          remotes.push({ deviceId, fileName: resource.name, state: cached, etag: resource.etag });
          continue;
        }
      }
      try {
        const text = await this.client.readText(resource.path, { signal });
        if (text.notModified) continue;
        const state = this.decode(text.text, resource);
        if (resource.etag) {
          this.cache.setEtag(key, resource.etag);
          this.cache.setState(key, state);
        }
        remotes.push({ deviceId, fileName: resource.name, state, etag: resource.etag });
        downloaded.push(resource.name);
      } catch (error) {
        const skippable =
          isDavError(error) && (error.code === 'PARSE' || error.code === 'NOT_FOUND');
        if (this.skipInvalid && skippable) {
          skipped.push(resource.name);
          continue;
        }
        throw error;
      }
    }

    const now = Date.now();
    const merged = this.merge({ local, remotes, now });
    const fingerprint = this.fingerprint(merged);
    const uploadedBefore = this.cache.getUploaded(this.uploadedKey());
    let uploaded = false;
    let etag = own?.etag;

    if (uploadedBefore !== fingerprint && !dryRun) {
      const ownPath = normalizePath(`${this.folder}${ownName}`);
      const result = await this.client.writeText(ownPath, this.encode(merged), {
        contentType: 'application/json; charset=utf-8',
        ifMatch: own?.etag,
        createParents: true,
        signal,
      });
      uploaded = true;
      etag = result.etag ?? etag;
      this.cache.setUploaded(this.uploadedKey(), fingerprint);
      if (etag) this.cache.setEtag(this.cacheKey(ownName), etag);
      this.cache.setState(this.cacheKey(ownName), merged);
    }

    devices.sort();
    return {
      state: merged,
      uploaded,
      downloaded,
      devices,
      skipped,
      syncedAt: now,
      etag,
    };
  }
}

export function createJsonSync<T>(options: JsonSyncOptions<T>): JsonSyncEngine<T> {
  return new JsonSyncEngine<T>(options);
}
