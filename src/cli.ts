#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWebDavClient, type WebDavClient } from './client.js';
import { DavError, isDavError } from './errors.js';
import { PROVIDERS, detectProvider } from './providers.js';
import type { DavResource, WebDavClientOptions } from './types.js';

const VERSION = '0.1.0';

interface ParsedArgs {
  command?: string;
  positional: string[];
  flags: Record<string, string | true>;
}

const BOOLEAN_FLAGS = new Set(['json', 'help', 'version', 'write', 'recursive']);

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq > 0) {
        result.flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        const name = arg.slice(2);
        if (BOOLEAN_FLAGS.has(name)) {
          result.flags[name] = true;
        } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
          result.flags[name] = argv[++i];
        } else {
          result.flags[name] = true;
        }
      }
    } else if (!result.command) {
      result.command = arg;
    } else {
      result.positional.push(arg);
    }
  }
  return result;
}

function usage(): string {
  return `anydav ${VERSION} — 聚合 WebDAV 命令行

用法:
  anydav providers [--json]
  anydav detect <url>
  anydav test [--write]
  anydav ls [path]
  anydav stat <path>
  anydav cat <path>
  anydav get <remote> [local|]
  anydav put <local|-> <remote>
  anydav mkdir <path>
  anydav rm <path>
  anydav mv <from> <to>
  anydav cp <from> <to>
  anydav quota [path]

连接参数:
  --url <url>            WebDAV 根地址（或 WEBDAV_URL）
  --provider <id>        指定服务商（或 WEBDAV_PROVIDER）；默认自动识别
  --user <name>          用户名（或 WEBDAV_USER）
  --password <secret>    密码/应用密码（或 WEBDAV_PASSWORD；建议用环境变量）
  --token <token>        Bearer token（或 WEBDAV_TOKEN）
  --timeout <ms>         单请求超时，默认 30000
  --retries <n>          幂等请求重试次数，默认 2
  --json                 机器可读输出

示例:
  WEBDAV_URL=https://dav.jianguoyun.com/dav/ \\
  WEBDAV_USER=me@example.com WEBDAV_PASSWORD=app-password \\
  anydav test --provider jianguoyun --write

  anydav providers --json
  anydav detect https://cloud.example.com/remote.php/dav/files/alice/
`;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function stringFlag(flags: ParsedArgs['flags'], name: string): string | undefined {
  const value = flags[name];
  return typeof value === 'string' ? value : undefined;
}

function providerFromFlags(flags: ParsedArgs['flags']): string | undefined {
  return stringFlag(flags, 'provider') ?? env('WEBDAV_PROVIDER');
}

function numberFlag(
  flags: ParsedArgs['flags'],
  name: string,
  envName: string,
  fallback: number,
): number {
  const raw = stringFlag(flags, name) ?? env(envName);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new DavError({ code: 'INVALID_PATH', message: `Invalid ${name}: ${raw}` });
  }
  return value;
}

function clientFromFlags(flags: ParsedArgs['flags']): WebDavClient {
  const baseUrl = stringFlag(flags, 'url') ?? env('WEBDAV_URL');
  if (!baseUrl) {
    throw new DavError({
      code: 'INVALID_URL',
      message: 'Missing --url (or WEBDAV_URL)',
      hint: '例如 --url https://dav.jianguoyun.com/dav/',
    });
  }
  const options: WebDavClientOptions = {
    baseUrl,
    provider: providerFromFlags(flags) ?? undefined,
    username: stringFlag(flags, 'user') ?? env('WEBDAV_USER'),
    password: stringFlag(flags, 'password') ?? env('WEBDAV_PASSWORD'),
    token: stringFlag(flags, 'token') ?? env('WEBDAV_TOKEN'),
    timeoutMs: numberFlag(flags, 'timeout', 'WEBDAV_TIMEOUT', 30_000),
    retries: numberFlag(flags, 'retries', 'WEBDAV_RETRIES', 2),
  };
  if (flags.password) {
    console.error('提示：--password 会留在 shell 历史；建议改用 WEBDAV_PASSWORD 环境变量。');
  }
  return createWebDavClient(options);
}

function formatBytes(value: number | undefined): string {
  if (value === undefined) return '-';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let n = value / 1024;
  let unit = 0;
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024;
    unit++;
  }
  return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(value: Date | undefined): string {
  if (!value) return '-';
  return value.toISOString().replace('T', ' ').replace(/\..*$/, '');
}

function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function printProviders(asJson: boolean): void {
  if (asJson) {
    printJson(PROVIDERS);
    return;
  }
  const rows = PROVIDERS.map((provider) => [
    provider.id,
    provider.nameZh || provider.name,
    provider.category,
    provider.verification,
    provider.baseUrl || provider.urlTemplate || (provider.urlHints?.[0] ?? ''),
  ]);
  const headers = ['ID', '名称', '类别', '验证', '默认地址 / 模板'];
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => [...row[i]].length)),
  );
  const line = (cells: string[]) =>
    cells.map((cell, i) => cell + ' '.repeat(Math.max(0, widths[i] - [...cell].length))).join('  ');
  console.log(line(headers));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) console.log(line(row));
}

function printResource(resource: DavResource): string {
  const type = resource.isCollection ? 'd' : 'f';
  const size = resource.isCollection ? '-' : formatBytes(resource.size);
  return `${type}  ${size.padStart(9)}  ${formatDate(resource.lastModified).padEnd(19)}  ${resource.etag ?? '-'.padEnd(8)}  ${resource.name}${resource.isCollection ? '/' : ''}`;
}

async function readStdin(): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Uint8Array);
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const all = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return all;
}

function exitCodeFor(error: unknown): number {
  if (!isDavError(error)) return 1;
  switch (error.code) {
    case 'UNAUTHORIZED':
    case 'FORBIDDEN':
      return 3;
    case 'NOT_FOUND':
      return 4;
    case 'NETWORK':
    case 'TIMEOUT':
    case 'TLS':
      return 5;
    case 'INVALID_URL':
    case 'INVALID_PATH':
      return 2;
    default:
      return 6;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const asJson = Boolean(args.flags.json);
  const command = args.command ?? (args.flags.version ? 'version' : 'help');

  if (args.flags.help || command === 'help') {
    process.stdout.write(usage());
    return;
  }
  if (command === 'version' || args.flags.version) {
    console.log(VERSION);
    return;
  }
  if (command === 'providers') {
    printProviders(asJson);
    return;
  }
  if (command === 'detect') {
    const url = args.positional[0] ?? stringFlag(args.flags, 'url') ?? env('WEBDAV_URL');
    if (!url) {
      console.error('detect 需要 URL，例如: anydav detect https://dav.jianguoyun.com/dav/');
      process.exitCode = 2;
      return;
    }
    const match = detectProvider(url);
    if (asJson) printJson(match);
    else console.log(`${match.provider.id} (${match.provider.nameZh || match.provider.name}) confidence=${match.confidence} reason=${match.reason}`);
    return;
  }
  if (command === 'test') {
    const client = clientFromFlags(args.flags);
    const info = await client.testConnection();
    let writeTest: { ok: boolean; path?: string; error?: string } | undefined;
    if (args.flags.write) {
      const path = `/.anydav-write-test-${Date.now()}.txt`;
      try {
        await client.writeFile(path, 'anydav write test', {
          contentType: 'text/plain; charset=utf-8',
          createParents: false,
        });
        await client.remove(path);
        writeTest = { ok: true, path };
      } catch (error) {
        writeTest = {
          ok: false,
          path,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    if (asJson) printJson({ ...info, writeTest });
    else {
      console.log(`OK  provider=${info.provider.id}  base=${info.baseUrl}`);
      console.log(`    latency=${info.latencyMs}ms  status=${info.status}  auth=${info.authScheme}  dav=${(info.dav ?? []).join(',') || '-'}`);
      if (writeTest) {
        console.log(writeTest.ok ? `    写入测试: OK (${writeTest.path})` : `    写入测试: 失败 — ${writeTest.error}`);
      }
    }
    return;
  }

  const client = clientFromFlags(args.flags);
  switch (command) {
    case 'ls': {
      const path = args.positional[0] ?? '/';
      const resources = await client.list(path);
      if (asJson) printJson(resources);
      else {
        if (resources.length === 0) console.log('(空目录)');
        for (const resource of resources) console.log(printResource(resource));
      }
      break;
    }
    case 'stat': {
      const path = args.positional[0];
      if (!path) throw new DavError({ code: 'INVALID_PATH', message: 'stat 需要路径' });
      const resource = await client.stat(path);
      if (!resource) {
        if (asJson) printJson(null);
        else console.log('不存在');
        process.exitCode = 4;
        break;
      }
      if (asJson) printJson(resource);
      else {
        console.log(`path:        ${resource.path}`);
        console.log(`type:        ${resource.isCollection ? 'collection' : 'file'}`);
        console.log(`size:        ${formatBytes(resource.size)}`);
        console.log(`modified:    ${formatDate(resource.lastModified)}`);
        console.log(`etag:        ${resource.etag ?? '-'}`);
        console.log(`contentType: ${resource.contentType ?? '-'}`);
      }
      break;
    }
    case 'cat': {
      const path = args.positional[0];
      if (!path) throw new DavError({ code: 'INVALID_PATH', message: 'cat 需要路径' });
      const result = await client.readText(path);
      process.stdout.write(result.text);
      break;
    }
    case 'get': {
      const remote = args.positional[0];
      const local = args.positional[1];
      if (!remote) throw new DavError({ code: 'INVALID_PATH', message: 'get 需要远端路径' });
      const result = await client.readFile(remote);
      if (local && local !== '-') {
        writeFileSync(resolve(local), result.data);
        if (!asJson) console.log(`已保存 ${formatBytes(result.data.length)} 到 ${resolve(local)}`);
        else printJson({ path: remote, local: resolve(local), bytes: result.data.length, etag: result.etag });
      } else if (asJson) {
        printJson({
          path: remote,
          bytes: result.data.length,
          etag: result.etag,
          base64: Buffer.from(result.data).toString('base64'),
        });
      } else {
        process.stdout.write(Buffer.from(result.data));
      }
      break;
    }
    case 'put': {
      const local = args.positional[0];
      const remote = args.positional[1];
      if (!local || !remote) {
        throw new DavError({ code: 'INVALID_PATH', message: 'put 需要 <local|-> <remote>' });
      }
      const data = local === '-' ? await readStdin() : readFileSync(resolve(local));
      const result = await client.writeFile(remote, data);
      if (asJson) printJson({ ...result, bytes: data.length });
      else console.log(`已上传 ${formatBytes(data.length)} → ${remote}${result.etag ? ` (etag ${result.etag})` : ''}`);
      break;
    }
    case 'mkdir': {
      const path = args.positional[0];
      if (!path) throw new DavError({ code: 'INVALID_PATH', message: 'mkdir 需要路径' });
      await client.mkdir(path, { recursive: true });
      if (!asJson) console.log(`已创建 ${path}`);
      else printJson({ ok: true, path });
      break;
    }
    case 'rm': {
      const path = args.positional[0];
      if (!path) throw new DavError({ code: 'INVALID_PATH', message: 'rm 需要路径' });
      await client.remove(path);
      if (!asJson) console.log(`已删除 ${path}`);
      else printJson({ ok: true, path });
      break;
    }
    case 'mv':
    case 'cp': {
      const from = args.positional[0];
      const to = args.positional[1];
      if (!from || !to) throw new DavError({ code: 'INVALID_PATH', message: `${command} 需要 <from> <to>` });
      const result = command === 'mv' ? await client.move(from, to) : await client.copy(from, to);
      if (!asJson) console.log(`已${command === 'mv' ? '移动' : '复制'} ${from} → ${to}`);
      else printJson({ ok: true, ...result });
      break;
    }
    case 'quota': {
      const path = args.positional[0] ?? '/';
      const quota = await client.getQuota(path);
      if (asJson) printJson(quota);
      else if (!quota) console.log('该服务未返回配额信息');
      else {
        console.log(`已用:   ${formatBytes(quota.usedBytes)}`);
        console.log(`可用:   ${formatBytes(quota.availableBytes)}`);
        console.log(`总计:   ${formatBytes(quota.totalBytes)}`);
      }
      break;
    }
    default:
      console.error(`未知命令: ${command}\n`);
      process.stderr.write(usage());
      process.exitCode = 2;
  }
}

main().catch((error) => {
  process.exitCode = exitCodeFor(error);
  if (isDavError(error)) {
    console.error(`错误 [${error.code}]${error.status ? ` HTTP ${error.status}` : ''}: ${error.message}`);
    if (error.hint) console.error(`提示: ${error.hint}`);
    if (error.providerId) console.error(`服务商: ${error.providerId}`);
  } else {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  }
});

export { main };
