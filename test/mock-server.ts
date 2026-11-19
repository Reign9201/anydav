import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';

export interface MockFile {
  data: Buffer;
  contentType: string;
  etag: string;
  mtime: Date;
}

export interface MockRequestLog {
  method: string;
  path: string;
  depth?: string;
  status: number;
  authorization?: string;
}

export interface MockServerOptions {
  username?: string;
  password?: string;
  basePath?: string;
  quotaAvailable?: number;
  quotaUsed?: number;
}

function canonicalDir(value: string): string {
  let path = value.startsWith('/') ? value : `/${value}`;
  path = path.replace(/\/{2,}/g, '/');
  if (!path.endsWith('/')) path += '/';
  return path;
}

function canonicalFile(value: string): string {
  let path = value.startsWith('/') ? value : `/${value}`;
  path = path.replace(/\/{2,}/g, '/');
  return path.replace(/\/+$/, '');
}

function parentDir(filePath: string): string {
  const trimmed = filePath.replace(/\/+$/, '');
  const index = trimmed.lastIndexOf('/');
  return index <= 0 ? '/' : trimmed.slice(0, index) + '/';
}

function baseName(value: string): string {
  const trimmed = value.replace(/\/+$/, '');
  const index = trimmed.lastIndexOf('/');
  return trimmed.slice(index + 1);
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function encodeHref(path: string): string {
  const trailing = path.endsWith('/');
  const parts = path.split('/').filter(Boolean).map((segment) => encodeURIComponent(segment));
  return '/' + parts.join('/') + (trailing && parts.length > 0 ? '/' : '');
}

function httpDate(date: Date): string {
  return date.toUTCString();
}

/**
 * A small in-memory WebDAV server used by the integration tests. It implements
 * the subset the SDK promises: OPTIONS, PROPFIND (Depth 0/1), MKCOL, GET,
 * HEAD, PUT, DELETE, MOVE and COPY, with ETags, conditional writes, ranges and
 * quota properties.
 */
export class MockWebDavServer {
  readonly username: string;
  readonly password: string;
  readonly basePath: string;
  readonly quotaAvailable?: number;
  readonly quotaUsed?: number;
  readonly dirs = new Set<string>();
  readonly files = new Map<string, MockFile>();
  readonly requests: MockRequestLog[] = [];

  private server?: Server;
  private revision = 0;
  private failures: Array<{ status: number; remaining: number }> = [];

  constructor(options: MockServerOptions = {}) {
    this.username = options.username ?? 'alice';
    this.password = options.password ?? 'secret';
    this.basePath = canonicalDir(options.basePath ?? '/dav/');
    this.quotaAvailable = options.quotaAvailable;
    this.quotaUsed = options.quotaUsed;
    this.dirs.add('/');
    this.ensureDirs(this.basePath);
  }

  get url(): string {
    const address = this.server?.address() as AddressInfo | undefined;
    if (!address) throw new Error('MockWebDavServer is not started');
    return `http://127.0.0.1:${address.port}${this.basePath}`;
  }

  async start(): Promise<string> {
    this.server = createServer((request, response) => {
      this.handle(request, response).catch((error) => {
        response.statusCode = 500;
        response.end(String(error));
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    return this.url;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) =>
      this.server!.close((error) => (error ? reject(error) : resolve())),
    );
    this.server = undefined;
  }

  /** Make the next `count` requests fail with `status` (for retry tests). */
  failNext(status: number, count = 1): void {
    this.failures.push({ status, remaining: count });
  }

  resetRequests(): void {
    this.requests.length = 0;
  }

  countRequests(method?: string): number {
    return method
      ? this.requests.filter((request) => request.method === method.toUpperCase()).length
      : this.requests.length;
  }

  /** Seed a file directly, creating parent collections as needed. */
  seedFile(path: string, data: string | Buffer, contentType = 'text/plain; charset=utf-8'): MockFile {
    const filePath = canonicalFile(path);
    this.ensureDirs(parentDir(filePath));
    const file = this.makeFile(Buffer.isBuffer(data) ? data : Buffer.from(data), contentType);
    this.files.set(filePath, file);
    return file;
  }

  seedDir(path: string): void {
    this.ensureDirs(canonicalDir(path));
  }

  private ensureDirs(dir: string): void {
    const parts = canonicalDir(dir).split('/').filter(Boolean);
    let current = '/';
    this.dirs.add(current);
    for (const part of parts) {
      current = `${current}${part}/`;
      this.dirs.add(current);
    }
  }

  private makeFile(data: Buffer, contentType: string): MockFile {
    this.revision++;
    return {
      data,
      contentType,
      etag: `"mock-${this.revision}-${createHash('md5').update(data).digest('hex').slice(0, 8)}"`,
      mtime: new Date(),
    };
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = (request.method ?? 'GET').toUpperCase();
    const url = new URL(request.url ?? '/', 'http://localhost');
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      this.logWith(method, url.pathname, request, 400);
      response.statusCode = 400;
      response.end('bad path');
      return;
    }
    const body = await this.readBody(request);
    const send = (status: number, headers: Record<string, string | number> = {}, payload?: Buffer | string) => {
      this.logWith(method, path, request, status);
      response.writeHead(status, headers);
      response.end(payload);
    };

    const injected = this.failures.find((failure) => failure.remaining > 0);
    if (injected) {
      injected.remaining--;
      send(injected.status, { 'content-type': 'text/plain' }, 'injected failure');
      return;
    }

    if (!this.authorized(request)) {
      send(401, { 'www-authenticate': 'Basic realm="mock"', 'content-type': 'text/plain' }, 'unauthorized');
      return;
    }

    const dirPath = canonicalDir(path);
    const filePath = canonicalFile(path);
    const isDir = path.endsWith('/');

    switch (method) {
      case 'OPTIONS': {
        send(200, {
          DAV: '1, 2',
          Allow: 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, MKCOL, MOVE, COPY',
          'content-length': '0',
        });
        return;
      }
      case 'PROPFIND': {
        const resource = this.dirs.has(dirPath)
          ? { kind: 'dir' as const, path: dirPath }
          : this.files.has(filePath)
            ? { kind: 'file' as const, path: filePath }
            : undefined;
        if (!resource) {
          send(404, { 'content-type': 'text/plain' }, 'not found');
          return;
        }
        const depth = request.headers.depth === '0' ? 0 : 1;
        const entries: Array<{ kind: 'dir' | 'file'; path: string }> = [resource];
        if (depth === 1 && resource.kind === 'dir') {
          for (const child of this.children(resource.path)) entries.push(child);
        }
        send(207, { 'content-type': 'application/xml; charset=utf-8' }, this.multistatus(entries));
        return;
      }
      case 'MKCOL': {
        if (this.dirs.has(dirPath) || this.files.has(filePath)) {
          send(405, { 'content-type': 'text/plain' }, 'exists');
          return;
        }
        if (!this.dirs.has(parentDir(dirPath))) {
          send(409, { 'content-type': 'text/plain' }, 'parent missing');
          return;
        }
        this.dirs.add(dirPath);
        send(201, { 'content-type': 'text/plain' }, 'created');
        return;
      }
      case 'PUT': {
        if (isDir) {
          send(405, { 'content-type': 'text/plain' }, 'cannot PUT a collection');
          return;
        }
        if (!this.dirs.has(parentDir(filePath))) {
          send(409, { 'content-type': 'text/plain' }, 'parent missing');
          return;
        }
        const existing = this.files.get(filePath);
        const ifNoneMatch = request.headers['if-none-match'];
        if (ifNoneMatch === '*' && existing) {
          send(412, { 'content-type': 'text/plain' }, 'exists');
          return;
        }
        const ifMatch = request.headers['if-match'];
        if (ifMatch && (!existing || ifMatch.trim() !== existing.etag)) {
          send(412, { 'content-type': 'text/plain' }, 'etag mismatch');
          return;
        }
        const contentType = String(request.headers['content-type'] ?? 'application/octet-stream');
        const file = this.makeFile(body, contentType);
        this.files.set(filePath, file);
        send(existing ? 204 : 201, { etag: file.etag, 'content-type': 'text/plain' }, 'ok');
        return;
      }
      case 'GET':
      case 'HEAD': {
        if (this.dirs.has(dirPath)) {
          send(405, { 'content-type': 'text/plain' }, 'cannot GET a collection');
          return;
        }
        const file = this.files.get(filePath);
        if (!file) {
          send(404, { 'content-type': 'text/plain' }, 'not found');
          return;
        }
        const ifNoneMatch = request.headers['if-none-match'];
        if (ifNoneMatch && ifNoneMatch.trim() === file.etag) {
          send(304, { etag: file.etag });
          return;
        }
        let data = file.data;
        let status = 200;
        const headers: Record<string, string | number> = {
          etag: file.etag,
          'content-type': file.contentType,
          'last-modified': httpDate(file.mtime),
          'accept-ranges': 'bytes',
        };
        const range = request.headers.range;
        if (range) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(range);
          if (match) {
            const start = Number(match[1]);
            const end = match[2] ? Math.min(Number(match[2]), file.data.length - 1) : file.data.length - 1;
            if (start >= file.data.length || start > end) {
              send(416, { 'content-range': `bytes */${file.data.length}` });
              return;
            }
            data = file.data.subarray(start, end + 1);
            status = 206;
            headers['content-range'] = `bytes ${start}-${end}/${file.data.length}`;
          }
        }
        headers['content-length'] = data.length;
        send(status, headers, method === 'HEAD' ? undefined : data);
        return;
      }
      case 'DELETE': {
        const dir = this.dirs.has(dirPath) ? dirPath : undefined;
        const file = this.files.has(filePath) ? filePath : undefined;
        if (!dir && !file) {
          send(404, { 'content-type': 'text/plain' }, 'not found');
          return;
        }
        if (dir) this.deleteDir(dir);
        if (file) this.files.delete(file);
        send(204);
        return;
      }
      case 'MOVE':
      case 'COPY': {
        const sourceDir = this.dirs.has(dirPath) ? dirPath : undefined;
        const sourceFile = this.files.has(filePath) ? filePath : undefined;
        if (!sourceDir && !sourceFile) {
          send(404, { 'content-type': 'text/plain' }, 'not found');
          return;
        }
        const destinationHeader = String(request.headers.destination ?? '');
        if (!destinationHeader) {
          send(400, { 'content-type': 'text/plain' }, 'missing destination');
          return;
        }
        let destinationPath: string;
        try {
          destinationPath = decodeURIComponent(new URL(destinationHeader, 'http://localhost').pathname);
        } catch {
          send(400, { 'content-type': 'text/plain' }, 'bad destination');
          return;
        }
        const destinationDir = canonicalDir(destinationPath);
        const destinationFile = canonicalFile(destinationPath);
        const destinationExists = this.dirs.has(destinationDir) || this.files.has(destinationFile);
        if (destinationExists && request.headers.overwrite === 'F') {
          send(412, { 'content-type': 'text/plain' }, 'destination exists');
          return;
        }
        if (!this.dirs.has(parentDir(destinationPath.endsWith('/') ? destinationDir : destinationFile))) {
          send(409, { 'content-type': 'text/plain' }, 'destination parent missing');
          return;
        }
        if (sourceDir) {
          this.copyDir(sourceDir, destinationDir);
          if (method === 'MOVE') this.deleteDir(sourceDir);
        } else if (sourceFile) {
          const file = this.files.get(sourceFile)!;
          this.files.set(destinationFile, { ...file, mtime: new Date() });
          if (method === 'MOVE') this.files.delete(sourceFile);
        }
        send(destinationExists ? 204 : 201);
        return;
      }
      default:
        send(405, { 'content-type': 'text/plain' }, 'method not allowed');
    }
  }

  private logWith(method: string, path: string, request: IncomingMessage, status: number): void {
    this.requests.push({
      method,
      path,
      depth: request.headers.depth as string | undefined,
      status,
      authorization: request.headers.authorization,
    });
  }

  private authorized(request: IncomingMessage): boolean {
    const header = request.headers.authorization;
    if (!header?.startsWith('Basic ')) return false;
    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      return decoded === `${this.username}:${this.password}`;
    } catch {
      return false;
    }
  }

  private readBody(request: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => resolve(Buffer.concat(chunks)));
      request.on('error', reject);
    });
  }

  private children(dir: string): Array<{ kind: 'dir' | 'file'; path: string }> {
    const result: Array<{ kind: 'dir' | 'file'; path: string }> = [];
    const prefix = canonicalDir(dir);
    for (const candidate of this.dirs) {
      if (candidate === prefix || !candidate.startsWith(prefix)) continue;
      const rest = candidate.slice(prefix.length).replace(/\/$/, '');
      if (rest && !rest.includes('/')) result.push({ kind: 'dir', path: candidate });
    }
    for (const candidate of this.files.keys()) {
      if (!candidate.startsWith(prefix)) continue;
      const rest = candidate.slice(prefix.length);
      if (rest && !rest.includes('/')) result.push({ kind: 'file', path: candidate });
    }
    return result;
  }

  private multistatus(entries: Array<{ kind: 'dir' | 'file'; path: string }>): string {
    const parts = ['<?xml version="1.0" encoding="utf-8"?>', '<d:multistatus xmlns:d="DAV:">'];
    for (const entry of entries) {
      const isDir = entry.kind === 'dir';
      const file = isDir ? undefined : this.files.get(entry.path);
      const props: string[] = [
        `<d:resourcetype>${isDir ? '<d:collection/>' : ''}</d:resourcetype>`,
        `<d:displayname>${xmlEscape(baseName(entry.path))}</d:displayname>`,
      ];
      if (file) {
        props.push(
          `<d:getetag>${xmlEscape(file.etag)}</d:getetag>`,
          `<d:getcontentlength>${file.data.length}</d:getcontentlength>`,
          `<d:getlastmodified>${httpDate(file.mtime)}</d:getlastmodified>`,
          `<d:getcontenttype>${xmlEscape(file.contentType)}</d:getcontenttype>`,
        );
      }
      if (isDir && this.quotaAvailable !== undefined) {
        props.push(
          `<d:quota-available-bytes>${this.quotaAvailable}</d:quota-available-bytes>`,
          `<d:quota-used-bytes>${this.quotaUsed ?? 0}</d:quota-used-bytes>`,
        );
      }
      parts.push(
        '<d:response>',
        `<d:href>${xmlEscape(encodeHref(entry.path))}</d:href>`,
        '<d:propstat><d:prop>',
        props.join(''),
        '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>',
        '</d:response>',
      );
    }
    parts.push('</d:multistatus>');
    return parts.join('');
  }

  private deleteDir(dir: string): void {
    const prefix = canonicalDir(dir);
    for (const candidate of [...this.dirs]) {
      if (candidate.startsWith(prefix)) this.dirs.delete(candidate);
    }
    for (const candidate of [...this.files.keys()]) {
      if (candidate.startsWith(prefix)) this.files.delete(candidate);
    }
  }

  private copyDir(source: string, destination: string): void {
    const sourcePrefix = canonicalDir(source);
    const destinationPrefix = canonicalDir(destination);
    for (const candidate of [...this.dirs]) {
      if (candidate.startsWith(sourcePrefix)) {
        this.dirs.add(destinationPrefix + candidate.slice(sourcePrefix.length));
      }
    }
    this.dirs.add(destinationPrefix);
    for (const [candidate, file] of [...this.files.entries()]) {
      if (candidate.startsWith(sourcePrefix)) {
        this.files.set(destinationPrefix + candidate.slice(sourcePrefix.length), { ...file, mtime: new Date() });
      }
    }
  }
}
