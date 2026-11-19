# 同步配方

`anydav` 的同步引擎只做**传输层**：列目录、按 ETag 增量下载、调用应用提供的 `merge`、内容指纹变化时条件上传。业务数据的冲突规则、删除墓碑、加密格式都由应用决定。

## 1. 每设备一个文件

这是最稳、最容易排查的多端同步模型，也是 suitang、nolumiq、family_hub 已经在用的结构：

```
/myapp/
  phone-a1b2.json     ← 手机只写这个文件
  tablet-c3d4.json    ← 平板只写这个文件
  desktop-e5f6.json   ← 电脑只写这个文件
```

每台设备只写自己的文件，天然避免「两台设备同时覆盖同一个文件」。一轮同步：

1. `MKCOL /myapp/`（已存在则忽略）；
2. `PROPFIND /myapp/` 列出所有 `.json`；
3. 对每个**其他设备**的文件，ETag 变化才 `GET`；
4. 把本机状态和远端状态交给 `merge`；
5. 合并结果与上次上传指纹不同，才 `PUT` 自己的文件；
6. 写自己的文件时带 `If-Match`，防止同一 deviceId 的并发实例互相覆盖。

TypeScript：

```ts
const engine = createJsonSync<State>({
  client,
  folder: '/myapp',
  deviceId: deviceId, // 持久化到本机，重装后重新生成
  merge,
  cache: new MemorySyncCache(),
});

const result = await engine.sync(localState);
```

Dart：

```dart
final engine = JsonSyncEngine<State>(
  JsonSyncOptions(
    client: client,
    folder: '/myapp',
    deviceId: deviceId,
    merge: merge,
  ),
);

final result = await engine.sync(localState);
```

## 2. 合并策略

SDK 不限制 `merge` 的形态。常见三种：

### 2.1 按时间戳的 Last-Write-Wins

每个条目带 `at` / `updatedAt`，合并时取最大：

```ts
merge: ({ local, remotes }) => {
  const items = { ...(local?.items ?? {}) };
  for (const remote of remotes) {
    for (const [key, item] of Object.entries(remote.state.items ?? {})) {
      if (!items[key] || item.at > items[key].at) items[key] = item;
    }
  }
  return { items };
}
```

### 2.2 带删除墓碑

删除不能只从本地移除，否则下一次同步会被其他设备的旧数据带回来：

```ts
type Item = { value: string; at: number };
type State = {
  items: Record<string, Item>;
  removals: Record<string, number>;
};

function merge({ local, remotes, now }: MergeContext<State>): State {
  const items: Record<string, Item> = { ...(local?.items ?? {}) };
  const removals: Record<string, number> = { ...(local?.removals ?? {}) };
  for (const remote of remotes) {
    for (const [key, item] of Object.entries(remote.state.items ?? {})) {
      if (!items[key] || item.at > items[key].at) items[key] = item;
    }
    for (const [key, at] of Object.entries(remote.state.removals ?? {})) {
      if (at > (removals[key] ?? -Infinity)) removals[key] = at;
    }
  }
  const kept = Object.fromEntries(
    Object.entries(items).filter(([key, item]) => item.at > (removals[key] ?? -Infinity)),
  );
  // 180 天后忘记墓碑，避免无限增长
  const live = Object.fromEntries(
    Object.entries(removals).filter(([key, at]) => now - at < 180 * 24 * 3600 * 1000 && !(key in kept)),
  );
  return { items: kept, removals: live };
}
```

### 2.3 集合求并

收藏、标签这类天然幂等的数据可以直接求并集；删除通过墓碑单独传播。

## 3. 指纹与「不重复上传」

默认指纹是递归排序 key 的稳定 JSON 字符串（`stableStringify`）。合并结果没变时，`uploaded === false`，不会产生 `PUT`，对坚果云的请求预算很友好。

如果业务状态包含 `updatedAt: Date.now()` 这类每轮都变的字段，请把它排除在指纹之外，否则每轮都会上传：

```ts
fingerprint: (state) => stableStringify({ items: state.items }),
```

## 4. ETag 缓存

- ETag 存在 `SyncCache`，键是 `baseUrl + folder + fileName`，不同账号/目录不会串。
- 默认 `MemorySyncCache` 只在进程内有效；重启后第一轮会重新下载远端文件（但不会重复上传，除非指纹缓存也丢了）。
- 需要跨启动省流量时，持久化 `snapshot()`：

```ts
const cache = new MemorySyncCache();
const saved = await loadFromDisk();       // 应用自己实现
if (saved) cache.restore(saved);
// ... sync ...
await saveToDisk(cache.snapshot());
```

Dart 端 `MemorySyncCache.snapshot()` 返回普通 Map，可直接 `jsonEncode` 持久化。

## 5. 条件写入

- 读：`readFile(path, { ifNoneMatch: etag })` → `notModified: true` 时不下载正文。
- 写：`writeFile(path, data, { ifMatch: etag })` → 远端被改过时返回 `PRECONDITION_FAILED`（412），应用应重新读取后再合并。
- 创建：`ifNoneMatch: '*'` → 只在文件不存在时创建。

`JsonSyncEngine` 已经对「自己的设备文件」使用 `If-Match`；如果同一 deviceId 被复制到两台设备（例如用户手动拷贝了配置），第二个实例会得到 412，引擎会自动重跑一轮。

## 6. 加密快照

SDK 不加密。敏感数据建议沿用 family_hub 的结构：

```json
{
  "format": "myapp.sync.v1",
  "keyId": "k-abc123",
  "nonce": "base64…",
  "ciphertext": "base64…"
}
```

- 明文只保留格式/版本等非敏感字段；
- AES-256-GCM 的密钥用 PBKDF2/Argon2 从用户口令派生，或使用应用托管的主密钥；
- 上传前在本地加密，下载后先校验再解密；
- 解密失败不要半合并——要么整份接受，要么整份跳过。

## 7. 大目录与坚果云 750 条限制

坚果云单次 `PROPFIND` 最多返回 750 个条目。当前 SDK 的 `list()` 只发一次请求，不自动翻页；如果你把大量文件放在同一目录，可能只看到前 750 个。

建议：

- 每个应用只用一个固定目录，目录内文件数保持在几十个量级；
- 需要存大量对象时，按日期/哈希分桶到子目录，逐目录 `list()`；
- 不要用 WebDAV 目录存图片/视频库；那是网盘客户端的场景。

## 8. 失败处理速查

| 现象 | 处理 |
| --- | --- |
| `401` + 坚果云 | 用第三方应用密码，不是登录密码 |
| `403` + 坚果云 | 可能触发限流（600/30min）或目录无权限；退避到下一个 30 分钟窗口 |
| `404` | `baseUrl` 前缀不对（Nextcloud 忘了用户名、Seafile 没开 seafdav） |
| `409` | 父目录不存在；用 `mkdir(recursive: true)` 或开启 `autoCreateParents` |
| `412` | ETag 不匹配；重新读取再合并 |
| `429` / `503` | 引擎自动退避重试；`Retry-After` 过大时直接提示用户 |
| `507` | 网盘空间不足 |
| 解析错误 `PARSE` | `baseUrl` 可能指向了网页而不是 WebDAV 根路径 |
| 浏览器 `NETWORK` + CORS 提示 | 走同源代理 |

## 9. 同步频率建议

- 手动同步按钮 + 应用回到前台时同步；
- 最小间隔 1–5 分钟，不要秒级轮询；
- 多设备冲突不靠「更频繁同步」解决，靠 `merge` 的确定性；
- 同步失败不要清空本地状态，保留上一份成功快照。
