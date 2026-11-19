# anydav

聚合式 WebDAV 客户端（Dart / Flutter）。与仓库根目录的 TypeScript 实现共用同一份
`spec/providers.json`，内置 31 个服务商预设：坚果云、Nextcloud、ownCloud、群晖、
威联通、TrueNAS、AList、Seafile、InfiniCLOUD、pCloud、Koofr、mailbox.org、
Yandex Disk、PikPak、飞牛、极空间、rclone 等。

源码与文档：https://github.com/Reign9201/anydav

## 安装

首次发布到 pub.dev 之前，使用 Git 依赖：

```yaml
dependencies:
  anydav:
    git:
      url: https://github.com/Reign9201/anydav.git
      path: dart
```

发布到 pub.dev 后：

```yaml
dependencies:
  anydav: ^0.1.0
```

本地开发时也可以使用路径依赖：

```yaml
dependencies:
  anydav:
    path: ../anydav/dart
```

## 使用

```dart
final client = WebDavClient(
  provider: 'jianguoyun', // 可省略，按 URL 自动识别
  baseUrl: 'https://dav.jianguoyun.com/dav/',
  username: 'me@example.com',
  password: appPassword,
);

await client.mkdir('/myapp', recursive: true);
await client.writeJson('/myapp/state.json', {'hello': '世界'});
final state = await client.readJson('/myapp/state.json');
```

错误统一为 `DavError`，`error.code` 用于分支，`error.hint` 是服务商专属的中文提示。

多端同步使用 `JsonSyncEngine`：每台设备只写自己的 `<deviceId>.json`，按 ETag 增量下载，
合并逻辑由应用提供。完整说明见仓库根目录的 `README.md`、`docs/integration.md` 和
`docs/sync-recipes.md`。

## 能力与限制

- 支持 OPTIONS / PROPFIND / MKCOL / GET / HEAD / PUT / DELETE / MOVE / COPY。
- 自动处理中文/空格路径编码、任意命名空间前缀的 multistatus、反向代理 href、条件读写、Range 和配额。
- 响应会完整读入内存，适合配置和 JSON 小文件；暂不支持 Nextcloud 分块上传。
- 浏览器环境仍受 CORS 限制，需要同源代理（示例见仓库 `examples/node-proxy.mjs`）。

License: MIT
