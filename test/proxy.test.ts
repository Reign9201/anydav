import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { WebDavClient } from '../src/client.js';
import { MockWebDavServer } from './mock-server.js';

const proxyScript = fileURLToPath(new URL('../../examples/node-proxy.mjs', import.meta.url));

async function waitFor<T>(fn: () => T | undefined, timeoutMs = 5000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = fn();
    if (value !== undefined) return value;
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for proxy');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('examples/node-proxy.mjs', () => {
  let server: MockWebDavServer;
  let proxy: ChildProcess | undefined;
  let client: WebDavClient | undefined;

  beforeEach(async () => {
    server = new MockWebDavServer();
    await server.start();
    let output = '';
    proxy = spawn(process.execPath, [proxyScript], {
      env: {
        ...process.env,
        WEBDAV_BASE_URL: server.url,
        WEBDAV_USERNAME: 'alice',
        WEBDAV_PASSWORD: 'secret',
        PORT: '0',
        HOST: '127.0.0.1',
        ALLOW_ORIGIN: 'http://localhost:5173',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proxy.stdout?.on('data', (chunk) => {
      output += String(chunk);
    });
    proxy.stderr?.on('data', (chunk) => {
      output += String(chunk);
    });
    const base = await waitFor(() => {
      const match = /listening on (http:\/\/[^/]+)/.exec(output);
      return match ? `${match[1]}/api/dav/` : undefined;
    });
    client = new WebDavClient({
      baseUrl: base,
      username: 'proxy',
      password: 'unused',
      provider: 'generic',
      retries: 0,
    });
  });

  afterEach(async () => {
    client?.close();
    if (proxy && proxy.exitCode === null) {
      proxy.kill('SIGKILL');
      await new Promise((resolve) => proxy!.once('exit', resolve));
    }
    await server.stop();
  });

  it('forwards WebDAV verbs and rewrites hrefs/destinations', async () => {
    server.seedFile('/dav/hello.txt', 'hello');
    const info = await client!.testConnection();
    assert.equal(info.ok, true);
    assert.deepEqual((await client!.list('/')).map((resource) => resource.name), ['hello.txt']);
    assert.equal((await client!.readText('/hello.txt')).text, 'hello');

    await client!.writeText('/new.txt', 'through proxy');
    assert.equal(server.files.get('/dav/new.txt')?.data.toString(), 'through proxy');
    await client!.move('/new.txt', '/moved.txt');
    assert.ok(server.files.has('/dav/moved.txt'));
    await client!.remove('/moved.txt');
    assert.equal(server.files.has('/dav/moved.txt'), false);
  });
});
