# Provider 注册表

`spec/providers.json` 是 `anydav` 的唯一事实源。TypeScript 与 Dart 的 Provider 表、文档矩阵都由它生成：

```bash
node scripts/generate.mjs
```

生成物（已提交，修改注册表后请重新生成）：

- `src/providers.generated.ts`
- `dart/lib/src/providers.generated.dart`
- `docs/providers.md`

## 新增一个服务商

1. 在 `spec/providers.json` 的 `providers` 数组里追加一个对象，至少包含：
   - `id`：小写 kebab-case，唯一；
   - `name` / `nameZh`；
   - `category`：`consumer | nas | self-hosted | gateway | generic`；
   - `auth`：`scheme`（`basic | digest | bearer | none`）与 `passwordKind`（`account | app-password | webdav-password | sub-account | token`）；
   - `capabilities`：不确定的字段填 `null`，不要猜；
   - `verification`：`live | documented | unverified`。
2. 能给出固定地址就写 `baseUrl`；需要用户名/服务器编号的写 `urlTemplate`（占位符：`{host}`、`{username}`、`{email}`、`{server}`、`{id}`、`{port}`、`{share}`）。
3. 把已知限制写进 `limits`（上传大小、PROPFIND 条目数、每 30 分钟请求数），把已知怪癖写进 `quirks.knownIssuesZh`。
4. 运行 `node scripts/generate.mjs`，再跑两边测试。
5. 如果条件允许，用真实账号跑一遍：

```bash
WEBDAV_URL=... WEBDAV_USER=... WEBDAV_PASSWORD=... \
npx anydav test --provider <id> --write
```

## 验证等级

| 等级 | 含义 |
| --- | --- |
| `live` | 未认证 `OPTIONS` 探测到 WebDAV/Basic 挑战（401 + `WWW-Authenticate`），或真实账号验证过 |
| `documented` | 地址/认证来自官方文档或官方帮助中心 |
| `unverified` | 社区通用地址，服务商可能已调整；接入前请在官方 App 内确认 |

不要为了让表格「好看」把 `unverified` 改成 `documented`。错误的预设比没有预设更伤人。

## 端点探测

```bash
node scripts/probe-providers.mjs          # 人类可读
node scripts/probe-providers.mjs --json   # 机器可读
```

只对带固定 `baseUrl` 的预设发未认证 `OPTIONS`，确认端点存活与认证类型；不会登录或写文件。

## Schema

`spec/providers.schema.json` 是 JSON Schema（draft 2020-12），可用于编辑器补全和 CI 校验。
