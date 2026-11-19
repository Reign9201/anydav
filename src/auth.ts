import { DavError } from './errors.js';
import type { AuthScheme } from './types.js';

export interface AuthOptions {
  scheme: AuthScheme;
  username?: string;
  password?: string;
  token?: string;
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/**
 * UTF-8 aware Base64. `btoa` alone corrupts non-Latin1 credentials, which is
 * exactly the case for Chinese usernames/passwords.
 */
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Pure JS fallback for runtimes without `btoa` or `Buffer` (e.g. React Native). */
function manualBase64(bytes: Uint8Array): string {
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    output += BASE64_ALPHABET[b0 >> 2];
    output += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    output += hasB1 ? BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    output += hasB2 ? BASE64_ALPHABET[b2 & 0x3f] : '=';
  }
  return output;
}

export function base64Encode(value: string): string {
  const bytes = utf8Bytes(value);
  if (typeof btoa === 'function') {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  return manualBase64(bytes);
}

export function basicAuthHeader(username: string, password: string): string {
  return `Basic ${base64Encode(`${username}:${password}`)}`;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return toHex(bytes).slice(0, length);
}

async function hashHex(algorithm: string, value: string): Promise<string> {
  const data = utf8Bytes(value);
  const upper = algorithm.toUpperCase();
  if (upper.startsWith('SHA-256')) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
      return toHex(new Uint8Array(digest));
    }
    throw new DavError({
      code: 'UNAUTHORIZED',
      message: 'SHA-256 Digest auth is unavailable in this runtime',
    });
  }
  if (upper === 'MD5' || upper === 'MD5-SESS') {
    // MD5 is not available through Web Crypto. Node's crypto is loaded lazily
    // so browser bundles do not pull in node:crypto.
    try {
      const nodeCrypto = await import('node:crypto');
      return nodeCrypto.createHash('md5').update(data).digest('hex');
    } catch {
      throw new DavError({
        code: 'UNAUTHORIZED',
        message: 'MD5 Digest auth requires the Node.js runtime',
        hint: '大多数 WebDAV 服务使用 Basic 认证；Digest/MD5 仅在后端 Node 环境可用。',
      });
    }
  }
  throw new DavError({
    code: 'UNAUTHORIZED',
    message: `Unsupported Digest algorithm: ${algorithm}`,
  });
}

export interface DigestChallenge {
  realm: string;
  nonce: string;
  opaque?: string;
  algorithm: string;
  qop?: string[];
  stale?: boolean;
  charset?: string;
}

/** Scan a WWW-Authenticate header for a Digest challenge and parse its params. */
export function parseDigestChallenge(header: string | null | undefined): DigestChallenge | undefined {
  if (!header) return undefined;
  const match = /\bDigest\s+/i.exec(header);
  if (!match) return undefined;
  const rest = header.slice(match.index + match[0].length);
  const params: Record<string, string> = {};
  let i = 0;
  while (i < rest.length) {
    while (i < rest.length && /[\s,]/.test(rest[i])) i++;
    const keyStart = i;
    while (i < rest.length && /[A-Za-z0-9_-]/.test(rest[i])) i++;
    const key = rest.slice(keyStart, i).toLowerCase();
    if (!key) break;
    while (i < rest.length && /\s/.test(rest[i])) i++;
    if (rest[i] !== '=') break;
    i++;
    while (i < rest.length && /\s/.test(rest[i])) i++;
    let value = '';
    if (rest[i] === '"') {
      i++;
      const start = i;
      while (i < rest.length && rest[i] !== '"') i++;
      value = rest.slice(start, i);
      i++;
    } else {
      const start = i;
      while (i < rest.length && !/[\s,]/.test(rest[i])) i++;
      value = rest.slice(start, i);
    }
    params[key] = value;
  }
  if (!params.realm || !params.nonce) return undefined;
  return {
    realm: params.realm,
    nonce: params.nonce,
    opaque: params.opaque,
    algorithm: params.algorithm || 'MD5',
    qop: params.qop ? params.qop.split(',').map((q) => q.trim().toLowerCase()).filter(Boolean) : undefined,
    stale: params.stale === 'true',
    charset: params.charset,
  };
}

export interface DigestAuthInput {
  username: string;
  password: string;
  method: string;
  /** Request target: path + query, e.g. `/dav/a.txt`. */
  uri: string;
  challenge: DigestChallenge;
  nc: number;
  /** Fixed client nonce, mainly for tests. */
  cnonce?: string;
}

/** Compute an RFC 7616/2617 Authorization header for a Digest challenge. */
export async function digestAuthHeader(input: DigestAuthInput): Promise<string> {
  const { username, password, method, uri, challenge } = input;
  const algorithm = challenge.algorithm;
  const nc = input.nc.toString(16).padStart(8, '0');
  const cnonce = input.cnonce ?? randomHex(16);
  const qop = challenge.qop?.includes('auth') ? 'auth' : undefined;

  let ha1 = await hashHex(algorithm, `${username}:${challenge.realm}:${password}`);
  if (algorithm.toUpperCase().endsWith('-SESS')) {
    ha1 = await hashHex(algorithm, `${ha1}:${challenge.nonce}:${cnonce}`);
  }
  const ha2 = await hashHex(algorithm, `${method}:${uri}`);
  const response = qop
    ? await hashHex(algorithm, `${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : await hashHex(algorithm, `${ha1}:${challenge.nonce}:${ha2}`);

  const parts = [
    `username="${username.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
    `realm="${challenge.realm.replace(/"/g, '\\"')}"`,
    `nonce="${challenge.nonce.replace(/"/g, '\\"')}"`,
    `uri="${uri.replace(/"/g, '\\"')}"`,
    `response="${response}"`,
    `algorithm=${algorithm}`,
  ];
  if (qop) {
    parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque.replace(/"/g, '\\"')}"`);
  return `Digest ${parts.join(', ')}`;
}

/**
 * Holds the auth state for one client. Basic/Bearer are preemptive; Digest is
 * challenged once and then reused with an incrementing nonce count.
 */
export class WebDavAuth {
  private digest?: { challenge: DigestChallenge; nc: number };

  constructor(private readonly options: AuthOptions) {}

  get scheme(): AuthScheme {
    return this.options.scheme;
  }

  async initialHeader(method: string, url: URL): Promise<Record<string, string>> {
    switch (this.options.scheme) {
      case 'basic': {
        const { username = '', password = '' } = this.options;
        return { authorization: basicAuthHeader(username, password) };
      }
      case 'bearer':
        return this.options.token ? { authorization: `Bearer ${this.options.token}` } : {};
      case 'digest':
        if (this.digest) return this.digestHeader(method, url);
        return {};
      case 'none':
      default:
        return {};
    }
  }

  /** Handle a 401 challenge; returns null when no supported challenge exists. */
  async challengeHeader(
    method: string,
    url: URL,
    wwwAuthenticate: string | null,
  ): Promise<Record<string, string> | null> {
    if (this.options.scheme !== 'digest') return null;
    const challenge = parseDigestChallenge(wwwAuthenticate);
    if (!challenge) return null;
    this.digest = { challenge, nc: 1 };
    return this.digestHeader(method, url);
  }

  private async digestHeader(method: string, url: URL): Promise<Record<string, string>> {
    if (!this.digest) return {};
    const { username = '', password = '' } = this.options;
    const { challenge } = this.digest;
    const uri = url.pathname + url.search;
    const header = await digestAuthHeader({
      username,
      password,
      method,
      uri,
      challenge,
      nc: this.digest.nc++,
    });
    return { authorization: header };
  }
}
