import 'package:unorm_dart/unorm_dart.dart' as unorm;

import 'errors.dart';

/// Public paths are decoded UTF-8 relative to the account root and start with
/// `/`: `/我的 文件/配置.json`. The SDK percent-encodes each segment when it
/// builds a URL. Input containing valid `%XX` escapes is decoded once for
/// convenience, and every segment is normalized to Unicode NFC.
class NormalizedBaseUrl {
  const NormalizedBaseUrl({
    required this.href,
    required this.uri,
    required this.path,
  });

  /// Encoded URL string with a trailing slash and no query/fragment.
  final String href;

  /// Parsed URI.
  final Uri uri;

  /// Decoded pathname, always ending with `/`.
  final String path;
}

String _decodedPathFromUri(Uri uri) {
  final segments = uri.pathSegments;
  final trailing = uri.path.endsWith('/');
  final joined = segments.where((segment) => segment.isNotEmpty).join('/');
  var path = '/$joined';
  if (trailing && path != '/') path += '/';
  return path;
}

NormalizedBaseUrl normalizeBaseUrl(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) {
    throw const DavError(DavErrorCode.invalidUrl, 'WebDAV baseUrl is empty');
  }
  final uri = Uri.tryParse(trimmed);
  if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
    throw DavError(
      DavErrorCode.invalidUrl,
      'Invalid WebDAV baseUrl: $trimmed',
      hint: '地址必须以 http:// 或 https:// 开头，例如 https://dav.jianguoyun.com/dav/',
    );
  }
  if (uri.scheme != 'http' && uri.scheme != 'https') {
    throw DavError(
      DavErrorCode.invalidUrl,
      'Unsupported URL scheme: ${uri.scheme}',
      hint: 'WebDAV 只支持 http:// 或 https://；生产环境请使用 https://。',
    );
  }
  if (uri.userInfo.isNotEmpty) {
    throw const DavError(
      DavErrorCode.invalidUrl,
      'Credentials must not be embedded in the URL',
      hint: '请把用户名和密码放在 username / password 参数，不要写进 URL。',
    );
  }
  final segments = List<String>.from(uri.pathSegments);
  if (segments.isEmpty || segments.last.isNotEmpty) segments.add('');
  final normalized = Uri(
    scheme: uri.scheme,
    host: uri.host,
    port: uri.hasPort ? uri.port : null,
    pathSegments: segments,
  );
  return NormalizedBaseUrl(
    href: normalized.toString(),
    uri: normalized,
    path: _decodedPathFromUri(normalized),
  );
}

/// Decode only when the value actually contains `%XX`; raw Unicode must be
/// passed through because Dart's decoder rejects non-ASCII literals.
String safeDecodeComponent(String value) {
  if (!RegExp(r'%[0-9A-Fa-f]{2}').hasMatch(value)) return value;
  try {
    return Uri.decodeComponent(value);
  } catch (_) {
    return value;
  }
}

String _decodeInputPath(String value) => safeDecodeComponent(value);

String normalizePath(
  String input, {
  bool collection = false,
  bool decodeInput = true,
}) {
  if (input.contains('\u0000')) {
    throw const DavError(DavErrorCode.invalidPath, 'Path contains a NUL byte');
  }
  if (input.contains('\\')) {
    throw const DavError(
      DavErrorCode.invalidPath,
      'Path contains a backslash',
      hint: 'WebDAV 路径使用 /；文件名中的反斜杠需要由调用方转义或避免。',
    );
  }
  final value = decodeInput ? _decodeInputPath(input.trim()) : input.trim();
  final hadTrailingSlash = value.endsWith('/');
  final segments = <String>[];
  for (final segment in value.split('/')) {
    if (segment.isEmpty || segment == '.') continue;
    if (segment == '..') {
      throw const DavError(
        DavErrorCode.invalidPath,
        'Path must not contain ".." segments',
        hint: 'SDK 只接受账号根目录下的相对路径。',
      );
    }
    segments.add(unorm.nfc(segment));
  }
  var result = '/${segments.join('/')}';
  if ((collection || hadTrailingSlash) && result != '/') result += '/';
  return result;
}

String encodePath(String path) {
  final normalized = normalizePath(path, decodeInput: false);
  final trailing = normalized.endsWith('/') && normalized != '/';
  final encoded = normalized
      .split('/')
      .where((segment) => segment.isNotEmpty)
      .map(Uri.encodeComponent)
      .join('/');
  return '/$encoded${trailing ? '/' : ''}';
}

String joinUrl(String baseHref, String encodedPath) {
  final suffix = encodedPath.startsWith('/') ? encodedPath.substring(1) : encodedPath;
  return '$baseHref$suffix';
}

String buildUrl(NormalizedBaseUrl base, String path) =>
    joinUrl(base.href, encodePath(path));

String nameFromPath(String path) {
  final clean = path.replaceAll(RegExp(r'/+$'), '');
  if (clean.isEmpty) return '';
  final index = clean.lastIndexOf('/');
  return clean.substring(index + 1);
}

bool isRootPath(String path) =>
    normalizePath(path, decodeInput: false) == '/';

List<String> parentPaths(String path) {
  final normalized =
      normalizePath(path, decodeInput: false).replaceAll(RegExp(r'/+$'), '');
  final parts = normalized.split('/').where((part) => part.isNotEmpty).toList();
  return <String>[
    for (var i = 1; i < parts.length; i++) '/${parts.take(i).join('/')}',
  ];
}

bool pathsEqual(String a, String b) {
  String norm(String value) {
    final normalized = normalizePath(value, decodeInput: false);
    return normalized == '/'
        ? normalized
        : normalized.replaceAll(RegExp(r'/+$'), '');
  }

  return norm(a) == norm(b);
}

String _decodeHref(String href) => hrefPath(href);

/// Decoded pathname of an href, without resolving it against a base.
String hrefPath(String href) {
  final raw = href.trim();
  if (RegExp(r'^[a-z][a-z0-9+.-]*://', caseSensitive: false).hasMatch(raw)) {
    final uri = Uri.tryParse(raw);
    if (uri != null) return _decodedPathFromUri(uri);
  }
  var path = raw;
  final cut = path.indexOf(RegExp(r'[?#]'));
  if (cut >= 0) path = path.substring(0, cut);
  return safeDecodeComponent(path);
}

/// Resolve a PROPFIND href to a path relative to the account root.
String pathFromHref(String href, String basePath, String requestPath) {
  final decoded = _decodeHref(href);
  final base = basePath.endsWith('/') ? basePath : '$basePath/';
  if (decoded == base.substring(0, base.length - 1)) return '/';
  if (decoded.startsWith(base)) {
    return normalizePath(
      '/${decoded.substring(base.length)}',
      decodeInput: false,
    );
  }
  final request = normalizePath(requestPath, decodeInput: false);
  final candidates = request == '/'
      ? <String>[]
      : <String>[request, request.replaceAll(RegExp(r'/+$'), '')];
  for (final candidate in candidates) {
    if (candidate.isEmpty) continue;
    final index = decoded.indexOf(candidate);
    if (index < 0) continue;
    final after = index + candidate.length < decoded.length
        ? decoded[index + candidate.length]
        : null;
    if (after == null || after == '/') {
      return normalizePath(decoded.substring(index), decodeInput: false);
    }
  }
  return normalizePath(
    decoded.startsWith('/') ? decoded : '/$decoded',
    decodeInput: false,
  );
}

int? parseContentLength(String? value) {
  if (value == null) return null;
  final length = int.tryParse(value);
  return length != null && length >= 0 ? length : null;
}
