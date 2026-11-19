# anydav

[![CI](https://github.com/Reign9201/anydav/actions/workflows/ci.yml/badge.svg)](https://github.com/Reign9201/anydav/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/anydav.svg)](https://www.npmjs.com/package/anydav)
[![GitHub release](https://img.shields.io/github/v/release/Reign9201/anydav.svg)](https://github.com/Reign9201/anydav/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Provider-aware WebDAV SDK for TypeScript and Dart.** One API for 31 WebDAV services, with the endpoint, app-password, limit and status-code quirks already handled.

> **anydav is not another low-level WebDAV client.** It is the aggregation layer above `webdav`, `tsdav` or `webdav_client`: keep your transport knowledge, but stop re-learning every provider's base path, password rules and rate limits in every app.

[简体中文](README.zh-CN.md) | English

---

## Why

Moving an app from Nutstore/Jianguoyun to Nextcloud, Synology, AList or pCloud is rarely a one-line URL change:

- **Different base paths** — Nextcloud needs `/remote.php/dav/files/<user>/`, Seafile uses `/seafdav/`, AList uses `/dav/`.
- **Different credentials** — Jianguoyun, InfiniCLOUD, Koofr and mailbox.org require an **app password / WebDAV password**, not the login password.
- **Different status codes** — `MKCOL` on an existing collection may return `405`, `409` or `301`.
- **Different limits** — Jianguoyun Free allows 600 requests per 30 minutes, 500 MB per upload, and at most 750 entries per PROPFIND.
- **Different XML/href shapes** — namespace prefixes, URL-encoded names, reverse-proxy prefixes.

`anydav` keeps this knowledge in one machine-readable registry, `spec/providers.json`, and applies it on top of a standard WebDAV transport.

## Features

- **31 provider presets** — Nutstore, Nextcloud, ownCloud, Synology, QNAP, TrueNAS, AList, Seafile, InfiniCLOUD, pCloud, Koofr, Icedrive, OpenDrive, 4shared, CloudMe, IONOS HiDrive, STRATO HiDrive, MagentaCLOUD, GMX, WEB.DE, mailbox.org, Hetzner Storage Box, luckycloud, Infomaniak kDrive, Yandex Disk, Mail.ru, PikPak, fnOS, Zspace, rclone, generic WebDAV.
- **Automatic provider detection** — host, path prefix and port scoring; explicit override when needed.
- **Unified error model** — `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PRECONDITION_FAILED`, `RATE_LIMITED`, `INSUFFICIENT_STORAGE`, `NETWORK`, `TIMEOUT`, `TLS`, `PARSE`, with provider-specific hints.
- **Protocol details handled** — namespace-agnostic multistatus, Chinese/space/literal-percent paths, reverse-proxy hrefs, weak ETags, conditional reads/writes, byte ranges, recursive MKCOL, MOVE/COPY destinations.
- **Retries with backoff** — idempotent requests retry 429/502/503/504 and honor `Retry-After`; a Jianguoyun 403 rate limit is not blindly retried.
- **Optional multi-device JSON sync** — one file per device, ETag-based incremental download, conditional `If-Match` writes, stable fingerprints; merge semantics stay in your app.
- **Two first-class implementations** — TypeScript (zero runtime deps) and Dart/Flutter, sharing the same provider registry.
- **CLI** — `providers`, `detect`, `test --write`, `ls`, `get`, `put`, `mkdir`, `rm`, `mv`, `cp`, `quota`.

## Install

### TypeScript / JavaScript

```bash
npm install anydav
```

GitHub fallback:

```bash
npm install github:Reign9201/anydav
# or the v0.1.0 release tarball
npm install https://github.com/Reign9201/anydav/releases/download/v0.1.0/anydav-0.1.0.tgz
```

Node 18+, browsers, Electron, React Native, Deno and Bun.

### Dart / Flutter

Until the first pub.dev release, use the Git dependency:

```yaml
dependencies:
  anydav:
    git:
      url: https://github.com/Reign9201/anydav.git
      path: dart
```

Once published to pub.dev:

```yaml
dependencies:
  anydav: ^0.1.0
```

## Quick start

### TypeScript

```ts
import { createWebDavClient, isDavError } from 'anydav';

const client = createWebDavClient({
  provider: 'jianguoyun', // optional: detected from baseUrl
  baseUrl: 'https://dav.jianguoyun.com/dav/',
  username: 'me@example.com',
  password: process.env.WEBDAV_PASSWORD!, // Nutstore app password
});

try {
  await client.testConnection();
  await client.mkdir('/myapp', { recursive: true });
  await client.writeJson('/myapp/state.json', { hello: '世界' });

  const files = await client.list('/myapp');
  const { value } = await client.readJson<{ hello: string }>('/myapp/state.json');
  console.log(files.map((file) => file.name), value?.hello);
} catch (error) {
  if (isDavError(error)) console.error(error.code, error.status, error.hint);
  else throw error;
}
```

### Dart / Flutter

```dart
import 'package:anydav/anydav.dart';

final client = WebDavClient(
  provider: 'nextcloud',
  baseUrl: 'https://cloud.example.com/remote.php/dav/files/alice/',
  username: 'alice',
  password: appPassword,
);

await client.mkdir('/myapp', recursive: true);
await client.writeJson('/myapp/state.json', {'hello': '世界'});
final state = await client.readJson('/myapp/state.json');
```

## Multi-device JSON sync

Every device writes only its own `<deviceId>.json`; the engine lists the folder, downloads files whose ETag changed, calls your merge function, and conditionally uploads the merged state when its fingerprint changed.

```ts
import { createJsonSync, MemorySyncCache } from 'anydav/sync';

const sync = createJsonSync<{ items: Record<string, { value: string; at: number }> }>({
  client,
  folder: '/myapp',
  deviceId: 'phone-a1b2',
  cache: new MemorySyncCache(),
  merge: ({ local, remotes }) => {
    const items = { ...(local?.items ?? {}) };
    for (const remote of remotes) {
      for (const [key, item] of Object.entries(remote.state.items ?? {})) {
        if (!items[key] || item.at > items[key].at) items[key] = item;
      }
    }
    return { items };
  },
});

const result = await sync.sync(localState);
```

See [docs/sync-recipes.md](docs/sync-recipes.md) for tombstones, cached fingerprints and failure handling.

## CLI

```bash
anydav providers
anydav detect https://cloud.example.com/remote.php/dav/files/alice/

WEBDAV_URL=https://dav.jianguoyun.com/dav/ \
WEBDAV_USER=me@example.com \
WEBDAV_PASSWORD=app-password \
anydav test --provider jianguoyun --write

anydav ls /myapp
anydav put ./state.json /myapp/state.json
anydav quota
```

Exit codes: `0` OK, `2` usage, `3` auth/permission, `4` not found, `5` network/timeout/TLS, `6` other server errors.

## Supported providers

The full matrix (endpoint, auth, password kind, verification status, notes) is in **[docs/providers.md](docs/providers.md)**. The machine-readable registry is **[spec/providers.json](spec/providers.json)**; the latest endpoint probe snapshot is **[docs/verification.md](docs/verification.md)**.

| Category | Examples |
| --- | --- |
| Chinese cloud | Nutstore (Jianguoyun), PikPak, AList (bridges Aliyun Drive, Baidu Netdisk, Quark, ...) |
| International | InfiniCLOUD, pCloud, Koofr, Icedrive, OpenDrive, 4shared, CloudMe, Yandex Disk, Mail.ru |
| European/privacy | IONOS HiDrive, STRATO HiDrive, MagentaCLOUD, GMX, WEB.DE, mailbox.org, Hetzner, luckycloud, Infomaniak kDrive |
| Self-hosted/NAS | Nextcloud, ownCloud, Seafile, Synology DSM, QNAP QTS, TrueNAS, fnOS, Zspace |
| Gateways | AList, rclone |

Verification levels: `live` (endpoint probed and answered with a WebDAV/Basic challenge), `documented` (official docs), `unverified` (community knowledge; confirm in the provider app).

Providers without native WebDAV (Baidu Netdisk, Aliyun Drive, Quark, OneDrive, Google Drive, Dropbox, MEGA) are best used through AList or rclone; the `alist` and `rclone` presets cover that.

## Browser and CORS

Most WebDAV servers do not send CORS headers. Browser apps need a same-origin proxy. Run **[examples/node-proxy.mjs](examples/node-proxy.mjs)** and point the client at `/api/dav/`; the SDK detects the upstream root from the PROPFIND self entry, and the proxy rewrites `Destination` headers.

Read **[docs/integration.md](docs/integration.md)** before deploying a proxy: fixed upstream, method allowlist, path traversal checks, proxy authentication, and never let the client choose the target host.

## Comparison

See **[docs/comparison.md](docs/comparison.md)** for a factual comparison with `webdav` (perry-mitchell), `tsdav`, Dart `webdav_client`, `fundrive`, BYOC, rclone and AList.

Short version:

- `webdav` / `tsdav` / `webdav_client` are **transport clients**. anydav is the provider layer above them.
- `fundrive` / BYOC are **unified storage frameworks**. anydav goes deeper on WebDAV-specific provider quirks and ships TS + Dart from one registry.
- `rclone` / AList are **gateways/servers**, not embeddable app SDKs.

## Security

- Use an **app password**, never the primary account password.
- Use HTTPS. Basic auth is only Base64, not encryption.
- Credentials must not be embedded in URLs; the SDK rejects `https://user:pass@host/`.
- The SDK does not encrypt sync payloads. Encrypt sensitive data in your app before `writeFile` / `writeJson`.
- Proxy deployments must authenticate callers and pin the upstream account. The example is a development starting point, not a hardened gateway.
- Report vulnerabilities via GitHub's private security advisory. See [SECURITY.md](SECURITY.md).

## Repository layout

```
spec/providers.json        # single source of truth for provider presets
scripts/generate.mjs       # generates TS/Dart tables and docs/providers.md
src/                       # TypeScript implementation and CLI
test/                      # node:test + in-memory WebDAV server + proxy E2E
dart/                      # Dart/Flutter implementation (same API semantics)
docs/                      # provider matrix, integration, sync recipes, comparison
examples/                  # browser proxy example
```

## Development

```bash
# TypeScript
npm install
npm run build
npm test                    # 67 tests, including CLI and proxy integration

# Dart
cd dart
dart pub get
dart analyze
dart test                   # 59 tests
```

Provider changes: edit `spec/providers.json`, run `node scripts/generate.mjs`, then run both test suites. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

- Stream downloads and Nextcloud chunked uploads.
- Kotlin (Android/JVM) and Swift (Apple) ports using the same `spec/providers.json` and conformance cases.
- A Python port for server-side scripts.
- Online provider verification workflow and more NAS presets.

## License and trademarks

MIT. See [LICENSE](LICENSE).

All product names, logos and brands are property of their respective owners. anydav is not affiliated with, endorsed by, or sponsored by any cloud provider listed in this repository. Provider facts are maintained in `spec/providers.json`; corrections are welcome.
