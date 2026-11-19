import 'types.dart';

enum DavErrorCode {
  invalidUrl,
  invalidPath,
  unauthorized,
  forbidden,
  notFound,
  methodNotAllowed,
  conflict,
  preconditionFailed,
  payloadTooLarge,
  unsupportedMediaType,
  locked,
  rateLimited,
  insufficientStorage,
  serverError,
  notImplemented,
  serviceUnavailable,
  network,
  timeout,
  tls,
  parse,
  providerUnknown,
}

/// One error type for the whole SDK. Switch on [code]; [hint] carries the
/// provider-specific next step (for example "use an app password").
class DavError implements Exception {
  const DavError(
    this.code,
    this.message, {
    this.status,
    this.method,
    this.url,
    this.providerId,
    this.retryable = false,
    this.retryAfter,
    this.hint,
    this.responseBody,
    this.cause,
  });

  final DavErrorCode code;
  final String message;
  final int? status;
  final String? method;
  final String? url;
  final String? providerId;
  final bool retryable;
  final Duration? retryAfter;
  final String? hint;
  final String? responseBody;
  final Object? cause;

  Map<String, Object?> toJson() => <String, Object?>{
        'name': 'DavError',
        'code': code.name,
        'message': message,
        'status': status,
        'method': method,
        'url': url,
        'providerId': providerId,
        'retryable': retryable,
        'retryAfterMs': retryAfter?.inMilliseconds,
        'hint': hint,
      };

  @override
  String toString() {
    final buffer = StringBuffer('DavError(${code.name}): $message');
    if (status != null) buffer.write(' [HTTP $status]');
    if (hint != null) buffer.write('\nHint: $hint');
    return buffer.toString();
  }
}

Duration? parseRetryAfter(String? value, {DateTime? now}) {
  if (value == null) return null;
  final trimmed = value.trim();
  final seconds = int.tryParse(trimmed);
  if (seconds != null) return Duration(seconds: seconds);
  try {
    final date = _parseHttpDate(trimmed);
    if (date == null) return null;
    final delta = date.difference(now ?? DateTime.now().toUtc());
    return delta.isNegative ? Duration.zero : delta;
  } catch (_) {
    return null;
  }
}

DateTime? _parseHttpDate(String value) {
  // RFC 1123: Wed, 19 Nov 2025 08:00:00 GMT
  final match = RegExp(
    r'^(?:[A-Za-z]{3}),?\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+GMT$',
  ).firstMatch(value.trim());
  if (match == null) return null;
  const months = <String, int>{
    'Jan': 1,
    'Feb': 2,
    'Mar': 3,
    'Apr': 4,
    'May': 5,
    'Jun': 6,
    'Jul': 7,
    'Aug': 8,
    'Sep': 9,
    'Oct': 10,
    'Nov': 11,
    'Dec': 12,
  };
  final month = months[match.group(2)!];
  if (month == null) return null;
  return DateTime.utc(
    int.parse(match.group(3)!),
    month,
    int.parse(match.group(1)!),
    int.parse(match.group(4)!),
    int.parse(match.group(5)!),
    int.parse(match.group(6)!),
  );
}

String? hintForStatus(int status, String? method, ProviderPreset? provider) {
  final id = provider?.id;
  if (status == 401 || status == 403) {
    if (id == 'jianguoyun') {
      return status == 401
          ? '坚果云需要使用「第三方应用密码」，不是登录密码。网页版：账户信息 → 安全选项 → 第三方应用管理。'
          : '坚果云 403 常见于访问频率超限（免费 600 次/30 分钟、付费 1500 次）或目录权限不足；请稍后重试并减少请求数。';
    }
    if (id == 'infinicloud') {
      return 'InfiniCLOUD 需要使用 My Page 中单独设置的 WebDAV 密码。';
    }
    if (id == 'koofr') {
      return 'Koofr 开启两步验证后必须使用应用密码（Preferences → Security → App passwords）。';
    }
    if (id == 'mailbox') {
      return 'mailbox.org 必须使用应用专用密码（Settings → Security → App passwords）。';
    }
    if (id == 'yandex' || id == 'mailru') {
      return '该服务要求使用应用专用密码，不是登录密码。';
    }
    if (id == 'nextcloud' || id == 'owncloud' || id == 'magentacloud') {
      return '请使用应用密码；WebDAV 地址必须包含用户名（/remote.php/dav/files/用户名/）。';
    }
    if (id == 'pikpak') {
      return '请使用 PikPak App「实验室功能 → WebDAV」页面显示的账号和密码。';
    }
    return status == 403
        ? '服务器拒绝访问：检查账号权限、应用密码或网盘空间状态。'
        : '认证失败：确认用户名/密码；开启两步验证时通常需要应用专用密码。';
  }
  if (status == 404) {
    return method == 'PROPFIND'
        ? '路径或 WebDAV 根地址不存在：确认 baseUrl 包含服务商要求的完整前缀。'
        : '文件或目录不存在。';
  }
  if (status == 405) {
    return method == 'MKCOL'
        ? '目录已经存在（部分服务器用 405 表示），可按成功处理。'
        : '服务器不支持该操作或路径类型不匹配。';
  }
  if (status == 409) {
    return method == 'PUT' || method == 'MKCOL'
        ? '父目录不存在：先调用 mkdir(path, recursive: true)。'
        : '目标路径与现有资源冲突。';
  }
  if (status == 412) {
    return 'If-Match / If-None-Match 条件不满足：远端文件已被修改，请重新读取后再写入。';
  }
  if (status == 413) {
    return '上传内容超过服务商限制；坚果云默认单文件 500MB。';
  }
  if (status == 429) {
    return '请求过多：客户端应退避重试；若为坚果云，等下一个 30 分钟窗口更可靠。';
  }
  if (status == 507) return '网盘空间不足。';
  if (status >= 500) return '服务端临时故障，可稍后重试。';
  return null;
}

const Map<int, DavErrorCode> _statusCodes = <int, DavErrorCode>{
  400: DavErrorCode.conflict,
  401: DavErrorCode.unauthorized,
  403: DavErrorCode.forbidden,
  404: DavErrorCode.notFound,
  405: DavErrorCode.methodNotAllowed,
  409: DavErrorCode.conflict,
  412: DavErrorCode.preconditionFailed,
  413: DavErrorCode.payloadTooLarge,
  415: DavErrorCode.unsupportedMediaType,
  423: DavErrorCode.locked,
  429: DavErrorCode.rateLimited,
  500: DavErrorCode.serverError,
  501: DavErrorCode.notImplemented,
  502: DavErrorCode.serviceUnavailable,
  503: DavErrorCode.serviceUnavailable,
  504: DavErrorCode.serviceUnavailable,
  507: DavErrorCode.insufficientStorage,
};

const Set<int> _retryableStatuses = <int>{429, 502, 503, 504};

DavError errorFromStatus(
  int status, {
  required String method,
  required String url,
  ProviderPreset? provider,
  String? retryAfter,
  String? body,
}) {
  final code = _statusCodes[status] ??
      (status >= 500 ? DavErrorCode.serverError : DavErrorCode.providerUnknown);
  return DavError(
    code,
    'WebDAV $method $url failed with HTTP $status',
    status: status,
    method: method,
    url: url,
    providerId: provider?.id,
    retryable: _retryableStatuses.contains(status),
    retryAfter: parseRetryAfter(retryAfter),
    hint: hintForStatus(status, method, provider),
    responseBody: body,
  );
}

DavError networkError(
  Object cause, {
  required String method,
  required String url,
  ProviderPreset? provider,
  bool timedOut = false,
}) {
  final message = cause.toString();
  final isTls = RegExp(
    r'certificate|handshake|tls|ssl|self[- ]signed',
    caseSensitive: false,
  ).hasMatch(message);
  return DavError(
    timedOut
        ? DavErrorCode.timeout
        : isTls
            ? DavErrorCode.tls
            : DavErrorCode.network,
    timedOut
        ? 'WebDAV $method $url timed out'
        : 'WebDAV $method $url failed: $message',
    method: method,
    url: url,
    providerId: provider?.id,
    retryable: !isTls,
    hint: isTls
        ? 'TLS 证书校验失败：检查证书链、域名和系统时间；不要为生产环境关闭校验。'
        : null,
    cause: cause,
  );
}

DateTime? parseHttpDate(String? value) {
  if (value == null) return null;
  return _parseHttpDate(value) ?? DateTime.tryParse(value);
}
