# Endpoint verification snapshot

日期：2026-11-19。运行方式：

```bash
node scripts/probe-providers.mjs          # 人类可读
node scripts/probe-providers.mjs --json   # 机器可读
```

探测为**未认证 `OPTIONS`**，只确认端点存在且返回 WebDAV 认证挑战，不登录、不写文件。

| Provider | 结果 | 认证 | 说明 |
| --- | --- | --- | --- |
| `jianguoyun` | 401 | Basic realm="nutstore" | 官方帮助中心另确认：应用密码、500MB 上传、600/1500 次每 30 分钟、PROPFIND 750 条 |
| `pcloud` | 401 | Basic realm="pCloud WebDAV Auth" | 美国区；欧洲区为 `ewebdav.pcloud.com` |
| `koofr` | 401 | Basic | — |
| `opendrive` | 401 | Basic realm="OpenDrive" | — |
| `strato-hidrive` | 401 | Basic realm="User Auth" | — |
| `magentacloud` | 401 | Basic realm="MagentaCLOUD" | 后端为 Nextcloud/ownCloud 协议 |
| `gmx` | 401 | Basic | — |
| `webde` | 401 | Basic | — |
| `luckycloud` | 401 | Basic | — |
| `yandex` | 401 | Basic realm="Yandex.Disk" | — |
| `mailru` | 401 | Basic | `webdav.mail.ru` |
| `mailbox` | 401 | Basic | 用 `dav.mailbox.org` 根路径探测；实际地址需带用户路径 |
| `cloudme` | 401 | Basic | 用 `https://webdav.cloudme.com/` 探测；实际地址需带用户名 |
| `icedrive` | 超时 | — | 当前网络不可达，保留 `unverified` |
| `4shared` | 超时 | — | 当前网络不可达，保留 `unverified` |
| `hidrive` | 超时 | — | 当前网络不可达，保留 `unverified` |
| `nextcloud` / `owncloud` / `synology` / `qnap` / `truenas` / `alist` / `seafile` | 跳过 | — | 需要用户自己的主机/端口，无法统一探测 |
| `infinicloud` / `hetzner` / `infomaniak` / `pikpak` | 跳过 | — | 地址含用户专属主机或由 App 生成 |
| `fnos` / `zspace` | 跳过 | — | NAS 地址由设备决定 |
| `rclone` / `generic` | 跳过 | — | 自建地址 |

“超时”不等于服务已停止；可能是当前网络、区域限制或服务端拒绝探测。接入前请以服务商 App/官方文档为准。发现地址变更时，请更新 `spec/providers.json` 并重新运行 `node scripts/generate.mjs`。
