import 'dart:collection';
import 'dart:convert';

import 'client.dart';
import 'errors.dart';
import 'paths.dart';
import 'types.dart';

/// Optional multi-device JSON sync built on the transport client.
///
/// Every device writes only its own `<deviceId>.json` file into a shared
/// folder; a round lists the folder, downloads files whose ETag changed, hands
/// every state to the caller's merge function, and uploads the merged state
/// back to its own file when the fingerprint changed.
class RemoteState<T> {
  const RemoteState({
    required this.deviceId,
    required this.fileName,
    required this.state,
    this.etag,
  });

  final String deviceId;
  final String fileName;
  final T state;
  final String? etag;
}

class MergeContext<T> {
  const MergeContext({
    required this.local,
    required this.remotes,
    required this.now,
  });

  final T? local;
  final List<RemoteState<T>> remotes;
  final DateTime now;
}

class SyncCacheSnapshot {
  const SyncCacheSnapshot({
    required this.etags,
    required this.states,
    required this.uploaded,
  });

  final Map<String, String> etags;
  final Map<String, Object?> states;
  final Map<String, String> uploaded;
}

abstract class SyncCache {
  String? getEtag(String key);
  void setEtag(String key, String etag);
  bool hasState(String key);
  Object? getState(String key);
  void setState(String key, Object? state);
  String? getUploaded(String key);
  void setUploaded(String key, String fingerprint);
  SyncCacheSnapshot snapshot();
}

class MemorySyncCache implements SyncCache {
  final Map<String, String> _etags = <String, String>{};
  final Map<String, Object?> _states = <String, Object?>{};
  final Map<String, String> _uploaded = <String, String>{};

  @override
  String? getEtag(String key) => _etags[key];

  @override
  void setEtag(String key, String etag) => _etags[key] = etag;

  @override
  bool hasState(String key) => _states.containsKey(key);

  @override
  Object? getState(String key) => _states[key];

  @override
  void setState(String key, Object? state) => _states[key] = state;

  @override
  String? getUploaded(String key) => _uploaded[key];

  @override
  void setUploaded(String key, String fingerprint) => _uploaded[key] = fingerprint;

  @override
  SyncCacheSnapshot snapshot() => SyncCacheSnapshot(
        etags: Map<String, String>.from(_etags),
        states: Map<String, Object?>.from(_states),
        uploaded: Map<String, String>.from(_uploaded),
      );

  void restore(SyncCacheSnapshot snapshot) {
    _etags.addAll(snapshot.etags);
    _states.addAll(snapshot.states);
    _uploaded.addAll(snapshot.uploaded);
  }
}

String stableStringify(Object? value) {
  final seen = HashSet<Object>.identity();

  Object? sort(Object? node) {
    if (node == null || node is num || node is bool || node is String) {
      return node;
    }
    if (node is List) {
      if (seen.contains(node)) {
        throw const DavError(
          DavErrorCode.parse,
          'Cannot fingerprint a cyclic value',
        );
      }
      seen.add(node);
      try {
        return node.map(sort).toList(growable: false);
      } finally {
        seen.remove(node);
      }
    }
    if (node is Map) {
      if (seen.contains(node)) {
        throw const DavError(
          DavErrorCode.parse,
          'Cannot fingerprint a cyclic value',
        );
      }
      seen.add(node);
      try {
        final keys = node.keys.map((key) => '$key').toList()..sort();
        return <String, Object?>{
          for (final key in keys) key: sort(node[key]),
        };
      } finally {
        seen.remove(node);
      }
    }
    return node;
  }

  return jsonEncode(sort(value));
}

typedef SyncMerge<T> = T Function(MergeContext<T> context);
typedef SyncEncode<T> = String Function(T state);
typedef SyncDecode<T> = T Function(String text, DavResource resource);
typedef SyncFingerprint<T> = String Function(T state);

class JsonSyncOptions<T> {
  const JsonSyncOptions({
    required this.client,
    required this.deviceId,
    required this.merge,
    this.folder = '/',
    this.extension = '.json',
    this.fingerprint,
    this.encode,
    this.decode,
    this.cache,
    this.maxConflictRetries = 1,
    this.skipInvalid = true,
  });

  final WebDavClient client;
  final String folder;
  final String deviceId;
  final String extension;
  final SyncMerge<T> merge;
  final SyncFingerprint<T>? fingerprint;
  final SyncEncode<T>? encode;
  final SyncDecode<T>? decode;
  final SyncCache? cache;
  final int maxConflictRetries;
  final bool skipInvalid;
}

class SyncResult<T> {
  const SyncResult({
    required this.state,
    required this.uploaded,
    required this.downloaded,
    required this.devices,
    required this.skipped,
    required this.syncedAt,
    this.etag,
  });

  final T state;
  final bool uploaded;
  final List<String> downloaded;
  final List<String> devices;
  final List<String> skipped;
  final DateTime syncedAt;
  final String? etag;
}

final RegExp _deviceIdPattern = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$');
final RegExp _extensionPattern = RegExp(r'^\.[A-Za-z0-9._-]{1,16}$');

class JsonSyncEngine<T> {
  JsonSyncEngine(this.options)
      : folder = normalizePath(options.folder, collection: true),
        _fingerprint = options.fingerprint ?? stableStringify,
        _encode = options.encode ?? jsonEncode,
        _decode = options.decode ??
            ((text, resource) {
              try {
                return jsonDecode(text) as T;
              } catch (error) {
                throw DavError(
                  DavErrorCode.parse,
                  'Remote sync file is not valid JSON',
                  responseBody: text.length > 500 ? text.substring(0, 500) : text,
                  cause: error,
                );
              }
            }) {
    if (!_deviceIdPattern.hasMatch(options.deviceId)) {
      throw DavError(
        DavErrorCode.invalidPath,
        'Invalid deviceId: ${options.deviceId}',
        hint: 'deviceId 只能包含字母、数字、点、下划线和连字符，长度 1–64。',
      );
    }
    if (!_extensionPattern.hasMatch(options.extension)) {
      throw DavError(
        DavErrorCode.invalidPath,
        'Invalid sync file extension: ${options.extension}',
      );
    }
    _cache = options.cache ?? MemorySyncCache();
    _namespace = '${options.client.baseUrl}$folder';
  }

  final JsonSyncOptions<T> options;
  final String folder;
  final SyncFingerprint<T> _fingerprint;
  final SyncEncode<T> _encode;
  final SyncDecode<T> _decode;
  late final SyncCache _cache;
  late final String _namespace;

  String _cacheKey(String name) => '$_namespace$name';

  String get _uploadedKey => '$_namespace::${options.deviceId}';

  Future<SyncResult<T>> sync(T? local, {bool dryRun = false}) async {
    for (var conflictAttempt = 0;; conflictAttempt++) {
      try {
        return await _round(local, dryRun);
      } on DavError catch (error) {
        if (error.status == 412 && conflictAttempt < options.maxConflictRetries) {
          continue;
        }
        rethrow;
      }
    }
  }

  Future<SyncResult<T>> _round(T? local, bool dryRun) async {
    await options.client.mkdir(folder, recursive: true);
    final resources = await options.client.list(folder);
    final ownName = '${options.deviceId}${options.extension}';
    DavResource? own;
    for (final resource in resources) {
      if (!resource.isCollection && resource.name == ownName) {
        own = resource;
        break;
      }
    }
    final remotes = <RemoteState<T>>[];
    final downloaded = <String>[];
    final skipped = <String>[];
    final devices = <String>[];

    for (final resource in resources) {
      if (resource.isCollection) continue;
      if (!resource.name.endsWith(options.extension)) continue;
      if (resource.name == ownName) continue;
      final deviceId =
          resource.name.substring(0, resource.name.length - options.extension.length);
      devices.add(deviceId);
      final key = _cacheKey(resource.name);
      final cachedEtag = _cache.getEtag(key);
      if (resource.etag != null &&
          cachedEtag != null &&
          cachedEtag == resource.etag &&
          _cache.hasState(key)) {
        final cached = _cache.getState(key);
        if (cached != null) {
          remotes.add(RemoteState<T>(
            deviceId: deviceId,
            fileName: resource.name,
            state: cached as T,
            etag: resource.etag,
          ));
          continue;
        }
      }
      try {
        final text = await options.client.readText(resource.path);
        final state = _decode(text, resource);
        if (resource.etag != null) {
          _cache.setEtag(key, resource.etag!);
          _cache.setState(key, state);
        }
        remotes.add(RemoteState<T>(
          deviceId: deviceId,
          fileName: resource.name,
          state: state,
          etag: resource.etag,
        ));
        downloaded.add(resource.name);
      } on DavError catch (error) {
        final skippable = error.code == DavErrorCode.parse ||
            error.code == DavErrorCode.notFound;
        if (options.skipInvalid && skippable) {
          skipped.add(resource.name);
          continue;
        }
        rethrow;
      }
    }

    final now = DateTime.now();
    final merged = options.merge(
      MergeContext<T>(local: local, remotes: remotes, now: now),
    );
    final fingerprint = _fingerprint(merged);
    final uploadedBefore = _cache.getUploaded(_uploadedKey);
    var uploaded = false;
    var etag = own?.etag;

    if (uploadedBefore != fingerprint && !dryRun) {
      final ownPath = normalizePath('$folder$ownName');
      final result = await options.client.writeText(
        ownPath,
        _encode(merged),
        contentType: 'application/json; charset=utf-8',
        ifMatch: own?.etag,
        createParents: true,
      );
      uploaded = true;
      etag = result.etag ?? etag;
      _cache.setUploaded(_uploadedKey, fingerprint);
      if (etag != null) {
        _cache.setEtag(_cacheKey(ownName), etag);
        _cache.setState(_cacheKey(ownName), merged);
      }
    }

    devices.sort();
    return SyncResult<T>(
      state: merged,
      uploaded: uploaded,
      downloaded: downloaded,
      devices: devices,
      skipped: skipped,
      syncedAt: now,
      etag: etag,
    );
  }
}

JsonSyncEngine<T> createJsonSync<T>(JsonSyncOptions<T> options) =>
    JsonSyncEngine<T>(options);
