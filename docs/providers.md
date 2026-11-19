# WebDAV provider matrix

Generated from `spec/providers.json`. Do not edit by hand; run `node scripts/generate.mjs`.

| ID | 名称 | 类别 | 默认地址 / 模板 | 认证 | 密码类型 | 验证 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `jianguoyun` | 坚果云 | consumer | https://dav.jianguoyun.com/dav/ | basic / app-password | app-password | live | 网页版「账户信息 → 安全选项 → 第三方应用管理」生成应用密码。 |
| `nextcloud` | Nextcloud | self-hosted | https://{host}/remote.php/dav/files/{username}/ | basic / app-password | app-password | documented | 推荐使用应用密码；开启两步验证时必须使用应用密码。 |
| `owncloud` | ownCloud | self-hosted | https://{host}/remote.php/dav/files/{username}/ | basic / app-password | app-password | documented | 开启两步验证时使用应用密码。 |
| `synology` | 群晖 DSM | nas | https://{host}:5006/ | basic / account | account | documented | 先在套件中心安装并启用 WebDAV Server。 |
| `qnap` | 威联通 QTS | nas | https://{host}:8081/ | basic / account | account | documented | HTTPS 默认端口 8081，HTTP 默认端口 8080（以 NAS 设置为准）。 |
| `truenas` | TrueNAS | nas | https://{host}:{port}/{share}/ | basic / account | account | unverified | 在 Shares → WebDAV 中创建共享，使用该共享显示的地址和端口。 |
| `alist` | AList | gateway | http://{host}:5244/dav/ | basic / account | account | documented | 只读场景只需 WebDAV 读取权限；写入还需要管理、重命名、删除、复制等基础权限。 |
| `seafile` | Seafile | self-hosted | https://{host}/seafdav/ | basic / account | account | documented | 路径形如 /seafdav/资料库名/… |
| `infinicloud` | InfiniCLOUD | consumer | https://{server}.teracloud.jp/dav/ | basic / webdav-password | webdav-password | documented | WebDAV 密码与网页登录密码分开；适合两步验证账号。 |
| `pcloud` | pCloud | consumer | https://webdav.pcloud.com/ | basic / account | account | live | 区域选错会认证失败或看不到文件；美国/欧洲账号地址不同。 |
| `koofr` | Koofr | consumer | https://app.koofr.net/dav/Koofr/ | basic / app-password | app-password | live | 开启两步验证时必须使用应用密码。 |
| `icedrive` | Icedrive | consumer | https://webdav.icedrive.io/ | basic / account | account | unverified | WebDAV 通常仅在付费套餐中提供。 |
| `opendrive` | OpenDrive | consumer | https://webdav.opendrive.com/ | basic / account | account | live |  |
| `4shared` | 4shared | consumer | https://webdav.4shared.com/ | basic / account | account | unverified | 部分功能可能需要付费账户。 |
| `cloudme` | CloudMe | consumer | https://webdav.cloudme.com/{username}/ | basic / account | account | live | 地址必须带上用户名：https://webdav.cloudme.com/你的用户名/ |
| `hidrive` | IONOS HiDrive | consumer | https://webdav.hidrive.ionos.com/ | basic / app-password | app-password | unverified | 开启两步验证时使用应用密码。 |
| `strato-hidrive` | STRATO HiDrive | consumer | https://webdav.hidrive.strato.com/ | basic / account | account | live |  |
| `magentacloud` | MagentaCLOUD | consumer | https://magentacloud.de/remote.php/webdav/ | basic / app-password | app-password | live | 后端基于 Nextcloud/ownCloud 协议；开启两步验证时使用应用密码。 |
| `gmx` | GMX Cloud | consumer | https://webdav.mc.gmx.net/ | basic / account | account | live |  |
| `webde` | WEB.DE Cloud | consumer | https://webdav.smartdrive.web.de/ | basic / account | account | live |  |
| `mailbox` | mailbox.org | consumer | https://dav.mailbox.org/servlet/webdav.infostore/Userstore/{email}/ | basic / app-password | app-password | live | 必须使用应用专用密码，不能直接用登录密码。 |
| `hetzner` | Hetzner Storage Box | consumer | https://{username}.your-storagebox.de/ | basic / sub-account | sub-account | documented | 使用 Storage Box 的 WebDAV 子账号，而不是主账号密码。 |
| `luckycloud` | luckycloud | consumer | https://sync.luckycloud.de/luckydav/ | basic / app-password | app-password | live | 德国隐私云盘，支持两步验证。 |
| `infomaniak` | Infomaniak kDrive | consumer | https://{id}.connect.kdrive.infomaniak.com/ | basic / app-password | app-password | documented | 开启两步验证时必须使用应用密码。 |
| `yandex` | Yandex Disk | consumer | https://webdav.yandex.ru/ | basic / app-password | app-password | live | 必须使用应用专用密码。 |
| `mailru` | Mail.ru Cloud | consumer | https://webdav.mail.ru/ | basic / app-password | app-password | live | 必须使用应用专用密码。 |
| `pikpak` | PikPak | consumer | PikPak App → 设置 → 实验室功能 → WebDAV，开启后复制页面显示的地址、账号和密码。 | basic / webdav-password | webdav-password | unverified | 地址和密码由 App 生成，不要使用登录密码。 |
| `fnos` | 飞牛 fnOS | nas | 在 fnOS「系统设置 → 文件服务 → WebDAV」中开启服务，使用页面显示的地址和端口。 | basic / account | account | unverified |  |
| `zspace` | 极空间 | nas | 在极空间「系统设置 → WebDAV」中开启服务，使用页面显示的地址和端口。 | basic / account | account | unverified |  |
| `rclone` | rclone WebDAV | gateway | http://{host}:{port}/ | basic / account | account | documented | 未配置 --user/--pass 时服务无认证，切勿暴露到公网。 |
| `generic` | 通用 WebDAV | generic | 填写服务商提供的 WebDAV 根地址，通常以 / 结尾。 | basic / account | account | documented |  |

Verification: `live` = endpoint was probed live and answered with a WebDAV/Basic challenge;
`documented` = endpoint/auth taken from official documentation; `unverified` = community knowledge,
confirm in the provider app before relying on it.
