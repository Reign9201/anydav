# 集成指南

## 1. 先选接入形态

| 应用形态 | 推荐实现 | 说明 |
| --- | --- | --- |
| Node / Electron / Deno / Bun / React Native | TypeScript | `npm install anydav`，直接使用 |
| 浏览器 SPA / PWA | TypeScript + 同源代理 | 多数 WebDAV 服务无 CORS 头，必须经服务端转发 |
| Flutter（Android/iOS/桌面/Web） | Dart | `path: ../anydav/dart` 路径依赖 |
| 原生 iOS / Android | 暂时参考协议与注册表 | Swift/Kotlin 端口在 Roadmap；可先复用注册表中的地址、认证和限额 |
| Python 脚本 | 暂时参考协议与注册表 | 也可用 Node 代理或后续 Python 端口 |

Provider 的地址、认证类型、密码类型、限额都在 `spec/providers.json`。上层 UI 直接读这份数据生成「服务商选择 + 地址自动填充 + 密码提示」，不要在每个 App 里重复维护一张表。

## 2. 浏览器：CORS 与同源代理

浏览器直接 `fetch` WebDAV 的失败通常不是网络问题，而是 CORS：服务商不返回 `Access-Control-Allow-Origin`，预检请求也过不去。SDK 在浏览器里遇到 `TypeError` 会提示这一点。

正确结构：

```
浏览器 (SDK)  ──/api/dav/*──▶  你的 Node 服务  ──Basic Auth──▶  WebDAV 服务
```

要点：

- 代理的上游地址和账号固定由服务端配置，**不要让客户端传目标 URL**，否则等于开放 SSRF。
- 只允许 WebDAV 方法（`OPTIONS, PROPFIND, MKCOL, GET, HEAD, PUT, DELETE, MOVE, COPY`）。
- 把 `Destination` 头从代理地址重写为上游地址。
- 限制请求体和路径深度；拒绝 `..`、绝对 URL、控制字符。
- 给代理本身加登录态（Cookie / Bearer），否则任何访问者都能读写网盘。
- 浏览器端的 `baseUrl` 填代理地址，例如 `https://your-app.example.com/api/dav/`，`provider` 仍可填实际上游的服务商，或让 SDK 自动识别代理地址（会落到 `generic`，不影响协议）。
- SDK 会从 PROPFIND 返回的 self 条目推断上游真实根路径，所以代理前缀与上游路径不一致时（例如 `/api/dav/` → `/dav/`）不需要额外配置；MOVE/COPY 的 `Destination` 由代理负责重写。

可运行例子：`examples/node-proxy.mjs`。

## 3. Flutter / Dart

### 3.1 依赖

```yaml
dependencies:
  anydav:
    path: ../anydav/dart
```

### 3.2 创建客户端

```dart
final client = WebDavClient(
  provider: 'nextcloud',
  baseUrl: 'https://cloud.example.com/remote.php/dav/files/alice/',
  username: 'alice',
  password: appPassword,
  timeout: const Duration(seconds: 25),
  retries: 2,
);
```

如果 App 里已经有一个 Provider 下拉框，可以这样填充 UI：

```dart
for (final provider in providers) {
  // provider.id, provider.label, provider.baseUrl, provider.urlTemplate
  // provider.auth.usernameHint, provider.auth.passwordHint
  // provider.limits?.maxUploadBytes, provider.limits?.requestsPer30Min
  // provider.verification
}
```

用户选择带 `{username}` / `{host}` 占位符的模板时，用 `fillUrlTemplate` 填充；不要自己拼字符串。

### 3.3 验证与错误提示

```dart
try {
  final info = await client.testConnection();
  // 可选：真正写一次再删除，验证写权限
  await client.writeText('/.write-test', 'ok', createParents: true);
  await client.remove('/.write-test');
  print('${info.provider.label} ${info.dav} ${info.latencyMs}ms');
} on DavError catch (error) {
  switch (error.code) {
    case DavErrorCode.unauthorized:
    case DavErrorCode.forbidden:
      showError(error.hint ?? '账号或应用密码不正确');
    case DavErrorCode.notFound:
      showError('WebDAV 地址不正确，或路径不存在');
    case DavErrorCode.network:
    case DavErrorCode.timeout:
    case DavErrorCode.tls:
      showError('连不上网盘，检查网络、证书或代理');
    case DavErrorCode.rateLimited:
      showError('请求过于频繁，请稍后再试');
    default:
      showError(error.hint ?? error.message);
  }
}
```

`error.hint` 已经是中文、按 Provider 定制的话术，直接展示即可；`error.code` 用于决定重试/引导，不要解析 `error.message`。

### 3.4 凭据存储

- WebDAV 密码、应用密码、同步主密钥放 Keychain / Keystore（如 `flutter_secure_storage`），不要放 `SharedPreferences`。
- 密码输入框旁展示 `provider.auth.passwordHint`，例如「坚果云：第三方应用密码（不是登录密码）」。
- 连接测试成功后再持久化，避免存下错误配置。

## 4. 从现有「四动词」代码迁移

现有项目（suitang、nolumiq、family_hub 等）的 `ensureFolder / list / get / put` 可以直接替换：

| 旧代码 | 新调用 |
| --- | --- |
| `ensureFolder()`（MKCOL + 忽略 405） | `await client.mkdir(folder, { recursive: true })` |
| `list()`（PROPFIND Depth 1 + 过滤 `.json`） | `await client.list(folder)`，再按扩展名过滤 |
| `get(name)`（GET + ETag） | `await client.readText(path)` / `readFile` |
| `put(name, json)` | `await client.writeJson(path, value)` / `writeText` |
| 手写 `401/403/404/507` 文案 | `DavError.code` + `hint` |
| 手写 Basic 头 | 客户端根据 provider 自动处理 |
| 手写 PROPFIND XML 解析 | 客户端内置，支持任意命名空间前缀 |
| 固定坚果云地址 | `provider` 预设 + `detectProvider` |

迁移时注意：

- **路径语义变了**：新 SDK 的路径是相对账号根目录的**解码**路径（`/我的 文件/a.txt`），内部负责百分号编码。旧代码里的 `bilistudy/` 这类相对目录，前面补 `/` 即可。
- **自动建父目录默认开启**：`writeFile` 会按需 `MKCOL`。如果在意坚果云请求次数，可以在客户端设置 `autoCreateParents: false`，并在同步开始时显式 `mkdir(folder, recursive: true)`。
- **错误不再吞掉**：旧代码把 `409` 当成功的地方，新 SDK 只在父目录已知存在时才把 `409` 视为「已存在」。这是为了不掩盖真正的父目录缺失。
- **根目录保护**：`remove('/')`、`move('/', …)` 会被拒绝。

## 5. Node / Electron

```ts
import { createWebDavClient } from 'anydav';

const client = createWebDavClient({
  baseUrl: process.env.WEBDAV_URL!,
  username: process.env.WEBDAV_USER!,
  password: process.env.WEBDAV_PASSWORD!,
});
```

Electron 主进程可直接用；渲染进程建议把 WebDAV 操作放主进程，通过 IPC 暴露最小接口，避免把密码带进渲染层。

## 6. 原生 iOS / Android

Swift/Kotlin 端口尚未随本仓库提供，但不需要重新调研：

1. 从 `spec/providers.json` 读取 `baseUrl` / `urlTemplate` / `auth` / `limits`；
2. 按 `docs/providers.md` 的端点实现 `PROPFIND`、`MKCOL`、`GET`、`PUT`（如需 MOVE/COPY 一并实现）；
3. 复用同样的错误码和提示文案（`src/errors.ts` / `dart/lib/src/errors.dart` 是规格）；
4. 用 `test/mock-server.ts` 的行为作为协议对照；如有条件，接入真实账号跑 `--write` 测试。

suitang 现有 Swift/Kotlin 实现已经把四种请求和 750 条限制处理得比较接近；替换点主要是：

- `DavAccount.jianguoyun` 常量 → 注册表；
- 固定 `bilistudy` 目录 → 调用方传入；
- `AppError` 文案 → 统一错误码；
- 路径编码：不要只 `URL.appendingPathComponent`，中文/空格/`?` 需要逐段百分号编码。

## 7. 请求预算（坚果云）

坚果云免费账户 600 次请求/30 分钟，付费 1500 次。一次「单文件同步」的典型请求数：

- 1 次 `PROPFIND`（列目录）
- N 次 `GET`（只下载 ETag 变化的远端文件）
- 0–1 次 `PUT`（内容指纹变化才上传）
- 首次写入可能多 1–2 次 `MKCOL`

使用 `JsonSyncEngine` 的 ETag 缓存后，稳定状态下每轮通常只有 1 次 `PROPFIND`。不要在 UI 层做「每秒拉一次」的轮询；建议手动同步 + 应用进入前台时同步 + 最小间隔 1–5 分钟。

## 8. 安全清单

- 使用 HTTPS 和**应用密码**；不要用主账号密码。
- 凭据只进 Keychain/Keystore，不进日志、崩溃上报或 URL。
- 代理必须加鉴权、固定上游、限制方法与路径。
- 敏感内容先加密再上传；SDK 只负责传输。
- 出错时不要自动无限重试：429/403 限流退避，`Retry-After` 超过上限时直接提示用户。
- 删除操作先在 UI 层确认；SDK 会拒绝删除账号根目录，但不会替你做业务确认。
