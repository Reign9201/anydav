#!/usr/bin/env node
// Generates the TypeScript and Dart provider tables plus the provider docs
// from spec/providers.json. Run: node scripts/generate.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const specPath = resolve(root, 'spec/providers.json');
const spec = JSON.parse(readFileSync(specPath, 'utf8'));

function fail(message) {
  console.error(`generate: ${message}`);
  process.exit(1);
}

if (spec.schemaVersion !== 1) fail(`unsupported schemaVersion ${spec.schemaVersion}`);
if (!Array.isArray(spec.providers) || spec.providers.length === 0) fail('providers must be a non-empty array');

const ids = new Set();
const required = ['id', 'name', 'category', 'auth', 'capabilities', 'verification'];
const categories = new Set(['consumer', 'nas', 'self-hosted', 'gateway', 'generic']);
const verifications = new Set(['live', 'documented', 'unverified']);
for (const p of spec.providers) {
  for (const key of required) {
    if (p[key] === undefined || p[key] === null) fail(`${p.id ?? '<unknown>'}: missing ${key}`);
  }
  if (ids.has(p.id)) fail(`duplicate provider id: ${p.id}`);
  ids.add(p.id);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(p.id)) fail(`invalid id: ${p.id}`);
  if (!categories.has(p.category)) fail(`${p.id}: invalid category ${p.category}`);
  if (!verifications.has(p.verification)) fail(`${p.id}: invalid verification ${p.verification}`);
  if (!p.auth.scheme || !p.auth.passwordKind) fail(`${p.id}: auth.scheme/passwordKind required`);
  for (const key of Object.keys(p.capabilities)) {
    const v = p.capabilities[key];
    if (v !== null && typeof v !== 'boolean' && v !== 'nextcloud') {
      fail(`${p.id}: unsupported capability value ${key}=${v}`);
    }
  }
  const detect = p.detect ?? {};
  for (const [key, value] of Object.entries(detect)) {
    if (!Array.isArray(value)) fail(`${p.id}: detect.${key} must be an array`);
  }
}

const json = JSON.stringify(spec, null, 2) + '\n';
writeFileSync(resolve(root, 'src/providers.generated.ts'), `// AUTO-GENERATED from spec/providers.json. Do not edit by hand.
// Regenerate with: node scripts/generate.mjs
import type { ProviderSpecFile } from './types.js';

export const PROVIDER_SPEC: ProviderSpecFile = ${JSON.stringify(spec, null, 2)};
`, 'utf8');

const dartLiteral = JSON.stringify(spec, null, 2);
if (dartLiteral.includes("'''")) fail("provider spec must not contain '''");
writeFileSync(resolve(root, 'dart/lib/src/providers.generated.dart'), `// AUTO-GENERATED from spec/providers.json. Do not edit by hand.
// Regenerate with: node scripts/generate.mjs

/// The canonical provider registry, embedded as JSON so the Dart package has
/// no asset-loading dependency and stays identical to the TypeScript SDK.
const String providerSpecJson = r'''
${json}''';
`, 'utf8');

const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const lines = [
  '# WebDAV provider matrix',
  '',
  'Generated from `spec/providers.json`. Do not edit by hand; run `node scripts/generate.mjs`.',
  '',
  '| ID | 名称 | 类别 | 默认地址 / 模板 | 认证 | 密码类型 | 验证 | 备注 |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
];
for (const p of spec.providers) {
  const url = p.baseUrl || p.urlTemplate || (p.urlHints?.[0] ?? '');
  const auth = `${p.auth.scheme}${p.auth.passwordKind ? ` / ${p.auth.passwordKind}` : ''}`;
  const noteCandidate = p.notesZh?.[0] ?? p.auth.noteZh ?? p.urlHints?.[0] ?? '';
  const note = noteCandidate === url ? '' : noteCandidate.slice(0, 120);
  lines.push(`| \`${p.id}\` | ${esc(p.nameZh || p.name)} | ${p.category} | ${esc(url)} | ${esc(auth)} | ${esc(p.auth.passwordKind)} | ${p.verification} | ${esc(note)} |`);
}
lines.push(
  '',
  'Verification: `live` = endpoint was probed live and answered with a WebDAV/Basic challenge;',
  '`documented` = endpoint/auth taken from official documentation; `unverified` = community knowledge,',
  'confirm in the provider app before relying on it.',
  '',
);
writeFileSync(resolve(root, 'docs/providers.md'), lines.join('\n'), 'utf8');

console.log(`generate: wrote ${spec.providers.length} providers (${[...ids].join(', ')})`);
