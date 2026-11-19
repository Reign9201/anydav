# anydav

[English](README.md) | 简体中文

聚合式 WebDAV SDK。把「坚果云、Nextcloud、群晖、AList、InfiniCLOUD、pCloud、Koofr……」这些服务商在地址、认证、限制和怪癖上的差异收进一份 Provider 注册表，对上层暴露一套统一的文件操作 API。

适用于「应用数据同步」这类场景：配置、收藏、进度、笔记、密码库快照等 JSON/小文件的多端同步。不是网盘客户端，不追求大文件分块上传、断点续传或媒体流式播放。

目前提供两个一等公民实现，共用同一份 Provider 注册表：

- **TypeScript / JavaScript**（Node 18+、浏览器、Electron、React Native、Deno、Bun）
- **Dart / Flutter**（Android、iOS、macOS、Windows、Linux、Web）

---

## 为什么需要它

现有项目里的 WebDAV 代码通常只按坚果云写死：`MKCOL`、`PROPFIND`、`GET`、`PUT` 四种请求 + Basic 认证 + `bilistudy/` 之类的固定目录。一旦用户换成 Nextcloud、群晖或者 AList，就会撞上这些问题：

- 地址前缀不同：Nextcloud 必须带 `/remote.php/dav/files/用户名/`，Seafile 是 `/seafdav/`，AList 是 `/dav/`。
- 认证方式不同：坚果云、InfiniCLOUD、Koofr、mailbox.org 要「应用密码 / WebDAV 密码」，不是登录密码。
- 状态码含义不同：`MKCOL` 遇到已存在的目录，有的返回 `405`，有的返回 `409`，有的返回 `301`。
- 限额不同：坚果云免费账户 600 次请求/30 分钟、单文件 500MB、单次 PROPFIND 最多 750 条。
- PROPFIND 的 XML 前缀、href 编码、配额字段各写各的。

`anydav` 把这些知识集中到 `spec/providers.json`，客户端自动识别服务商、套用正确的认证提示和错误话术，并把统一错误码暴露给 UI。

---

## 特性

- **31 个内置 Provider 预设**：坚果云、Nextcloud、ownCloud、群晖、威联通、TrueNAS、AList、Seafile、InfiniCLOUD、pCloud、Koofr、Icedrive、OpenDrive、4shared、CloudMe、IONOS HiDrive、STRATO HiDrive、MagentaCLOUD、GMX、WEB.DE、mailbox.org、Hetzner Storage Box、luckycloud、Infomaniak kDrive、Yandex Disk、Mail.ru、PikPak、飞牛 fnOS、极空间、rclone、通用 WebDAV。
- **自动识别服务商**：按域名、路径前缀、端口打分；也可以显式指定。
- **统一错误模型**：`UNAUTHORIZED / FORBIDDEN / NOT_FOUND / CONFLICT / PRECONDITION_FAILED / RATE_LIMITED / INSUFFICIENT_STORAGE / NETWORK / TIMEOUT / TLS / PARSE` 等，附带服务商专属提示。
- **协议细节已处理**：任意命名空间前缀的 multistatus、百分号编码的中文/空格路径、反向代理前缀、弱 ETag、条件读写（`If-Match` / `If-None-Match`）、Range 读取、递归建目录、MOVE/COPY 的 `Destination` 头。
- **重试与退避**：对幂等请求重试 429/502/503/504，尊重 `Retry-After`；坚果云 403 限流不会被盲目重试。
- **可选多端 JSON 同步引擎**：每台设备只写自己的 `<deviceId>.json`，按 ETag 增量下载，合并逻辑由应用提供。
- **零运行时依赖**（TS 端）；Dart 端只依赖 `http`、`xml`、`crypto`、`unorm_dart`。
- **命令行工具**：`anydav providers / detect / test / ls / get / put / mkdir / rm / mv / cp / quota`，用来验证账号和排查问题。

---

## 快速开始（TypeScript / Node）

```bash
# 本仓库内开发：
npm install && npm run build

# 其他本地项目用路径安装（发布到 npm 后可改成包名）：
npm install ../anydav
```

```ts
import { createWebDavClient, isDavError } from 'anydav';

const client = createWebDavClient({
  provider: 'jianguoyun',             // 可省略，SDK 会按 URL 自动识别
  baseUrl: 'https://dav.jianguoyun.com/dav/',
  username: 'me@example.com',
  password: process.env.WEBDAV_PASSWORD!, // 坚果云的第三方应用密码
});

try {
  const info = await client.testConnection();
  console.log(info.provider.id, info.dav, `${info.latencyMs}ms`);

  await client.mkdir('/myapp', { recursive: true });
  await client.writeJson('/myapp/state.json', { hello: '世界' });

  const list = await client.list('/myapp');
  console.log(list.map((file) => `${file.name} ${file.etag}`));

  const { value } = await client.readJson<{ hello: string }>('/myapp/state.json');
  console.log(value?.hello);
} catch (error) {
  if (isDavError(error)) {
    console.error(error.code, error.status, error.hint);
  } else {
    throw error;
  }
}
```

Nextcloud 只需要换 URL 和 provider：

```ts
const client = createWebDavClient({
  provider: 'nextcloud',
  baseUrl: 'https://cloud.example.com/remote.php/dav/files/alice/',
  username: 'alice',
  password: 'app-password',
});
```

### 多端 JSON 同步

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
console.log(result.uploaded, result.downloaded, result.devices);
```

同步引擎只负责传输、ETag 缓存、指纹和条件写入；冲突合并、删除墓碑、加密快照仍然由应用决定（参考 `docs/sync-recipes.md`）。

---

## 快速开始（Dart / Flutter）

在应用的 `pubspec.yaml` 里用路径依赖接入本仓库（后续可发布到私有 pub）：

```yaml
dependencies:
  anydav:
    path: ../anydav/dart
```

```dart
import 'package:anydav/anydav.dart';

final client = WebDavClient(
  provider: 'jianguoyun',
  baseUrl: 'https://dav.jianguoyun.com/dav/',
  username: 'me@example.com',
  password: appPassword,
);

try {
  final info = await client.testConnection();
  debugPrint('${info.provider.id} ${info.dav} ${info.latencyMs}ms');

  await client.mkdir('/myapp', recursive: true);
  await client.writeJson('/myapp/state.json', {'hello': '世界'});

  final files = await client.list('/myapp');
  final state = await client.readJson('/myapp/state.json');
  debugPrint('${files.length} files, hello=${state.value?['hello']}');
} on DavError catch (error) {
  debugPrint('${error.code} ${error.status} ${error.hint}');
}
```

Dart 端的 `JsonSyncEngine` 与 TS 端语义一致：

```dart
final engine = JsonSyncEngine<Map<String, dynamic>>(
  JsonSyncOptions(
    client: client,
    folder: '/myapp',
    deviceId: 'phone-a1b2',
    merge: (context) {
      final items = <String, dynamic>{
        ...(context.local?['items'] as Map<String, dynamic>? ?? {}),
      };
      for (final remote in context.remotes) {
        final remoteItems = remote.state['items'] as Map<String, dynamic>? ?? {};
        for (final entry in remoteItems.entries) {
          final current = items[entry.key] as Map<String, dynamic>?;
          if (current == null || (entry.value as Map)['at'] > current['at']) {
            items[entry.key] = entry.value;
          }
        }
      }
      return {'items': items};
    },
  ),
);

final result = await engine.sync(localState);
```

> Dart 的默认序列化使用 `jsonEncode` / `jsonDecode`，适合 `Map`、`List` 和基础类型。自定义模型请传 `encode` / `decode`（或实现 `toJson()` 并自行 `fromJson`）。

---

## 命令行

```bash
# 查看所有 Provider
npx anydav providers

# 自动识别
npx anydav detect https://cloud.example.com/remote.php/dav/files/alice/

# 验证连接（--write 会实际写入再删除一个临时文件）
WEBDAV_URL=https://dav.jianguoyun.com/dav/ \
WEBDAV_USER=me@example.com \
WEBDAV_PASSWORD=app-password \
npx anydav test --provider jianguoyun --write

# 列目录 / 上传 / 下载 / 配额
npx anydav ls /myapp
npx anydav put ./state.json /myapp/state.json
npx anydav get /myapp/state.json ./state.json
npx anydav quota
```

退出码：`0` 成功、`2` 参数错误、`3` 认证/权限、`4` 不存在、`5` 网络/超时/TLS、`6` 其他服务端错误。

---

## Provider 支持

完整矩阵（地址、认证、密码类型、验证状态、备注）见 **[docs/providers.md](docs/providers.md)**，机器可读的注册表见 **[spec/providers.json](spec/providers.json)**，最近一次端点探测记录见 **[docs/verification.md](docs/verification.md)**，与同类项目的对比见 **[docs/comparison.md](docs/comparison.md)**。

| 类别 | 代表服务 |
| --- | --- |
| 国内网盘 | 坚果云、PikPak、AList（可聚合阿里云盘/百度网盘/夸克等） |
| 国际网盘 | InfiniCLOUD、pCloud、Koofr、Icedrive、OpenDrive、4shared、CloudMe、Yandex Disk、Mail.ru |
| 欧洲/隐私云 | IONOS HiDrive、STRATO HiDrive、MagentaCLOUD、GMX、WEB.DE、mailbox.org、Hetzner、luckycloud、Infomaniak kDrive |
| 自建/NAS | Nextcloud、ownCloud、Seafile、群晖 DSM、威联通 QTS、TrueNAS、飞牛 fnOS、极空间 |
| 网关 | AList、rclone（把 OneDrive / Google Drive / Dropbox / MEGA 等无原生 WebDAV 的网盘暴露为 WebDAV） |

验证状态的含义：

- `live`：端点已实际探测，返回 WebDAV/Basic 认证挑战。
- `documented`：地址与认证来自官方文档或官方帮助中心。
- `unverified`：社区通用地址，服务商可能随时调整；接入前请在对应 App 内确认。

没有原生 WebDAV 的网盘（百度网盘、阿里云盘、夸克、OneDrive、Google Drive、Dropbox、MEGA 等）建议通过 AList 或 rclone 网关接入；SDK 的 `alist` / `rclone` 预设已覆盖这类用法。

---

## 浏览器与 CORS

绝大多数 WebDAV 服务不返回 CORS 头，浏览器无法直接请求。SDK 在浏览器里遇到网络错误会给出提示。推荐做法：

1. 应用自带一个同源 Node 服务，把 `/api/dav/*` 转发到固定的 WebDAV 账号；
2. 浏览器把账号密码发给这个代理（或由服务端保存），代理注入 Basic 认证；
3. 代理只允许 WebDAV 方法、限制路径前缀、拒绝 `Destination` 指向其他主机。

可直接运行的示例见 **[examples/node-proxy.mjs](examples/node-proxy.mjs)**，说明见 **[docs/integration.md](docs/integration.md)**。SDK 会从 PROPFIND 的 self 条目推断上游真实根路径，因此代理前缀（`/api/dav/` → 上游 `/dav/`）不需要额外配置。

---

## 安全注意事项

- **使用应用密码，不要用主密码**：坚果云、InfiniCLOUD、Koofr、mailbox.org、Nextcloud 等都支持独立的应用密码，泄露后可单独吊销。
- **只走 HTTPS**：Basic 认证是明文 Base64，HTTP 下等同裸奔。
- **不要把凭据写进 URL**：SDK 会拒绝 `https://user:pass@host/` 形式的 `baseUrl`。
- **代理必须鉴权**：`examples/node-proxy.mjs` 是开发示例；上线前给代理加登录态，并固定上游账号，不要让客户端自由指定目标地址。
- **SDK 不加密同步内容**：敏感数据（密码库、笔记）请在应用层加密后再交给 `writeJson` / `writeFile`。可参考 family_hub 的 AES-256-GCM 快照方案。
- **CLI 密码用环境变量**：`--password` 会留在 shell 历史。

---

## 设计与非目标

- **协议子集**：`OPTIONS`、`PROPFIND`、`MKCOL`、`GET`、`HEAD`、`PUT`、`DELETE`、`MOVE`、`COPY`。不实现 `LOCK/UNLOCK`、`PROPPATCH`、ACL、版本控制。
- **响应缓冲**：为了跨运行时的简单性，GET 响应会完整读入内存；适合配置和 JSON，不适合几十 GB 的媒体文件。上传支持 `Uint8Array` / `Blob` / `ReadableStream`（TS）。
- **流式上传不重试**：`ReadableStream` 请求体无法回放，网络/5xx 失败时只尝试一次并直接报错，避免静默截断或重复写入；需要重试请传 `Uint8Array` 或 `Blob`。
- **Digest/MD5 仅 Node 后端**：浏览器端请使用 Basic（绝大多数 WebDAV 服务商的默认方式）；SHA-256 Digest 在支持 Web Crypto 的运行时可用。
- **不做分块上传**：Nextcloud 的分块协议在注册表中标记为能力，但 v1 未实现；超大文件请用官方客户端或后续版本。
- **合并语义归应用**：SDK 提供传输、ETag、条件写入和同步骨架，不规定业务数据的冲突策略。
- **Provider 注册表是唯一事实源**：新增服务商只需改 `spec/providers.json`，然后运行 `node scripts/generate.mjs`，TS/Dart 表和文档会一起更新。

---

## 目录结构

```
anydav/
  spec/providers.json        # Provider 唯一事实源（31 个预设）
  scripts/generate.mjs       # 生成 TS/Dart 表和 docs/providers.md
  src/                       # TypeScript 实现
    client.ts                # 统一客户端
    paths.ts                 # 路径/编码/href 解析
    xml.ts                   # 零依赖 multistatus 解析
    auth.ts                  # Basic / Bearer / Digest
    errors.ts                # 统一错误与 Provider 提示
    providers.ts             # 注册表、检测、模板
    sync.ts                  # 多端 JSON 同步引擎
    cli.ts                   # 命令行
  test/                      # node:test + 内存 WebDAV 服务器
  dart/                      # Dart/Flutter 实现（同一套 API 语义）
  docs/                      # Provider 矩阵、集成指南、同步配方
  examples/                  # 浏览器代理、Flutter 片段
```

---

## 开发与测试

```bash
# TypeScript
npm install
npm run build
npm test                 # 67 项，含协议/错误/同步/CLI/代理集成测试

# Dart
cd dart
dart pub get
dart analyze             # 无警告
dart test                # 59 项
```

测试里有一个内存 WebDAV 服务器（TS 用 `node:http`，Dart 用 `MockClient`），覆盖 OPTIONS、PROPFIND、MKCOL、GET、HEAD、PUT、DELETE、MOVE、COPY、ETag、条件写入、Range、配额和限流注入。

---

## Roadmap

- `writer` 流式下载与 Nextcloud 分块上传。
- Kotlin（Android/JVM）与 Swift（Apple）端口；共享同一份 `spec/providers.json` 与 conformance 用例。
- Python 轻量端口，服务端脚本可直接复用。
- Provider 在线校验：读取注册表后对端点做 OPTIONS 探测并更新 `verification`。
- 更多国内 NAS 预设（绿联、铁威马）与 AList 存储能力矩阵。

## License

MIT
