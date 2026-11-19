// AUTO-GENERATED from spec/providers.json. Do not edit by hand.
// Regenerate with: node scripts/generate.mjs
import type { ProviderSpecFile } from './types.js';

export const PROVIDER_SPEC: ProviderSpecFile = {
  "schemaVersion": 1,
  "updatedAt": "2026-11-19",
  "providers": [
    {
      "id": "jianguoyun",
      "name": "Jianguoyun (Nutstore)",
      "nameZh": "坚果云",
      "category": "consumer",
      "baseUrl": "https://dav.jianguoyun.com/dav/",
      "urlTemplate": null,
      "urlHints": [],
      "auth": {
        "scheme": "basic",
        "passwordKind": "app-password",
        "usernameHint": "坚果云账号邮箱",
        "passwordHint": "第三方应用密码（不是登录密码）",
        "noteZh": "网页版「账户信息 → 安全选项 → 第三方应用管理」生成应用密码。",
        "twoFactor": "应用密码天然兼容两步验证。"
      },
      "capabilities": {
        "quota": null,
        "move": null,
        "copy": null,
        "rangeRead": null,
        "etag": true,
        "depthInfinity": false,
        "chunkedUpload": false
      },
      "limits": {
        "maxUploadBytes": 524288000,
        "propfindMaxEntries": 750,
        "requestsPer30Min": {
          "free": 600,
          "paid": 1500
        },
        "noteZh": "单文件上传默认 500MB；免费账户每 30 分钟 600 次请求、付费 1500 次；单次 PROPFIND 最多返回 750 个条目。"
      },
      "quirks": {
        "appPasswordRequired": true,
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405,
          409
        ],
        "knownIssuesZh": [
          "超出访问频率时可能返回 403 而不是 429，重试通常要等到下一个 30 分钟窗口。",
          "目录条目超过 750 个时需要分页遍历，不能假设一次 PROPFIND 拿到全部。"
        ]
      },
      "detect": {
        "hosts": [
          "dav.jianguoyun.com"
        ]
      },
      "docsUrl": "https://help.jianguoyun.com/?p=2064",
      "verification": "live"
    },
    {
      "id": "nextcloud",
      "name": "Nextcloud",
      "nameZh": "Nextcloud",
      "category": "self-hosted",
      "baseUrl": null,
      "urlTemplate": "https://{host}/remote.php/dav/files/{username}/",
      "urlHints": [
        "子目录部署：https://example.com/nextcloud/remote.php/dav/files/用户名/",
        "WebDAV 根路径必须包含用户名。"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "app-password",
        "usernameHint": "Nextcloud 用户名",
        "passwordHint": "应用密码（设置 → 安全 → 应用密码）",
        "noteZh": "推荐使用应用密码；开启两步验证时必须使用应用密码。"
      },
      "capabilities": {
        "quota": true,
        "move": true,
        "copy": true,
        "rangeRead": true,
        "etag": true,
        "depthInfinity": false,
        "chunkedUpload": "nextcloud"
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ],
        "knownIssuesZh": [
          "服务器默认禁止 Depth: infinity 的 PROPFIND。",
          "大文件使用 Nextcloud 分块上传更可靠；本 SDK 当前只提供普通 PUT。"
        ]
      },
      "detect": {
        "pathIncludes": [
          "/remote.php/dav/files/"
        ]
      },
      "docsUrl": "https://docs.nextcloud.com/server/latest/user_manual/en/files/access_webdav.html",
      "verification": "documented"
    },
    {
      "id": "owncloud",
      "name": "ownCloud",
      "nameZh": "ownCloud",
      "category": "self-hosted",
      "baseUrl": null,
      "urlTemplate": "https://{host}/remote.php/dav/files/{username}/",
      "urlHints": [
        "旧版路径：https://example.com/remote.php/webdav/",
        "新版路径：https://example.com/remote.php/dav/files/用户名/"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "app-password",
        "usernameHint": "ownCloud 用户名",
        "passwordHint": "应用密码或账号密码",
        "noteZh": "开启两步验证时使用应用密码。"
      },
      "capabilities": {
        "quota": true,
        "move": true,
        "copy": true,
        "rangeRead": true,
        "etag": true,
        "depthInfinity": false,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "pathIncludes": [
          "/remote.php/webdav/"
        ]
      },
      "docsUrl": "https://doc.owncloud.com/server/latest/user_manual/en/files/access_webdav.html",
      "verification": "documented"
    },
    {
      "id": "synology",
      "name": "Synology DSM (WebDAV Server)",
      "nameZh": "群晖 DSM",
      "category": "nas",
      "baseUrl": null,
      "urlTemplate": "https://{host}:5006/",
      "urlHints": [
        "HTTPS 默认端口 5006，HTTP 默认端口 5005。",
        "地址指向共享文件夹，如 https://nas:5006/home/ 或 https://nas:5006/webdav/。"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "account",
        "usernameHint": "DSM 账号",
        "passwordHint": "DSM 密码；开启 2FA 时使用应用专用密码",
        "noteZh": "先在套件中心安装并启用 WebDAV Server。"
      },
      "capabilities": {
        "quota": null,
        "move": true,
        "copy": true,
        "rangeRead": true,
        "etag": true,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "ports": [
          5005,
          5006
        ]
      },
      "docsUrl": "https://kb.synology.com/en-global/DSM/tutorial/How_to_access_files_on_Synology_NAS_with_WebDAV",
      "verification": "documented"
    },
    {
      "id": "qnap",
      "name": "QNAP QTS (WebDAV)",
      "nameZh": "威联通 QTS",
      "category": "nas",
      "baseUrl": null,
      "urlTemplate": "https://{host}:8081/",
      "urlHints": [
        "HTTPS 默认端口 8081，HTTP 默认端口 8080（以 NAS 设置为准）。",
        "地址指向共享文件夹，如 https://nas:8081/share/。"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "account",
        "usernameHint": "QTS 账号",
        "passwordHint": "QTS 密码"
      },
      "capabilities": {
        "quota": null,
        "move": true,
        "copy": true,
        "rangeRead": true,
        "etag": true,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "ports": [
          8080,
          8081
        ]
      },
      "docsUrl": "https://www.qnap.com/en/how-to/faq/article/how-do-i-use-webdav-to-access-files-on-my-nas",
      "verification": "documented"
    },
    {
      "id": "truenas",
      "name": "TrueNAS (WebDAV share)",
      "nameZh": "TrueNAS",
      "category": "nas",
      "baseUrl": null,
      "urlTemplate": "https://{host}:{port}/{share}/",
      "urlHints": [
        "在 Shares → WebDAV 中创建共享，使用该共享显示的地址和端口。"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "account",
        "usernameHint": "WebDAV 共享用户",
        "passwordHint": "共享用户密码"
      },
      "capabilities": {
        "quota": null,
        "move": true,
        "copy": true,
        "rangeRead": true,
        "etag": true,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {},
      "docsUrl": "https://www.truenas.com/docs/",
      "verification": "unverified"
    },
    {
      "id": "alist",
      "name": "AList",
      "nameZh": "AList",
      "category": "gateway",
      "baseUrl": null,
      "urlTemplate": "http://{host}:5244/dav/",
      "urlHints": [
        "默认端口 5244，WebDAV 路径固定为 /dav/。",
        "AList v3.42.0+ 需要在用户权限中开启 WebDAV 读取/管理权限。"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "account",
        "usernameHint": "AList 用户名",
        "passwordHint": "AList 密码",
        "noteZh": "只读场景只需 WebDAV 读取权限；写入还需要管理、重命名、删除、复制等基础权限。"
      },
      "capabilities": {
        "quota": null,
        "move": null,
        "copy": null,
        "rangeRead": null,
        "etag": null,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ],
        "knownIssuesZh": [
          "能否 MOVE/COPY 取决于 AList 背后的存储驱动（例如 Google Drive、123pan 不支持复制）。"
        ]
      },
      "detect": {
        "ports": [
          5244
        ]
      },
      "docsUrl": "https://alist.nn.ci/guide/webdav.html",
      "verification": "documented"
    },
    {
      "id": "seafile",
      "name": "Seafile (seafdav)",
      "nameZh": "Seafile",
      "category": "self-hosted",
      "baseUrl": null,
      "urlTemplate": "https://{host}/seafdav/",
      "urlHints": [
        "二进制部署默认端口 8080：http://host:8080/seafdav/。",
        "需在 seafdav.conf 中设置 enabled = true。"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "account",
        "usernameHint": "Seafile 登录邮箱",
        "passwordHint": "账号密码；开启 2FA 时使用 WebDAV 专用密码",
        "noteZh": "路径形如 /seafdav/资料库名/…"
      },
      "capabilities": {
        "quota": null,
        "move": true,
        "copy": null,
        "rangeRead": null,
        "etag": null,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ],
        "knownIssuesZh": [
          "seafdav 默认关闭，未启用时所有请求返回 404。",
          "反向代理后若 share_name 配置不正确，也会返回 404。"
        ]
      },
      "detect": {
        "pathIncludes": [
          "/seafdav/"
        ]
      },
      "docsUrl": "https://manual.seafile.com/latest/extension/webdav/",
      "verification": "documented"
    },
    {
      "id": "infinicloud",
      "name": "InfiniCLOUD (TeraCLOUD)",
      "nameZh": "InfiniCLOUD",
      "category": "consumer",
      "baseUrl": null,
      "urlTemplate": "https://{server}.teracloud.jp/dav/",
      "urlHints": [
        "登录后「My Page」会显示你的专属服务器前缀和 WebDAV 地址。",
        "示例：https://poyo.teracloud.jp/dav/"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "webdav-password",
        "usernameHint": "InfiniCLOUD 用户名",
        "passwordHint": "WebDAV 密码（在 My Page 单独设置）",
        "noteZh": "WebDAV 密码与网页登录密码分开；适合两步验证账号。"
      },
      "capabilities": {
        "quota": null,
        "move": true,
        "copy": true,
        "rangeRead": true,
        "etag": true,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hostSuffixes": [
          ".teracloud.jp"
        ]
      },
      "docsUrl": "https://infini-cloud.net/en/modules/useful_info/webdav/",
      "verification": "documented"
    },
    {
      "id": "pcloud",
      "name": "pCloud",
      "nameZh": "pCloud",
      "category": "consumer",
      "baseUrl": "https://webdav.pcloud.com/",
      "urlTemplate": null,
      "urlHints": [
        "美国区：https://webdav.pcloud.com/",
        "欧洲区：https://ewebdav.pcloud.com/"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "account",
        "usernameHint": "pCloud 注册邮箱",
        "passwordHint": "账号密码；开启 2FA 时使用应用专用密码（若已生成）",
        "noteZh": "区域选错会认证失败或看不到文件；美国/欧洲账号地址不同。"
      },
      "capabilities": {
        "quota": null,
        "move": true,
        "copy": true,
        "rangeRead": true,
        "etag": true,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hosts": [
          "webdav.pcloud.com",
          "ewebdav.pcloud.com"
        ]
      },
      "docsUrl": "https://help.pcloud.io/",
      "verification": "live"
    },
    {
      "id": "koofr",
      "name": "Koofr",
      "nameZh": "Koofr",
      "category": "consumer",
      "baseUrl": "https://app.koofr.net/dav/Koofr/",
      "urlTemplate": null,
      "urlHints": [
        "其他区域入口可能不同，以 Koofr 帮助页为准。"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "app-password",
        "usernameHint": "Koofr 注册邮箱",
        "passwordHint": "应用密码（Preferences → Security → App passwords）",
        "noteZh": "开启两步验证时必须使用应用密码。"
      },
      "capabilities": {
        "quota": null,
        "move": true,
        "copy": true,
        "rangeRead": true,
        "etag": true,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hostSuffixes": [
          ".koofr.net"
        ]
      },
      "docsUrl": "https://koofr.eu/help/",
      "verification": "live"
    },
    {
      "id": "icedrive",
      "name": "Icedrive",
      "nameZh": "Icedrive",
      "category": "consumer",
      "baseUrl": "https://webdav.icedrive.io/",
      "urlTemplate": null,
      "urlHints": [],
      "auth": {
        "scheme": "basic",
        "passwordKind": "account",
        "usernameHint": "Icedrive 注册邮箱",
        "passwordHint": "账号密码",
        "noteZh": "WebDAV 通常仅在付费套餐中提供。"
      },
      "capabilities": {
        "quota": null,
        "move": null,
        "copy": null,
        "rangeRead": null,
        "etag": null,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hosts": [
          "webdav.icedrive.io"
        ]
      },
      "docsUrl": "https://icedrive.net/",
      "verification": "unverified"
    },
    {
      "id": "opendrive",
      "name": "OpenDrive",
      "nameZh": "OpenDrive",
      "category": "consumer",
      "baseUrl": "https://webdav.opendrive.com/",
      "urlTemplate": null,
      "urlHints": [],
      "auth": {
        "scheme": "basic",
        "passwordKind": "account",
        "usernameHint": "OpenDrive 注册邮箱",
        "passwordHint": "账号密码"
      },
      "capabilities": {
        "quota": null,
        "move": null,
        "copy": null,
        "rangeRead": null,
        "etag": null,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hosts": [
          "webdav.opendrive.com"
        ]
      },
      "docsUrl": "https://www.opendrive.com/",
      "verification": "live"
    },
    {
      "id": "4shared",
      "name": "4shared",
      "nameZh": "4shared",
      "category": "consumer",
      "baseUrl": "https://webdav.4shared.com/",
      "urlTemplate": null,
      "urlHints": [],
      "auth": {
        "scheme": "basic",
        "passwordKind": "account",
        "usernameHint": "4shared 注册邮箱",
        "passwordHint": "账号密码",
        "noteZh": "部分功能可能需要付费账户。"
      },
      "capabilities": {
        "quota": null,
        "move": null,
        "copy": null,
        "rangeRead": null,
        "etag": null,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hosts": [
          "webdav.4shared.com"
        ]
      },
      "docsUrl": "https://www.4shared.com/",
      "verification": "unverified"
    },
    {
      "id": "cloudme",
      "name": "CloudMe",
      "nameZh": "CloudMe",
      "category": "consumer",
      "baseUrl": null,
      "urlTemplate": "https://webdav.cloudme.com/{username}/",
      "urlHints": [
        "地址必须带上用户名：https://webdav.cloudme.com/你的用户名/"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "account",
        "usernameHint": "CloudMe 用户名",
        "passwordHint": "账号密码"
      },
      "capabilities": {
        "quota": null,
        "move": null,
        "copy": null,
        "rangeRead": null,
        "etag": null,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hosts": [
          "webdav.cloudme.com"
        ]
      },
      "docsUrl": "https://www.cloudme.com/en/webdav",
      "verification": "live"
    },
    {
      "id": "hidrive",
      "name": "IONOS HiDrive",
      "nameZh": "IONOS HiDrive",
      "category": "consumer",
      "baseUrl": "https://webdav.hidrive.ionos.com/",
      "urlTemplate": null,
      "urlHints": [],
      "auth": {
        "scheme": "basic",
        "passwordKind": "app-password",
        "usernameHint": "HiDrive 用户名",
        "passwordHint": "应用密码 / WebDAV 密码",
        "noteZh": "开启两步验证时使用应用密码。"
      },
      "capabilities": {
        "quota": null,
        "move": true,
        "copy": true,
        "rangeRead": null,
        "etag": true,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hosts": [
          "webdav.hidrive.ionos.com"
        ]
      },
      "docsUrl": "https://www.ionos.com/help/",
      "verification": "unverified"
    },
    {
      "id": "strato-hidrive",
      "name": "STRATO HiDrive",
      "nameZh": "STRATO HiDrive",
      "category": "consumer",
      "baseUrl": "https://webdav.hidrive.strato.com/",
      "urlTemplate": null,
      "urlHints": [],
      "auth": {
        "scheme": "basic",
        "passwordKind": "account",
        "usernameHint": "STRATO HiDrive 用户名",
        "passwordHint": "账号密码"
      },
      "capabilities": {
        "quota": null,
        "move": true,
        "copy": true,
        "rangeRead": null,
        "etag": true,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hosts": [
          "webdav.hidrive.strato.com"
        ]
      },
      "docsUrl": "https://www.strato.com/",
      "verification": "live"
    },
    {
      "id": "magentacloud",
      "name": "Telekom MagentaCLOUD",
      "nameZh": "MagentaCLOUD",
      "category": "consumer",
      "baseUrl": "https://magentacloud.de/remote.php/webdav/",
      "urlTemplate": null,
      "urlHints": [],
      "auth": {
        "scheme": "basic",
        "passwordKind": "app-password",
        "usernameHint": "MagentaCLOUD 登录名",
        "passwordHint": "应用专用密码",
        "noteZh": "后端基于 Nextcloud/ownCloud 协议；开启两步验证时使用应用密码。"
      },
      "capabilities": {
        "quota": true,
        "move": true,
        "copy": true,
        "rangeRead": true,
        "etag": true,
        "depthInfinity": false,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hosts": [
          "magentacloud.de"
        ]
      },
      "docsUrl": "https://cloud.telekom.de/",
      "verification": "live"
    },
    {
      "id": "gmx",
      "name": "GMX Cloud",
      "nameZh": "GMX Cloud",
      "category": "consumer",
      "baseUrl": "https://webdav.mc.gmx.net/",
      "urlTemplate": null,
      "urlHints": [],
      "auth": {
        "scheme": "basic",
        "passwordKind": "account",
        "usernameHint": "GMX 邮箱地址",
        "passwordHint": "邮箱密码；开启 2FA 时使用应用密码（若可用）"
      },
      "capabilities": {
        "quota": null,
        "move": null,
        "copy": null,
        "rangeRead": null,
        "etag": null,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hosts": [
          "webdav.mc.gmx.net"
        ]
      },
      "docsUrl": "https://www.gmx.net/",
      "verification": "live"
    },
    {
      "id": "webde",
      "name": "WEB.DE Cloud",
      "nameZh": "WEB.DE Cloud",
      "category": "consumer",
      "baseUrl": "https://webdav.smartdrive.web.de/",
      "urlTemplate": null,
      "urlHints": [],
      "auth": {
        "scheme": "basic",
        "passwordKind": "account",
        "usernameHint": "WEB.DE 邮箱地址",
        "passwordHint": "邮箱密码；开启 2FA 时使用应用密码（若可用）"
      },
      "capabilities": {
        "quota": null,
        "move": null,
        "copy": null,
        "rangeRead": null,
        "etag": null,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hosts": [
          "webdav.smartdrive.web.de"
        ]
      },
      "docsUrl": "https://www.web.de/",
      "verification": "live"
    },
    {
      "id": "mailbox",
      "name": "mailbox.org Drive",
      "nameZh": "mailbox.org",
      "category": "consumer",
      "baseUrl": null,
      "urlTemplate": "https://dav.mailbox.org/servlet/webdav.infostore/Userstore/{email}/",
      "urlHints": [
        "路径中的用户名通常是邮箱地址；也可用「名 姓」形式。"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "app-password",
        "usernameHint": "mailbox.org 完整邮箱地址",
        "passwordHint": "应用专用密码（Settings → Security → App passwords）",
        "noteZh": "必须使用应用专用密码，不能直接用登录密码。"
      },
      "capabilities": {
        "quota": null,
        "move": true,
        "copy": true,
        "rangeRead": null,
        "etag": true,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hosts": [
          "dav.mailbox.org"
        ]
      },
      "docsUrl": "https://kb.mailbox.org/en/private/drive/webdav-access",
      "verification": "live"
    },
    {
      "id": "hetzner",
      "name": "Hetzner Storage Box",
      "nameZh": "Hetzner Storage Box",
      "category": "consumer",
      "baseUrl": null,
      "urlTemplate": "https://{username}.your-storagebox.de/",
      "urlHints": [
        "使用 Storage Box 的 WebDAV 子账号，而不是主账号密码。"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "sub-account",
        "usernameHint": "Storage Box 子账号（形如 u123456）",
        "passwordHint": "子账号密码或 WebDAV 专用密码"
      },
      "capabilities": {
        "quota": null,
        "move": true,
        "copy": true,
        "rangeRead": null,
        "etag": true,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hostSuffixes": [
          ".your-storagebox.de"
        ]
      },
      "docsUrl": "https://docs.hetzner.com/storage/storage-box/",
      "verification": "documented"
    },
    {
      "id": "luckycloud",
      "name": "luckycloud",
      "nameZh": "luckycloud",
      "category": "consumer",
      "baseUrl": "https://sync.luckycloud.de/luckydav/",
      "urlTemplate": null,
      "urlHints": [],
      "auth": {
        "scheme": "basic",
        "passwordKind": "app-password",
        "usernameHint": "luckycloud 登录邮箱",
        "passwordHint": "应用专用密码",
        "noteZh": "德国隐私云盘，支持两步验证。"
      },
      "capabilities": {
        "quota": null,
        "move": true,
        "copy": true,
        "rangeRead": null,
        "etag": true,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hosts": [
          "sync.luckycloud.de"
        ]
      },
      "docsUrl": "https://luckycloud.de/",
      "verification": "live"
    },
    {
      "id": "infomaniak",
      "name": "Infomaniak kDrive",
      "nameZh": "Infomaniak kDrive",
      "category": "consumer",
      "baseUrl": null,
      "urlTemplate": "https://{id}.connect.kdrive.infomaniak.com/",
      "urlHints": [
        "登录 kDrive 后在设置中查看 WebDAV 地址，其中 {id} 为账号的专属编号。"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "app-password",
        "usernameHint": "kDrive 登录邮箱",
        "passwordHint": "应用专用密码",
        "noteZh": "开启两步验证时必须使用应用密码。"
      },
      "capabilities": {
        "quota": null,
        "move": true,
        "copy": true,
        "rangeRead": null,
        "etag": true,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hostSuffixes": [
          ".connect.kdrive.infomaniak.com"
        ]
      },
      "docsUrl": "https://www.infomaniak.com/en/support/faq/2404",
      "verification": "documented"
    },
    {
      "id": "yandex",
      "name": "Yandex Disk",
      "nameZh": "Yandex Disk",
      "category": "consumer",
      "baseUrl": "https://webdav.yandex.ru/",
      "urlTemplate": null,
      "urlHints": [],
      "auth": {
        "scheme": "basic",
        "passwordKind": "app-password",
        "usernameHint": "Yandex 用户名",
        "passwordHint": "应用专用密码（ID → 安全 → 应用密码）",
        "noteZh": "必须使用应用专用密码。"
      },
      "capabilities": {
        "quota": null,
        "move": true,
        "copy": true,
        "rangeRead": null,
        "etag": true,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hosts": [
          "webdav.yandex.ru"
        ]
      },
      "docsUrl": "https://yandex.com/support/disk/",
      "verification": "live"
    },
    {
      "id": "mailru",
      "name": "Mail.ru Cloud",
      "nameZh": "Mail.ru Cloud",
      "category": "consumer",
      "baseUrl": "https://webdav.mail.ru/",
      "urlTemplate": null,
      "urlHints": [],
      "auth": {
        "scheme": "basic",
        "passwordKind": "app-password",
        "usernameHint": "Mail.ru 邮箱地址",
        "passwordHint": "应用专用密码",
        "noteZh": "必须使用应用专用密码。"
      },
      "capabilities": {
        "quota": null,
        "move": null,
        "copy": null,
        "rangeRead": null,
        "etag": null,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hosts": [
          "webdav.mail.ru"
        ]
      },
      "docsUrl": "https://cloud.mail.ru/",
      "verification": "live"
    },
    {
      "id": "pikpak",
      "name": "PikPak",
      "nameZh": "PikPak",
      "category": "consumer",
      "baseUrl": null,
      "urlTemplate": null,
      "urlHints": [
        "PikPak App → 设置 → 实验室功能 → WebDAV，开启后复制页面显示的地址、账号和密码。",
        "通常需要 PikPak 会员。"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "webdav-password",
        "usernameHint": "WebDAV 页面显示的账号",
        "passwordHint": "WebDAV 页面显示的密码",
        "noteZh": "地址和密码由 App 生成，不要使用登录密码。"
      },
      "capabilities": {
        "quota": null,
        "move": null,
        "copy": null,
        "rangeRead": null,
        "etag": null,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {
        "hostSuffixes": [
          ".pikpak.com",
          ".mypikpak.com"
        ]
      },
      "docsUrl": "https://mypikpak.com/",
      "verification": "unverified"
    },
    {
      "id": "fnos",
      "name": "fnOS (Feiniu NAS)",
      "nameZh": "飞牛 fnOS",
      "category": "nas",
      "baseUrl": null,
      "urlTemplate": null,
      "urlHints": [
        "在 fnOS「系统设置 → 文件服务 → WebDAV」中开启服务，使用页面显示的地址和端口。"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "account",
        "usernameHint": "fnOS 账号",
        "passwordHint": "fnOS 密码"
      },
      "capabilities": {
        "quota": null,
        "move": null,
        "copy": null,
        "rangeRead": null,
        "etag": null,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {},
      "docsUrl": "https://www.fnnas.com/",
      "verification": "unverified"
    },
    {
      "id": "zspace",
      "name": "Zspace NAS",
      "nameZh": "极空间",
      "category": "nas",
      "baseUrl": null,
      "urlTemplate": null,
      "urlHints": [
        "在极空间「系统设置 → WebDAV」中开启服务，使用页面显示的地址和端口。"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "account",
        "usernameHint": "极空间账号",
        "passwordHint": "极空间密码"
      },
      "capabilities": {
        "quota": null,
        "move": null,
        "copy": null,
        "rangeRead": null,
        "etag": null,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {},
      "docsUrl": "https://www.zspace.cn/",
      "verification": "unverified"
    },
    {
      "id": "rclone",
      "name": "rclone serve webdav",
      "nameZh": "rclone WebDAV",
      "category": "gateway",
      "baseUrl": null,
      "urlTemplate": "http://{host}:{port}/",
      "urlHints": [
        "默认监听 127.0.0.1:8080；用 --addr 修改。",
        "rclone 可以把 OneDrive、Google Drive、Dropbox、MEGA 等没有原生 WebDAV 的网盘暴露为 WebDAV。"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "account",
        "usernameHint": "rclone --user 配置的用户名",
        "passwordHint": "rclone --pass 配置的密码",
        "noteZh": "未配置 --user/--pass 时服务无认证，切勿暴露到公网。"
      },
      "capabilities": {
        "quota": null,
        "move": true,
        "copy": true,
        "rangeRead": null,
        "etag": null,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {},
      "docsUrl": "https://rclone.org/commands/rclone_serve_webdav/",
      "verification": "documented"
    },
    {
      "id": "generic",
      "name": "Generic WebDAV",
      "nameZh": "通用 WebDAV",
      "category": "generic",
      "baseUrl": null,
      "urlTemplate": null,
      "urlHints": [
        "填写服务商提供的 WebDAV 根地址，通常以 / 结尾。"
      ],
      "auth": {
        "scheme": "basic",
        "passwordKind": "account",
        "usernameHint": "用户名",
        "passwordHint": "密码或应用密码"
      },
      "capabilities": {
        "quota": null,
        "move": null,
        "copy": null,
        "rangeRead": null,
        "etag": null,
        "depthInfinity": null,
        "chunkedUpload": false
      },
      "limits": null,
      "quirks": {
        "putParentMustExist": true,
        "mkdirAlreadyExistsStatuses": [
          200,
          201,
          301,
          405
        ]
      },
      "detect": {},
      "docsUrl": "http://www.webdav.org/",
      "verification": "documented"
    }
  ]
};
