# How anydav compares

This page is a factual map of the ecosystem, not a ranking. Stars and download
numbers change; the numbers below were checked on **2026-11-19**. If a project
here is misrepresented, please open an issue with the correction.

## One-line positioning

- **anydav** is a *provider-aware WebDAV SDK*: it knows how 31 services differ
  in endpoints, app-password rules, limits and status codes, and ships that
  knowledge to TypeScript and Dart from one registry.
- The projects below are excellent at **transport**, **unified storage** or
  **running a gateway**. Most do not try to be a WebDAV provider registry.

## Comparison

| Project | Language | License | Approx. stars | Provider presets | WebDAV provider quirks/limits | Sync engine | CLI |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| **anydav** | TypeScript + Dart | MIT | new | **31** | **Yes** (auth type, limits, status-code quirks, hints) | Yes (per-device JSON, ETag, If-Match) | Yes |
| [perry-mitchell/webdav-client](https://github.com/perry-mitchell/webdav-client) (`webdav`) | TypeScript | MIT | 818 | No | No | No | No |
| [natelindev/tsdav](https://github.com/natelindev/tsdav) | TypeScript | MIT | 362 | No | No | No | No |
| [flymzero/webdav_client](https://github.com/flymzero/webdav_client) | Dart | BSD-3-Clause | 67 | No | No | No | No |
| [lookfirst/sardine](https://github.com/lookfirst/sardine) | Java | see repo | 622 | No | No | No | No |
| [studio-b12/gowebdav](https://github.com/studio-b12/gowebdav) | Go | BSD-3-Clause | 374 | No | No | No | Yes |
| [farfarfun-drive/fundrive](https://github.com/farfarfun-drive/fundrive) | Python | MIT | 78 | 20+ storage drivers | Generic WebDAV driver; not 31 service-specific presets | No | No |
| [Ajayvarmaramineni/BYOC](https://github.com/Ajayvarmaramineni/BYOC) | TypeScript + Python | Apache-2.0 | 39 | A few (Nextcloud, Synology, WebDAV, S3, Google Drive) | Some provider differences; focus on direct upload | No | No |
| [rclone/rclone](https://github.com/rclone/rclone) | Go | MIT | 61k | 70+ backends | Gateway/runtime, not an app SDK | Yes (daemon/CLI) | Yes |
| [alistgo/alist](https://github.com/alistgo/alist) | Go | AGPL-3.0 | 50k | 40+ Chinese/international storages | Server-side gateway | No | Yes |

Download context: the npm `webdav` package had about **1.07 million downloads in
the last 30 days** at the same date; the Dart `webdav_client` package had about
**22,660 downloads in 30 days** and 63 pub.dev likes. Both are mature transport
clients and remain good choices if you only need raw WebDAV verbs.

## What anydav is not

- **Not a replacement for `webdav`, `tsdav` or `webdav_client` at the protocol
  level.** It handles the same core verbs, but its reason to exist is the layer
  above: provider registry, URL/auth/limit quirks, unified errors and sync.
- **Not a cloud-storage abstraction for every backend.** `fundrive` and BYOC
  cover Google Drive, S3, Baidu, Aliyun, etc.; anydav is deliberately
  WebDAV-focused and treats non-WebDAV clouds through AList/rclone.
- **Not a sync daemon or mount tool.** rclone and AList are better if you want
  a process, mount or server. anydav is an embeddable library for apps.

## Where it fits

```
your app
   │  provider presets / unified errors / sync engine
   ▼
anydav  ──►  standard WebDAV transport (built in)
   │
   ├─ Nutstore / Nextcloud / Synology / AList / pCloud / ...
   └─ AList / rclone gateways for non-WebDAV clouds
```

If you are building a local-first note, todo, bookmark, password or reading app
and want one WebDAV integration that survives a provider change, anydav is aimed
at you.
