import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MockWebDavServer } from './mock-server.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const execFileAsync = promisify(execFile);

async function run(args: string[], env: Record<string, string> = {}): Promise<string> {
  const { stdout } = await execFileAsync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return stdout;
}

describe('anydav CLI', () => {
  it('lists the provider registry as JSON', async () => {
    const providers = JSON.parse(await run(['providers', '--json'])) as Array<{ id: string }>;
    assert.ok(providers.length >= 30);
    assert.ok(providers.some((provider) => provider.id === 'jianguoyun'));
  });

  it('detects providers from a URL', async () => {
    const output = await run(['detect', 'https://dav.jianguoyun.com/dav/']);
    assert.match(output, /jianguoyun/);
    assert.match(output, /confidence=high/);
  });

  describe('against a live mock server', () => {
    let server: MockWebDavServer;
    let env: Record<string, string>;
    let temp: string;

    beforeEach(async () => {
      server = new MockWebDavServer({ quotaAvailable: 10_000, quotaUsed: 100 });
      const url = await server.start();
      env = {
        WEBDAV_URL: url,
        WEBDAV_USER: 'alice',
        WEBDAV_PASSWORD: 'secret',
      };
      temp = mkdtempSync(join(tmpdir(), 'anydav-cli-'));
    });

    afterEach(async () => {
      rmSync(temp, { recursive: true, force: true });
      await server.stop();
    });

    it('tests, lists, uploads and downloads', async () => {
      const test = await run(['test', '--write'], env);
      assert.match(test, /OK/);
      assert.match(test, /写入测试: OK/);

      server.seedFile('/dav/hello.txt', 'hello');
      assert.match(await run(['ls', '/'], env), /hello\.txt/);

      const local = join(temp, 'upload.txt');
      writeFileSync(local, 'uploaded content');
      await run(['put', local, '/uploaded.txt'], env);
      assert.equal(server.files.get('/dav/uploaded.txt')?.data.toString('utf8'), 'uploaded content');

      const downloaded = join(temp, 'downloaded.txt');
      await run(['get', '/uploaded.txt', downloaded], env);
      assert.equal(readFileSync(downloaded, 'utf8'), 'uploaded content');

      const quota = JSON.parse(await run(['quota', '--json'], env)) as {
        usedBytes: number;
        availableBytes: number;
      };
      assert.equal(quota.usedBytes, 100);
      assert.equal(quota.availableBytes, 10_000);

      await run(['mkdir', '/new-folder'], env);
      assert.match(await run(['ls', '/'], env), /new-folder/);
      await run(['rm', '/new-folder'], env);
    });
  });
});
