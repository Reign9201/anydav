import 'dart:convert';

import 'package:http/http.dart' as http;

import 'auth.dart';
import 'errors.dart';
import 'paths.dart';
import 'providers.dart';
import 'transport.dart';
import 'types.dart';
import 'xml.dart';

class _RequestResult {
  const _RequestResult(this.response, this.uri);

  final DavHttpResponse response;
  final Uri uri;
}

const Set<int> _retryableStatus = <int>{429, 502, 503, 504};

class WebDavClient {
  WebDavClient({
    required String baseUrl,
    String? username,
    String? password,
    String? provider,
    AuthScheme? auth,
    String? token,
    http.Client? httpClient,
    Duration timeout = const Duration(seconds: 30),
    int retries = 2,
    Duration retryDelay = const Duration(milliseconds: 300),
    Duration maxRetryDelay = const Duration(seconds: 10),
    bool autoCreateParents = true,
    Map<String, String>? headers,
    String? userAgent,
  })  : base = normalizeBaseUrl(baseUrl),
        _timeout = timeout,
        _retries = retries,
        _retryDelayMs = retryDelay.inMilliseconds,
        _maxRetryDelayMs = maxRetryDelay.inMilliseconds,
        _autoCreateParents = autoCreateParents,
        _ownsHttpClient = httpClient == null,
        _http = httpClient ?? http.Client() {
    if (timeout <= Duration.zero) {
      throw const DavError(
        DavErrorCode.invalidUrl,
        'timeout must be positive',
      );
    }
    if (retries < 0) {
      throw const DavError(
        DavErrorCode.invalidUrl,
        'retries must be non-negative',
      );
    }
    final resolved = resolveProvider(provider, base.href);
    this.provider = resolved.provider;
    providerMatch = resolved.match;
    final selectedScheme = auth ?? this.provider.auth.scheme;
    if (selectedScheme == AuthScheme.bearer && (token == null || token.isEmpty)) {
      throw const DavError(
        DavErrorCode.unauthorized,
        'Bearer auth requires a token',
      );
    }
    _auth = WebDavAuth(
      AuthOptions(
        scheme: selectedScheme,
        username: username,
        password: password,
        token: token,
      ),
    );
    _defaultHeaders = <String, String>{
      'user-agent': userAgent ?? 'anydav/0.1.0',
      ...?headers,
    };
    _createdDirs.add('/');
  }

  static const String defaultExtension = '.json';

  final NormalizedBaseUrl base;
  late final ProviderPreset provider;
  late final ProviderMatch providerMatch;
  late final WebDavAuth _auth;

  final http.Client _http;
  final bool _ownsHttpClient;
  final Duration _timeout;
  final int _retries;
  final int _retryDelayMs;
  final int _maxRetryDelayMs;
  final bool _autoCreateParents;
  final Set<String> _createdDirs = <String>{};
  late final Map<String, String> _defaultHeaders;

  String get baseUrl => base.href;

  AuthScheme get authScheme => _auth.scheme;

  // --------------------------------------------------------------- transport

  Future<_RequestResult> _request(
    String method,
    String path, {
    List<int>? body,
    Map<String, String>? headers,
    Set<int>? acceptStatuses,
    ProviderPreset? overrideProvider,
  }) async {
    final uri = Uri.parse(buildUrl(base, path));
    final accepted = acceptStatuses;
    var attempt = 0;
    var digestRetried = false;

    for (;;) {
      final authHeaders = _auth.initialHeader(method, uri);
      DavHttpResponse response;
      try {
        response = await fetchOnce(
          client: _http,
          method: method,
          uri: uri,
          headers: <String, String>{
            ..._defaultHeaders,
            ...authHeaders,
            ...?headers,
          },
          body: body,
          timeout: _timeout,
          provider: overrideProvider ?? provider,
        );
      } on DavError catch (error) {
        if (error.retryable && isIdempotent(method) && attempt < _retries) {
          await delay(Duration(
            milliseconds: backoffDelayMs(attempt, _retryDelayMs, _maxRetryDelayMs),
          ));
          attempt++;
          continue;
        }
        rethrow;
      }

      if (response.status == 401 &&
          _auth.scheme == AuthScheme.digest &&
          !digestRetried) {
        final challenged = _auth.challengeHeader(
          method,
          uri,
          response.header('www-authenticate'),
        );
        if (challenged != null) {
          digestRetried = true;
          continue;
        }
      }

      final acceptedNow = accepted == null
          ? (response.status >= 200 && response.status < 300)
          : accepted.contains(response.status);
      if (acceptedNow) return _RequestResult(response, uri);

      if (_retryableStatus.contains(response.status) &&
          isIdempotent(method) &&
          attempt < _retries) {
        final retryAfter = parseRetryAfter(response.header('retry-after'));
        if (retryAfter != null &&
            retryAfter.inMilliseconds > _maxRetryDelayMs) {
          throw errorFromStatus(
            response.status,
            method: method,
            url: uri.toString(),
            provider: overrideProvider ?? provider,
            retryAfter: response.header('retry-after'),
            body: _truncate(response.text),
          );
        }
        await delay(retryAfter ??
            Duration(
              milliseconds:
                  backoffDelayMs(attempt, _retryDelayMs, _maxRetryDelayMs),
            ));
        attempt++;
        continue;
      }

      throw errorFromStatus(
        response.status,
        method: method,
        url: uri.toString(),
        provider: overrideProvider ?? provider,
        retryAfter: response.header('retry-after'),
        body: _truncate(response.text),
      );
    }
  }

  String _truncate(String value) =>
      value.length > 2048 ? value.substring(0, 2048) : value;

  Future<_RequestResult> _propfind(String path, int depth) => _request(
        'PROPFIND',
        path,
        headers: <String, String>{
          'depth': '$depth',
          'content-type': 'application/xml; charset=utf-8',
        },
        body: utf8.encode(buildPropfindBody()),
        acceptStatuses: const <int>{200, 207, 404},
      );

  DavResource _toResource(
    RawDavResponse raw,
    String requestPath,
    String basePath,
  ) {
    final path = normalizePath(
      pathFromHref(raw.href, basePath, requestPath),
      collection: raw.isCollection,
      decodeInput: false,
    );
    return DavResource(
      href: raw.href,
      path: path,
      name: nameFromPath(path),
      isCollection: raw.isCollection,
      etag: raw.props['getetag'],
      size: parseContentLength(raw.props['getcontentlength']),
      lastModified: parseHttpDate(raw.props['getlastmodified']),
      contentType: raw.props['getcontenttype'],
      displayName: raw.props['displayname'],
      quotaAvailableBytes: raw.quotaAvailableBytes,
      quotaUsedBytes: raw.quotaUsedBytes,
      status: raw.status,
    );
  }

  /// Account root as seen in hrefs. Normally `base.path`, but a same-origin
  /// proxy or reverse proxy may map the account elsewhere; the self entry in a
  /// PROPFIND response is authoritative.
  String _effectiveBasePath(List<RawDavResponse> raws, String requestPath) {
    final target =
        normalizePath(requestPath, collection: true, decodeInput: false);
    final targetWithoutSlash = target.replaceAll(RegExp(r'/+$'), '');
    String? best;
    for (final raw in raws) {
      var candidate = hrefPath(raw.href);
      if (!candidate.startsWith('/')) candidate = '/$candidate';
      candidate =
          normalizePath(candidate, collection: true, decodeInput: false);
      final matches = target == '/'
          ? candidate.endsWith('/')
          : candidate.endsWith(target) || candidate.endsWith(targetWithoutSlash);
      if (!matches) continue;
      if (best == null || candidate.length < best.length) best = candidate;
    }
    if (best == null) return base.path;
    if (target == '/') return best;
    final matched = best.endsWith(target) ? target : targetWithoutSlash;
    final prefix = best.substring(0, best.length - matched.length);
    return prefix.endsWith('/') ? prefix : '$prefix/';
  }

  List<DavResource> _parseResources(List<int> body, String requestPath) {
    final raws = parseMultiStatus(utf8.decode(body, allowMalformed: true));
    final basePath = _effectiveBasePath(raws, requestPath);
    final result = <DavResource>[];
    final seen = <String>{};
    for (final raw in raws) {
      if (raw.status >= 400 &&
          raw.propstatStatuses.every((status) => status >= 400)) {
        continue;
      }
      final resource = _toResource(raw, requestPath, basePath);
      final key = resource.path.replaceAll(RegExp(r'/+$'), '');
      if (seen.add(key)) result.add(resource);
    }
    return result;
  }

  // ------------------------------------------------------------------ verbs

  Future<ConnectionInfo> testConnection() async {
    final stopwatch = Stopwatch()..start();
    List<String>? dav;
    var optionsUnsupported = false;
    try {
      final result = await _request(
        'OPTIONS',
        '/',
        acceptStatuses: const <int>{200, 204, 207},
      );
      _readDavHeader(result.response.header('dav'), (value) => dav = value);
    } on DavError catch (error) {
      if (error.code == DavErrorCode.methodNotAllowed ||
          error.code == DavErrorCode.notImplemented) {
        optionsUnsupported = true;
      } else {
        rethrow;
      }
    }
    final result = await _propfind('/', 0);
    if (result.response.status != 200 && result.response.status != 207) {
      throw errorFromStatus(
        result.response.status,
        method: 'PROPFIND',
        url: base.href,
        provider: provider,
        body: _truncate(result.response.text),
      );
    }
    if (dav == null) {
      _readDavHeader(result.response.header('dav'), (value) => dav = value);
    }
    stopwatch.stop();
    return ConnectionInfo(
      ok: true,
      status: result.response.status,
      provider: provider,
      baseUrl: base.href,
      latencyMs: stopwatch.elapsedMilliseconds,
      dav: dav,
      authScheme: _auth.scheme,
      optionsUnsupported: optionsUnsupported ? true : null,
    );
  }

  void _readDavHeader(String? header, void Function(List<String>) assign) {
    if (header == null) return;
    final values = header
        .split(',')
        .map((value) => value.trim())
        .where((value) => value.isNotEmpty)
        .toList(growable: false);
    if (values.isNotEmpty) assign(values);
  }

  Future<DavResource?> stat(String path) async {
    final target = normalizePath(path);
    final result = await _propfind(target, 0);
    if (result.response.status == 404) return null;
    final resources = _parseResources(result.response.body, target);
    if (resources.isEmpty) return null;
    if (resources.first.status >= 400) return null;
    return resources.first;
  }

  Future<bool> exists(String path) async => (await stat(path)) != null;

  Future<List<DavResource>> list(String path, {int depth = 1, bool? includeSelf}) async {
    final target = normalizePath(path, collection: true);
    final result = await _propfind(target, depth);
    if (result.response.status == 404) {
      throw errorFromStatus(
        404,
        method: 'PROPFIND',
        url: buildUrl(base, target),
        provider: provider,
        body: _truncate(result.response.text),
      );
    }
    final resources = _parseResources(result.response.body, target);
    final withSelf = includeSelf ?? depth == 0;
    if (withSelf) return resources;
    return resources
        .where((resource) => !pathsEqual(resource.path, target))
        .toList(growable: false);
  }

  Future<void> mkdir(String path, {bool recursive = false}) async {
    final target = normalizePath(path, collection: true);
    if (target == '/') return;
    final configured = provider.quirks?.mkdirAlreadyExistsStatuses ??
        const <int>[200, 201, 204, 301, 405];
    final accepted = configured.where((status) => status != 409).toSet();

    String parentOf(String collection) {
      final trimmed = collection.replaceAll(RegExp(r'/+$'), '');
      final index = trimmed.lastIndexOf('/');
      return index <= 0 ? '/' : '${trimmed.substring(0, index)}/';
    }

    Future<void> make(String collection) async {
      if (_createdDirs.contains(collection)) return;
      try {
        await _request(
          'MKCOL',
          collection,
          acceptStatuses: accepted,
        );
      } on DavError catch (error) {
        if (error.status == 409 &&
            configured.contains(409) &&
            _createdDirs.contains(parentOf(collection))) {
          _createdDirs.add(collection);
          return;
        }
        rethrow;
      }
      _createdDirs.add(collection);
    }

    if (recursive) {
      for (final parent in parentPaths(target)) {
        await make(parent);
      }
    }
    await make(target);
  }

  Future<void> _ensureParentDir(String path) async {
    final parent = _parentPath(path);
    if (isRootPath(parent)) return;
    await mkdir(parent, recursive: true);
  }

  String _parentPath(String path) {
    final trimmed = path.replaceAll(RegExp(r'/+$'), '');
    final index = trimmed.lastIndexOf('/');
    return index <= 0 ? '/' : trimmed.substring(0, index);
  }

  Future<WriteResult> writeFile(
    String path,
    List<int> data, {
    String? contentType,
    String? ifMatch,
    String? ifNoneMatch,
    bool? createParents,
    Map<String, String>? headers,
  }) async {
    final target = normalizePath(path);
    if (target.endsWith('/')) {
      throw const DavError(
        DavErrorCode.invalidPath,
        'Cannot PUT to a collection path',
        hint: '去掉路径末尾的 /，或改用 mkdir()。',
      );
    }
    final shouldCreateParents = createParents ?? _autoCreateParents;
    if (shouldCreateParents) {
      await _ensureParentDir(target);
    }
    final requestHeaders = <String, String>{
      'content-type': contentType ?? 'application/octet-stream',
      ...?headers,
    };
    if (ifMatch != null) requestHeaders['if-match'] = ifMatch;
    if (ifNoneMatch != null) requestHeaders['if-none-match'] = ifNoneMatch;

    Future<_RequestResult> perform() => _request(
          'PUT',
          target,
          body: data,
          headers: requestHeaders,
          acceptStatuses: const <int>{200, 201, 204},
        );

    _RequestResult result;
    try {
      result = await perform();
    } on DavError catch (error) {
      // A cached "parent exists" can be stale after external changes. Refresh
      // the parent chain once and retry the PUT.
      if (shouldCreateParents && error.code == DavErrorCode.conflict) {
        _forgetDir(_parentPath(target));
        await _ensureParentDir(target);
        result = await perform();
      } else {
        rethrow;
      }
    }
    return WriteResult(
      status: result.response.status,
      etag: result.response.header('etag'),
    );
  }

  Future<WriteResult> writeText(
    String path,
    String text, {
    String? contentType,
    String? ifMatch,
    String? ifNoneMatch,
    bool? createParents,
    Map<String, String>? headers,
  }) =>
      writeFile(
        path,
        utf8.encode(text),
        contentType: contentType ?? 'text/plain; charset=utf-8',
        ifMatch: ifMatch,
        ifNoneMatch: ifNoneMatch,
        createParents: createParents,
        headers: headers,
      );

  Future<WriteResult> writeJson(
    String path,
    Object? value, {
    String? ifMatch,
    String? ifNoneMatch,
    bool? createParents,
  }) =>
      writeText(
        path,
        jsonEncode(value),
        contentType: 'application/json; charset=utf-8',
        ifMatch: ifMatch,
        ifNoneMatch: ifNoneMatch,
        createParents: createParents,
      );

  Future<ReadResult> readFile(
    String path, {
    String? ifNoneMatch,
    int? rangeStart,
    int? rangeEnd,
  }) async {
    final target = normalizePath(path);
    final headers = <String, String>{};
    if (ifNoneMatch != null) headers['if-none-match'] = ifNoneMatch;
    if (rangeStart != null) {
      headers['range'] = 'bytes=$rangeStart-${rangeEnd ?? ''}';
    }
    final result = await _request(
      'GET',
      target,
      headers: headers,
      acceptStatuses: const <int>{200, 206, 304},
    );
    return ReadResult(
      data: result.response.status == 304 ? const <int>[] : result.response.body,
      status: result.response.status,
      notModified: result.response.status == 304,
      etag: result.response.header('etag'),
      contentType: result.response.header('content-type'),
    );
  }

  Future<String> readText(
    String path, {
    String? ifNoneMatch,
  }) async {
    final result = await readFile(path, ifNoneMatch: ifNoneMatch);
    return result.notModified
        ? ''
        : utf8.decode(result.data, allowMalformed: true);
  }

  Future<JsonReadResult> readJson(
    String path, {
    String? ifNoneMatch,
  }) async {
    ReadResult result;
    try {
      result = await readFile(path, ifNoneMatch: ifNoneMatch);
    } on DavError catch (error) {
      if (error.code == DavErrorCode.notFound) {
        return const JsonReadResult(value: null, notModified: false);
      }
      rethrow;
    }
    if (result.notModified) {
      return JsonReadResult(value: null, notModified: true, etag: result.etag);
    }
    final text = utf8.decode(result.data, allowMalformed: true);
    try {
      return JsonReadResult(
        value: jsonDecode(text),
        notModified: false,
        etag: result.etag,
      );
    } catch (error) {
      throw DavError(
        DavErrorCode.parse,
        'Remote file is not valid JSON: $path',
        url: buildUrl(base, normalizePath(path)),
        providerId: provider.id,
        responseBody: _truncate(text),
        cause: error,
      );
    }
  }

  Future<void> remove(String path) async {
    final target = normalizePath(path);
    if (target == '/') {
      throw const DavError(
        DavErrorCode.invalidPath,
        'Refusing to DELETE the WebDAV account root',
        hint: '请指定要删除的子目录或文件。',
      );
    }
    await _request('DELETE', target, acceptStatuses: const <int>{200, 202, 204});
    _forgetDir(target);
  }

  Future<bool> removeIfExists(String path) async {
    try {
      await remove(path);
      return true;
    } on DavError catch (error) {
      if (error.code == DavErrorCode.notFound) return false;
      rethrow;
    }
  }

  Future<MoveCopyResult> move(String from, String to, {bool overwrite = false}) =>
      _transfer('MOVE', from, to, overwrite);

  Future<MoveCopyResult> copy(String from, String to, {bool overwrite = false}) =>
      _transfer('COPY', from, to, overwrite);

  Future<MoveCopyResult> _transfer(
    String method,
    String from,
    String to,
    bool overwrite,
  ) async {
    final source = normalizePath(from);
    final destination = normalizePath(to);
    if (source == '/') {
      throw DavError(
        DavErrorCode.invalidPath,
        'Refusing to $method the WebDAV account root',
      );
    }
    if (destination == '/') {
      throw const DavError(
        DavErrorCode.invalidPath,
        'Destination must not be the WebDAV account root',
      );
    }
    final result = await _request(
      method,
      source,
      headers: <String, String>{
        'destination': buildUrl(base, destination),
        'overwrite': overwrite ? 'T' : 'F',
        'depth': 'infinity',
      },
      acceptStatuses: const <int>{200, 201, 204},
    );
    if (method == 'MOVE') {
      _forgetDir(source);
      _forgetDir(destination);
    }
    return MoveCopyResult(status: result.response.status);
  }

  Future<QuotaInfo?> getQuota([String path = '/']) async {
    final target = normalizePath(path);
    final result = await _propfind(target, 0);
    if (result.response.status == 404) return null;
    final resources = _parseResources(result.response.body, target);
    if (resources.isEmpty) return null;
    final resource = resources.first;
    if (resource.quotaUsedBytes == null && resource.quotaAvailableBytes == null) {
      return null;
    }
    final used = resource.quotaUsedBytes;
    final available = resource.quotaAvailableBytes;
    return QuotaInfo(
      usedBytes: used,
      availableBytes: available,
      totalBytes: used != null && available != null ? used + available : null,
    );
  }

  void _forgetDir(String path) {
    final normalized = normalizePath(path, collection: true);
    final prefix = normalized.endsWith('/') ? normalized : '$normalized/';
    _createdDirs.removeWhere(
      (dir) => dir == normalized || dir.startsWith(prefix),
    );
  }

  void close() {
    _createdDirs.clear();
    if (_ownsHttpClient) _http.close();
  }
}

WebDavClient createWebDavClient({
  required String baseUrl,
  String? username,
  String? password,
  String? provider,
  AuthScheme? auth,
  String? token,
  http.Client? httpClient,
  Duration timeout = const Duration(seconds: 30),
  int retries = 2,
  Duration retryDelay = const Duration(milliseconds: 300),
  Duration maxRetryDelay = const Duration(seconds: 10),
  bool autoCreateParents = true,
  Map<String, String>? headers,
  String? userAgent,
}) =>
    WebDavClient(
      baseUrl: baseUrl,
      username: username,
      password: password,
      provider: provider,
      auth: auth,
      token: token,
      httpClient: httpClient,
      timeout: timeout,
      retries: retries,
      retryDelay: retryDelay,
      maxRetryDelay: maxRetryDelay,
      autoCreateParents: autoCreateParents,
      headers: headers,
      userAgent: userAgent,
    );
