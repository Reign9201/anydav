# Changelog

## 0.1.0 — 2026-11-19

首个版本。

- 31 个 Provider 预设，覆盖国内网盘、国际网盘、欧洲隐私云、自建/NAS 与 AList/rclone 网关。
- TypeScript 客户端：零运行时依赖，支持 Node 18+ / 浏览器 / Electron / React Native。
- Dart 客户端：Flutter 全平台，依赖 `http`、`xml`、`crypto`、`unorm_dart`。
- 统一错误码与 Provider 专属提示；Basic / Bearer / Digest 认证。
- PROPFIND 多命名空间解析、中文/空格路径编码、反向代理 href 解析、条件读写、Range、递归 MKCOL、MOVE/COPY。
- 幂等请求重试、`Retry-After`、坚果云 403 限流提示。
- 多端 JSON 同步引擎（每设备一个文件 + ETag 缓存 + 条件写入 + 稳定指纹）。
- `anydav` CLI：providers / detect / test / ls / stat / cat / get / put / mkdir / rm / mv / cp / quota。
- 浏览器同源代理示例与集成/同步文档。
