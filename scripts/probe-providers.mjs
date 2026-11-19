#!/usr/bin/env node
// Unauthenticated endpoint probe for providers with a fixed baseUrl.
// Read-only: sends OPTIONS and reports status / DAV / auth scheme.
//
//   node scripts/probe-providers.mjs [--json]
//
// Templates such as Nextcloud and Hetzner are skipped because they need a
// per-user host or username. This script intentionally requires no credentials
// and never writes anything to a remote server.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(readFileSync(resolve(root, 'spec/providers.json'), 'utf8'));
const asJson = process.argv.includes('--json');
const timeoutMs = 8000;

const targets = spec.providers.filter((provider) => typeof provider.baseUrl === 'string' && provider.baseUrl);
const skipped = spec.providers
  .filter((provider) => !provider.baseUrl)
  .map((provider) => provider.id);

const results = await Promise.all(
  targets.map(async (provider) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const response = await fetch(provider.baseUrl, {
        method: 'OPTIONS',
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'user-agent': 'anydav-probe/0.1' },
      });
      const authenticate = response.headers.get('www-authenticate') ?? '';
      const dav = response.headers.get('dav') ?? '';
      return {
        id: provider.id,
        status: response.status,
        auth: /Basic/i.test(authenticate) ? 'Basic' : /Digest/i.test(authenticate) ? 'Digest' : '-',
        dav: dav || '-',
        ms: Date.now() - started,
      };
    } catch (error) {
      return {
        id: provider.id,
        status: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'error',
        auth: '-',
        dav: '-',
        ms: Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
    }
  }),
);

if (asJson) {
  console.log(JSON.stringify({ results, skipped }, null, 2));
} else {
  const headers = ['id', 'status', 'auth', 'dav', 'ms'];
  const rows = results.map((result) => headers.map((header) => String(result[header])));
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );
  const line = (cells) =>
    cells.map((cell, index) => cell.padEnd(widths[index])).join('  ');
  console.log(line(headers));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) console.log(line(row));
  console.log(`\nprobed ${results.length}; skipped templates: ${skipped.join(', ')}`);
  console.log('A 401 with Basic/Digest means the endpoint exists and speaks WebDAV.');
}
