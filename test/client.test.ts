import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { WebDavClient } from '../src/client.js';
import { DavError } from '../src/errors.js';
import { MockWebDavServer } from './mock-server.js';

function isCode(code: string) {
  return (error: unknown) => error instanceof DavError && error.code === code;
}

describe('WebDavClient against an in-memory WebDAV server', () => {
  let server: MockWebDavServer;
  let client: WebDavClient;

  beforeEach(async () => {
    server = new MockWebDavServer({ quotaAvailable: 1_000_000, quotaUsed: 2048 });
    const url = await server.start();
    client = new WebDavClient({
      baseUrl: url,
      username: 'alice',
      password: 'secret',
      provider: 'generic',
      retries: 0,
      retryDelayMs: 1,
    });
  });

  afterEach(async () => {
    client.close();
    await server.stop();
  });

  it('tests the connection and reports DAV capabilities', async () => {
    const info = await client.testConnection();
    assert.equal(info.ok, true);
    assert.equal(info.provider.id, 'generic');
    assert.deepEqual(info.dav, ['1', '2']);
    assert.equal(info.authScheme, 'basic');
    assert.ok(info.latencyMs >= 0);
  });

  it('creates collections, writes files, stats and lists them', async () => {
    await client.mkdir('/notes', { recursive: true });
    assert.ok(await client.exists('/notes'));
    await client.writeText('/notes/a.txt', 'hello', { createParents: false });
    const stat = await client.stat('/notes/a.txt');
    assert.ok(stat);
    assert.equal(stat.isCollection, false);
    assert.equal(stat.size, 5);
    assert.ok(stat.etag);
    const list = await client.list('/notes');
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'a.txt');
    assert.equal(list[0].path, '/notes/a.txt');
  });

  it('handles Unicode, spaces and percent-encoded input paths', async () => {
    await client.mkdir('/中文 目录');
    await client.writeText('/中文 目录/文件.txt', '你好');
    const encoded = await client.readText('/%E4%B8%AD%E6%96%87%20%E7%9B%AE%E5%BD%95/%E6%96%87%E4%BB%B6.txt');
    assert.equal(encoded.text, '你好');
    const list = await client.list('/中文 目录');
    assert.equal(list[0].name, '文件.txt');
  });

  it('keeps literal percent sequences in file names', async () => {
    await client.writeText('/a%2520b.txt', 'literal');
    const list = await client.list('/');
    assert.ok(list.some((resource) => resource.name === 'a%20b.txt'));
    assert.equal((await client.readText('/a%2520b.txt')).text, 'literal');
  });

  it('creates missing parents automatically for writes', async () => {
    await client.writeText('/a/b/c.txt', 'x');
    assert.ok(await client.exists('/a'));
    assert.ok(await client.exists('/a/b'));
    assert.equal((await client.readText('/a/b/c.txt')).text, 'x');
  });

  it('recovers when a cached parent disappeared', async () => {
    await client.writeText('/a/b.txt', 'one');
    server.dirs.delete('/dav/a/');
    await client.writeText('/a/b.txt', 'two');
    assert.equal((await client.readText('/a/b.txt')).text, 'two');
  });

  it('supports conditional writes and reads', async () => {
    await client.writeText('/c.txt', 'one');
    await assert.rejects(
      client.writeText('/c.txt', 'two', { ifNoneMatch: '*' }),
      isCode('PRECONDITION_FAILED'),
    );
    await assert.rejects(
      client.writeText('/c.txt', 'two', { ifMatch: '"wrong"' }),
      isCode('PRECONDITION_FAILED'),
    );
    const stat = await client.stat('/c.txt');
    const updated = await client.writeText('/c.txt', 'two', { ifMatch: stat?.etag });
    assert.equal((await client.readText('/c.txt')).text, 'two');
    const notModified = await client.readFile('/c.txt', { ifNoneMatch: updated.etag });
    assert.equal(notModified.notModified, true);
    assert.equal(notModified.data.length, 0);
  });

  it('reads byte ranges', async () => {
    await client.writeText('/c.txt', 'abcdef');
    const range = await client.readFile('/c.txt', { range: { start: 1, end: 3 } });
    assert.equal(range.status, 206);
    assert.equal(new TextDecoder().decode(range.data), 'bcd');
  });

  it('moves, copies and removes resources', async () => {
    await client.writeText('/m.txt', 'm');
    await client.copy('/m.txt', '/copy.txt');
    assert.ok(await client.exists('/copy.txt'));
    await client.move('/m.txt', '/moved.txt');
    assert.equal(await client.exists('/m.txt'), false);
    assert.ok(await client.exists('/moved.txt'));
    await client.remove('/moved.txt');
    assert.equal(await client.removeIfExists('/moved.txt'), false);
  });

  it('reads quota properties', async () => {
    const quota = await client.getQuota('/');
    assert.ok(quota);
    assert.equal(quota.usedBytes, 2048);
    assert.equal(quota.availableBytes, 1_000_000);
    assert.equal(quota.totalBytes, 1_002_048);
  });

  it('returns null for a missing stat and throws for a missing listing', async () => {
    assert.equal(await client.stat('/missing.txt'), null);
    await assert.rejects(client.list('/missing'), isCode('NOT_FOUND'));
  });

  it('reads and writes JSON', async () => {
    await client.writeJson('/state.json', { hello: '世界', n: 1 });
    const result = await client.readJson<{ hello: string; n: number }>('/state.json');
    assert.deepEqual(result.value, { hello: '世界', n: 1 });
    const missing = await client.readJson('/none.json');
    assert.equal(missing.value, null);
  });

  it('supports Depth 0 listings that include the collection itself', async () => {
    const [self] = await client.list('/', { depth: 0 });
    assert.ok(self);
    assert.equal(self.isCollection, true);
    assert.equal(self.path, '/');
  });

  it('resolves hrefs through a same-origin proxy with a different path', async () => {
    const origin = server.url.replace(/\/dav\/$/, '');
    const proxyBase = `${origin}/api/dav/`;
    const proxyFetch: typeof fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      url.pathname = url.pathname.replace(/^\/api\/dav\//, '/dav/');
      const destination = new Headers(init?.headers).get('destination');
      const headers = new Headers(init?.headers);
      if (destination) headers.set('destination', destination.replace(/\/api\/dav\//, '/dav/'));
      return fetch(url, { ...init, headers });
    };
    const proxied = new WebDavClient({
      baseUrl: proxyBase,
      username: 'alice',
      password: 'secret',
      provider: 'generic',
      retries: 0,
      fetch: proxyFetch,
    });
    server.seedFile('/dav/hello.txt', 'hello');
    const list = await proxied.list('/');
    assert.deepEqual(list.map((resource) => resource.name), ['hello.txt']);
    assert.equal(list[0].path, '/hello.txt');
    assert.equal((await proxied.readText('/hello.txt')).text, 'hello');
  });

  it('surfaces authentication failures with a hint', async () => {
    const bad = new WebDavClient({
      baseUrl: server.url,
      username: 'alice',
      password: 'wrong',
      provider: 'generic',
      retries: 0,
    });
    await assert.rejects(
      bad.testConnection(),
      (error: unknown) =>
        error instanceof DavError && error.code === 'UNAUTHORIZED' && Boolean(error.hint),
    );
  });

  it('keeps file paths free of a trailing slash in DELETE and MOVE', async () => {
    await client.writeText('/x.txt', 'x');
    server.resetRequests();
    await client.remove('/x.txt');
    assert.equal(server.requests.find((request) => request.method === 'DELETE')?.path, '/dav/x.txt');

    await client.writeText('/y.txt', 'y');
    server.resetRequests();
    await client.move('/y.txt', '/z.txt');
    assert.equal(server.requests.find((request) => request.method === 'MOVE')?.path, '/dav/y.txt');
  });

  it('does not retry a stream upload because the body cannot be replayed', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('streamed'));
        controller.close();
      },
    });
    server.failNext(503, 1);
    await assert.rejects(client.writeFile('/stream.txt', stream), isCode('SERVICE_UNAVAILABLE'));
    assert.equal(server.countRequests('PUT'), 1);
  });

  it('retries idempotent requests on 503', async () => {
    const retrying = new WebDavClient({
      baseUrl: server.url,
      username: 'alice',
      password: 'secret',
      provider: 'generic',
      retries: 2,
      retryDelayMs: 1,
      maxRetryDelayMs: 5,
    });
    server.failNext(503, 2);
    const info = await retrying.testConnection();
    assert.equal(info.ok, true);
    assert.ok(server.countRequests('OPTIONS') >= 3);
  });

  it('applies provider-specific hints without hiding the status', async () => {
    const jianguoyun = new WebDavClient({
      baseUrl: server.url,
      username: 'alice',
      password: 'secret',
      provider: 'jianguoyun',
      retries: 0,
    });
    server.failNext(403);
    await assert.rejects(
      jianguoyun.testConnection(),
      (error: unknown) =>
        error instanceof DavError &&
        error.code === 'FORBIDDEN' &&
        error.status === 403 &&
        /600 次/.test(error.hint ?? ''),
    );
  });

  it('refuses to delete the account root', async () => {
    await assert.rejects(client.remove('/'), isCode('INVALID_PATH'));
  });
});
