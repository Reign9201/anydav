# Changelog

## 0.1.0

- 与 TypeScript 版共用同一份 Provider 注册表（31 个预设）。
- `WebDavClient`：OPTIONS / PROPFIND / MKCOL / GET / HEAD / PUT / DELETE / MOVE / COPY。
- Basic / Bearer / Digest 认证；统一 `DavError` 与 Provider 专属提示。
- 中文/空格路径编码、命名空间无关的 multistatus 解析、反向代理 href 解析、条件读写、Range、配额。
- 幂等请求重试与 `Retry-After`。
- `JsonSyncEngine`：每设备一个文件、ETag 缓存、稳定指纹、条件写入。
