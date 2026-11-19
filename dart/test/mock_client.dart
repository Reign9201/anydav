import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class MockDavFile {
  MockDavFile({
    required this.data,
    required this.contentType,
    required this.etag,
    required this.mtime,
  });

  final List<int> data;
  final String contentType;
  final String etag;
  final DateTime mtime;
}

String canonicalDir(String value) {
  var path = value.startsWith('/') ? value : '/$value';
  path = path.replaceAll(RegExp(r'/{2,}'), '/');
  if (!path.endsWith('/')) path += '/';
  return path;
}

String canonicalFile(String value) {
  var path = value.startsWith('/') ? value : '/$value';
  path = path.replaceAll(RegExp(r'/{2,}'), '/');
  return path.replaceAll(RegExp(r'/+$'), '');
}

String parentDir(String path) {
  final trimmed = path.replaceAll(RegExp(r'/+$'), '');
  final index = trimmed.lastIndexOf('/');
  return index <= 0 ? '/' : '${trimmed.substring(0, index)}/';
}

String baseName(String path) {
  final trimmed = path.replaceAll(RegExp(r'/+$'), '');
  final index = trimmed.lastIndexOf('/');
  return trimmed.substring(index + 1);
}

String encodeHref(String path) {
  final trailing = path.endsWith('/');
  final parts = path
      .split('/')
      .where((segment) => segment.isNotEmpty)
      .map(Uri.encodeComponent)
      .join('/');
  return '/$parts${trailing && parts.isNotEmpty ? '/' : ''}';
}

String xmlEscape(String value) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

/// In-memory WebDAV server exposed as an [http.Client], so the client tests do
/// not need sockets and run on every platform Dart supports.
class MockDav {
  MockDav({
    this.username = 'alice',
    this.password = 'secret',
    String basePath = '/dav/',
    this.quotaAvailable,
    this.quotaUsed,
    this.pathMapFrom = '',
    this.pathMapTo = '',
  }) : basePath = canonicalDir(basePath) {
    dirs.add('/');
    _ensureDirs(this.basePath);
  }

  final String username;
  final String password;
  final String basePath;
  final int? quotaAvailable;
  final int? quotaUsed;

  /// Optional rewrite from the URL the client requested to the simulated
  /// upstream path, used to model a same-origin proxy.
  final String pathMapFrom;
  final String pathMapTo;
  final Set<String> dirs = <String>{};
  final Map<String, MockDavFile> files = <String, MockDavFile>{};
  final List<String> log = <String>[];

  final Map<int, int> _failures = <int, int>{};
  int _revision = 0;

  String get url => 'http://mock.local$basePath';

  http.Client get client => MockClient(_handle);

  void failNext(int status, {int count = 1}) {
    _failures[status] = (_failures[status] ?? 0) + count;
  }

  int countRequests(String method) =>
      log.where((entry) => entry.startsWith('$method ')).length;

  void resetLog() => log.clear();

  MockDavFile seedFile(String path, String data, {String contentType = 'text/plain; charset=utf-8'}) {
    final filePath = canonicalFile(path);
    _ensureDirs(parentDir(filePath));
    final file = _makeFile(utf8.encode(data), contentType);
    files[filePath] = file;
    return file;
  }

  void seedDir(String path) => _ensureDirs(canonicalDir(path));

  void _ensureDirs(String dir) {
    final parts = canonicalDir(dir).split('/').where((part) => part.isNotEmpty);
    var current = '/';
    dirs.add(current);
    for (final part in parts) {
      current = '$current$part/';
      dirs.add(current);
    }
  }

  MockDavFile _makeFile(List<int> data, String contentType) {
    _revision++;
    return MockDavFile(
      data: data,
      contentType: contentType,
      etag: '"mock-$_revision-${data.length}"',
      mtime: DateTime.now().toUtc(),
    );
  }

  String? _header(http.Request request, String name) {
    final wanted = name.toLowerCase();
    for (final entry in request.headers.entries) {
      if (entry.key.toLowerCase() == wanted) return entry.value;
    }
    return null;
  }

  bool _authorized(http.Request request) {
    final header = _header(request, 'authorization');
    if (header == null || !header.startsWith('Basic ')) return false;
    try {
      return utf8.decode(base64Decode(header.substring(6))) == '$username:$password';
    } catch (_) {
      return false;
    }
  }

  Future<http.Response> _handle(http.Request request) async {
    final method = request.method.toUpperCase();
    var path = Uri.decodeComponent(request.url.path);
    if (pathMapFrom.isNotEmpty && path.startsWith(pathMapFrom)) {
      path = '$pathMapTo${path.substring(pathMapFrom.length)}';
    }
    log.add('$method $path');
    final failure = () {
      for (final entry in _failures.entries) {
        if (entry.value > 0) return entry;
      }
      return null;
    }();
    if (failure != null) {
      _failures[failure.key] = failure.value - 1;
      return _send(request, failure.key, body: utf8.encode('injected failure'));
    }
    if (!_authorized(request)) {
      return _send(
        request,
        401,
        headers: <String, String>{'www-authenticate': 'Basic realm="mock"'},
        body: utf8.encode('unauthorized'),
      );
    }

    final dirPath = canonicalDir(path);
    final filePath = canonicalFile(path);
    final isDirPath = path.endsWith('/');

    switch (method) {
      case 'OPTIONS':
        return _send(request, 200, headers: <String, String>{
          'dav': '1, 2',
          'allow': 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, MKCOL, MOVE, COPY',
        });
      case 'PROPFIND':
        final dir = dirs.contains(dirPath) ? dirPath : null;
        final file = files.containsKey(filePath) ? filePath : null;
        if (dir == null && file == null) {
          return _send(request, 404, body: utf8.encode('not found'));
        }
        final depth = _header(request, 'depth') == '0' ? 0 : 1;
        final entries = <_Entry>[
          if (dir != null) _Entry(dir, true) else _Entry(file!, false),
          if (depth == 1 && dir != null) ..._children(dir),
        ];
        return _send(
          request,
          207,
          headers: <String, String>{'content-type': 'application/xml; charset=utf-8'},
          body: utf8.encode(_multistatus(entries)),
        );
      case 'MKCOL':
        if (dirs.contains(dirPath) || files.containsKey(filePath)) {
          return _send(request, 405, body: utf8.encode('exists'));
        }
        if (!dirs.contains(parentDir(dirPath))) {
          return _send(request, 409, body: utf8.encode('parent missing'));
        }
        dirs.add(dirPath);
        return _send(request, 201, body: utf8.encode('created'));
      case 'PUT':
        if (isDirPath) return _send(request, 405, body: utf8.encode('cannot PUT'));
        if (!dirs.contains(parentDir(filePath))) {
          return _send(request, 409, body: utf8.encode('parent missing'));
        }
        final existing = files[filePath];
        if (_header(request, 'if-none-match') == '*' && existing != null) {
          return _send(request, 412, body: utf8.encode('exists'));
        }
        final ifMatch = _header(request, 'if-match');
        if (ifMatch != null && (existing == null || ifMatch.trim() != existing.etag)) {
          return _send(request, 412, body: utf8.encode('etag mismatch'));
        }
        final file = _makeFile(
          request.bodyBytes,
          _header(request, 'content-type') ?? 'application/octet-stream',
        );
        files[filePath] = file;
        return _send(
          request,
          existing == null ? 201 : 204,
          headers: <String, String>{'etag': file.etag},
        );
      case 'GET':
      case 'HEAD':
        if (dirs.contains(dirPath)) {
          return _send(request, 405, body: utf8.encode('cannot GET'));
        }
        final file = files[filePath];
        if (file == null) return _send(request, 404, body: utf8.encode('not found'));
        final ifNoneMatch = _header(request, 'if-none-match');
        if (ifNoneMatch != null && ifNoneMatch.trim() == file.etag) {
          return _send(request, 304, headers: <String, String>{'etag': file.etag});
        }
        var data = file.data;
        var status = 200;
        final headers = <String, String>{
          'etag': file.etag,
          'content-type': file.contentType,
          'last-modified': file.mtime.toUtc().toIso8601String(),
          'accept-ranges': 'bytes',
        };
        final range = _header(request, 'range');
        if (range != null) {
          final match = RegExp(r'^bytes=(\d+)-(\d*)$').firstMatch(range);
          if (match != null) {
            final start = int.parse(match.group(1)!);
            final end = match.group(2)!.isEmpty
                ? file.data.length - 1
                : int.parse(match.group(2)!);
            data = file.data.sublist(start, end + 1);
            status = 206;
            headers['content-range'] = 'bytes $start-$end/${file.data.length}';
          }
        }
        return _send(
          request,
          status,
          headers: headers,
          body: method == 'HEAD' ? const <int>[] : data,
        );
      case 'DELETE':
        final dir = dirs.contains(dirPath) ? dirPath : null;
        final file = files.containsKey(filePath) ? filePath : null;
        if (dir == null && file == null) {
          return _send(request, 404, body: utf8.encode('not found'));
        }
        if (dir != null) _deleteDir(dir);
        if (file != null) files.remove(file);
        return _send(request, 204);
      case 'MOVE':
      case 'COPY':
        final sourceDir = dirs.contains(dirPath) ? dirPath : null;
        final sourceFile = files.containsKey(filePath) ? filePath : null;
        if (sourceDir == null && sourceFile == null) {
          return _send(request, 404, body: utf8.encode('not found'));
        }
        final destination = _header(request, 'destination');
        if (destination == null || destination.isEmpty) {
          return _send(request, 400, body: utf8.encode('missing destination'));
        }
        final destinationUri = Uri.parse(destination);
        var destinationPath = Uri.decodeComponent(destinationUri.path);
        if (pathMapFrom.isNotEmpty && destinationPath.startsWith(pathMapFrom)) {
          destinationPath =
              '$pathMapTo${destinationPath.substring(pathMapFrom.length)}';
        }
        final destinationDir = canonicalDir(destinationPath);
        final destinationFile = canonicalFile(destinationPath);
        final destinationExists =
            dirs.contains(destinationDir) || files.containsKey(destinationFile);
        if (destinationExists && _header(request, 'overwrite') == 'F') {
          return _send(request, 412, body: utf8.encode('destination exists'));
        }
        final destinationParent = parentDir(
          destinationPath.endsWith('/') ? destinationDir : destinationFile,
        );
        if (!dirs.contains(destinationParent)) {
          return _send(request, 409, body: utf8.encode('destination parent missing'));
        }
        if (sourceDir != null) {
          _copyDir(sourceDir, destinationDir);
          if (method == 'MOVE') _deleteDir(sourceDir);
        } else {
          final file = files[sourceFile]!;
          files[destinationFile] = MockDavFile(
            data: file.data,
            contentType: file.contentType,
            etag: file.etag,
            mtime: DateTime.now().toUtc(),
          );
          if (method == 'MOVE') files.remove(sourceFile);
        }
        return _send(request, destinationExists ? 204 : 201);
      default:
        return _send(request, 405, body: utf8.encode('method not allowed'));
    }
  }

  http.Response _send(
    http.Request request,
    int status, {
    Map<String, String> headers = const <String, String>{},
    List<int>? body,
  }) =>
      http.Response.bytes(
        body ?? const <int>[],
        status,
        headers: headers,
        request: request,
      );

  List<_Entry> _children(String dir) {
    final result = <_Entry>[];
    final prefix = canonicalDir(dir);
    for (final candidate in dirs) {
      if (candidate == prefix || !candidate.startsWith(prefix)) continue;
      final rest = candidate.substring(prefix.length).replaceAll(RegExp(r'/$'), '');
      if (rest.isNotEmpty && !rest.contains('/')) {
        result.add(_Entry(candidate, true));
      }
    }
    for (final candidate in files.keys) {
      if (!candidate.startsWith(prefix)) continue;
      final rest = candidate.substring(prefix.length);
      if (rest.isNotEmpty && !rest.contains('/')) {
        result.add(_Entry(candidate, false));
      }
    }
    return result;
  }

  String _multistatus(List<_Entry> entries) {
    final parts = <String>[
      '<?xml version="1.0" encoding="utf-8"?>',
      '<d:multistatus xmlns:d="DAV:">',
    ];
    for (final entry in entries) {
      final file = entry.isDir ? null : files[entry.path];
      final props = <String>[
        '<d:resourcetype>${entry.isDir ? '<d:collection/>' : ''}</d:resourcetype>',
        '<d:displayname>${xmlEscape(baseName(entry.path))}</d:displayname>',
        if (file != null) ...[
          '<d:getetag>${xmlEscape(file.etag)}</d:getetag>',
          '<d:getcontentlength>${file.data.length}</d:getcontentlength>',
          '<d:getlastmodified>${file.mtime.toUtc().toIso8601String()}</d:getlastmodified>',
          '<d:getcontenttype>${xmlEscape(file.contentType)}</d:getcontenttype>',
        ],
        if (entry.isDir && quotaAvailable != null) ...[
          '<d:quota-available-bytes>$quotaAvailable</d:quota-available-bytes>',
          '<d:quota-used-bytes>${quotaUsed ?? 0}</d:quota-used-bytes>',
        ],
      ];
      parts
        ..add('<d:response>')
        ..add('<d:href>${xmlEscape(encodeHref(entry.path))}</d:href>')
        ..add('<d:propstat><d:prop>')
        ..add(props.join())
        ..add('</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>')
        ..add('</d:response>');
    }
    parts.add('</d:multistatus>');
    return parts.join();
  }

  void _deleteDir(String dir) {
    final prefix = canonicalDir(dir);
    dirs.removeWhere((candidate) => candidate.startsWith(prefix));
    files.removeWhere((candidate, _) => candidate.startsWith(prefix));
  }

  void _copyDir(String source, String destination) {
    final sourcePrefix = canonicalDir(source);
    final destinationPrefix = canonicalDir(destination);
    final newDirs = <String>{
      for (final candidate in dirs)
        if (candidate.startsWith(sourcePrefix))
          '$destinationPrefix${candidate.substring(sourcePrefix.length)}',
    };
    dirs.addAll(newDirs);
    dirs.add(destinationPrefix);
    final newFiles = <String, MockDavFile>{
      for (final entry in files.entries)
        if (entry.key.startsWith(sourcePrefix))
          '$destinationPrefix${entry.key.substring(sourcePrefix.length)}': entry.value,
    };
    files.addAll(newFiles);
  }
}

class _Entry {
  const _Entry(this.path, this.isDir);

  final String path;
  final bool isDir;
}
