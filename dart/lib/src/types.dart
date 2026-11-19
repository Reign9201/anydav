/// Public data types for the Dart anydav client.
///
/// The provider registry is the aggregate layer: callers pick a provider id
/// (or let the client detect it from the URL), and the client applies that
/// provider's URL/auth/limit conventions on top of standard WebDAV.
library;

enum ProviderCategory { consumer, nas, selfHosted, gateway, generic }

ProviderCategory providerCategoryFromWire(String value) => switch (value) {
      'consumer' => ProviderCategory.consumer,
      'nas' => ProviderCategory.nas,
      'self-hosted' => ProviderCategory.selfHosted,
      'gateway' => ProviderCategory.gateway,
      _ => ProviderCategory.generic,
    };

enum AuthScheme { basic, digest, bearer, none }

AuthScheme authSchemeFromWire(String value) => switch (value) {
      'digest' => AuthScheme.digest,
      'bearer' => AuthScheme.bearer,
      'none' => AuthScheme.none,
      _ => AuthScheme.basic,
    };

enum PasswordKind { account, appPassword, webdavPassword, subAccount, token }

PasswordKind passwordKindFromWire(String value) => switch (value) {
      'app-password' => PasswordKind.appPassword,
      'webdav-password' => PasswordKind.webdavPassword,
      'sub-account' => PasswordKind.subAccount,
      'token' => PasswordKind.token,
      _ => PasswordKind.account,
    };

enum Verification { live, documented, unverified }

Verification verificationFromWire(String value) => switch (value) {
      'live' => Verification.live,
      'documented' => Verification.documented,
      _ => Verification.unverified,
    };

class ProviderAuth {
  const ProviderAuth({
    required this.scheme,
    required this.passwordKind,
    this.usernameHint,
    this.passwordHint,
    this.note,
    this.noteZh,
    this.twoFactor,
  });

  factory ProviderAuth.fromJson(Map<String, dynamic> json) => ProviderAuth(
        scheme: authSchemeFromWire('${json['scheme'] ?? 'basic'}'),
        passwordKind: passwordKindFromWire('${json['passwordKind'] ?? 'account'}'),
        usernameHint: json['usernameHint'] as String?,
        passwordHint: json['passwordHint'] as String?,
        note: json['note'] as String?,
        noteZh: json['noteZh'] as String?,
        twoFactor: json['twoFactor'] as String?,
      );

  final AuthScheme scheme;
  final PasswordKind passwordKind;
  final String? usernameHint;
  final String? passwordHint;
  final String? note;
  final String? noteZh;
  final String? twoFactor;
}

class ProviderCapabilities {
  const ProviderCapabilities({
    this.quota,
    this.move,
    this.copy,
    this.rangeRead,
    this.etag,
    this.depthInfinity,
    this.chunkedUpload,
  });

  factory ProviderCapabilities.fromJson(Map<String, dynamic> json) =>
      ProviderCapabilities(
        quota: json['quota'] as bool?,
        move: json['move'] as bool?,
        copy: json['copy'] as bool?,
        rangeRead: json['rangeRead'] as bool?,
        etag: json['etag'] as bool?,
        depthInfinity: json['depthInfinity'] as bool?,
        chunkedUpload:
            json['chunkedUpload'] is String ? json['chunkedUpload'] as String : null,
      );

  final bool? quota;
  final bool? move;
  final bool? copy;
  final bool? rangeRead;
  final bool? etag;
  final bool? depthInfinity;

  /// `nextcloud` when the provider supports its chunked-upload protocol.
  final String? chunkedUpload;
}

class RequestLimit {
  const RequestLimit({this.free, this.paid});

  factory RequestLimit.fromJson(Map<String, dynamic> json) => RequestLimit(
        free: (json['free'] as num?)?.toInt(),
        paid: (json['paid'] as num?)?.toInt(),
      );

  final int? free;
  final int? paid;
}

class ProviderLimits {
  const ProviderLimits({
    this.maxUploadBytes,
    this.propfindMaxEntries,
    this.requestsPer30Min,
    this.note,
    this.noteZh,
  });

  factory ProviderLimits.fromJson(Map<String, dynamic> json) => ProviderLimits(
        maxUploadBytes: (json['maxUploadBytes'] as num?)?.toInt(),
        propfindMaxEntries: (json['propfindMaxEntries'] as num?)?.toInt(),
        requestsPer30Min: json['requestsPer30Min'] is Map
            ? RequestLimit.fromJson(
                (json['requestsPer30Min'] as Map).cast<String, dynamic>())
            : null,
        note: json['note'] as String?,
        noteZh: json['noteZh'] as String?,
      );

  final int? maxUploadBytes;
  final int? propfindMaxEntries;
  final RequestLimit? requestsPer30Min;
  final String? note;
  final String? noteZh;
}

class ProviderQuirks {
  const ProviderQuirks({
    this.appPasswordRequired,
    this.putParentMustExist,
    this.mkdirAlreadyExistsStatuses,
    this.knownIssues,
    this.knownIssuesZh,
  });

  factory ProviderQuirks.fromJson(Map<String, dynamic> json) => ProviderQuirks(
        appPasswordRequired: json['appPasswordRequired'] as bool?,
        putParentMustExist: json['putParentMustExist'] as bool?,
        mkdirAlreadyExistsStatuses: (json['mkdirAlreadyExistsStatuses'] as List?)
            ?.map((value) => (value as num).toInt())
            .toList(growable: false),
        knownIssues: (json['knownIssues'] as List?)
            ?.map((value) => '$value')
            .toList(growable: false),
        knownIssuesZh: (json['knownIssuesZh'] as List?)
            ?.map((value) => '$value')
            .toList(growable: false),
      );

  final bool? appPasswordRequired;
  final bool? putParentMustExist;
  final List<int>? mkdirAlreadyExistsStatuses;
  final List<String>? knownIssues;
  final List<String>? knownIssuesZh;
}

class ProviderDetect {
  const ProviderDetect({
    this.hosts,
    this.hostSuffixes,
    this.pathIncludes,
    this.ports,
  });

  factory ProviderDetect.fromJson(Map<String, dynamic> json) => ProviderDetect(
        hosts: _stringList(json['hosts']),
        hostSuffixes: _stringList(json['hostSuffixes']),
        pathIncludes: _stringList(json['pathIncludes']),
        ports: (json['ports'] as List?)
            ?.map((value) => (value as num).toInt())
            .toList(growable: false),
      );

  final List<String>? hosts;
  final List<String>? hostSuffixes;
  final List<String>? pathIncludes;
  final List<int>? ports;
}

List<String>? _stringList(Object? value) => (value as List?)
    ?.map((item) => '$item')
    .toList(growable: false);

class ProviderPreset {
  const ProviderPreset({
    required this.id,
    required this.name,
    required this.category,
    required this.auth,
    required this.capabilities,
    required this.verification,
    this.nameZh,
    this.baseUrl,
    this.urlTemplate,
    this.urlHints,
    this.limits,
    this.quirks,
    this.detect,
    this.docsUrl,
    this.notes,
    this.notesZh,
  });

  factory ProviderPreset.fromJson(Map<String, dynamic> json) => ProviderPreset(
        id: '${json['id']}',
        name: '${json['name']}',
        nameZh: json['nameZh'] as String?,
        category: providerCategoryFromWire('${json['category'] ?? 'generic'}'),
        baseUrl: json['baseUrl'] as String?,
        urlTemplate: json['urlTemplate'] as String?,
        urlHints: _stringList(json['urlHints']),
        auth: ProviderAuth.fromJson(
            (json['auth'] as Map? ?? const <String, dynamic>{})
                .cast<String, dynamic>()),
        capabilities: ProviderCapabilities.fromJson(
            (json['capabilities'] as Map? ?? const <String, dynamic>{})
                .cast<String, dynamic>()),
        limits: json['limits'] is Map
            ? ProviderLimits.fromJson(
                (json['limits'] as Map).cast<String, dynamic>())
            : null,
        quirks: json['quirks'] is Map
            ? ProviderQuirks.fromJson(
                (json['quirks'] as Map).cast<String, dynamic>())
            : null,
        detect: json['detect'] is Map
            ? ProviderDetect.fromJson(
                (json['detect'] as Map).cast<String, dynamic>())
            : null,
        docsUrl: json['docsUrl'] as String?,
        verification: verificationFromWire('${json['verification'] ?? 'unverified'}'),
        notes: _stringList(json['notes']),
        notesZh: _stringList(json['notesZh']),
      );

  final String id;
  final String name;
  final String? nameZh;
  final ProviderCategory category;
  final String? baseUrl;
  final String? urlTemplate;
  final List<String>? urlHints;
  final ProviderAuth auth;
  final ProviderCapabilities capabilities;
  final ProviderLimits? limits;
  final ProviderQuirks? quirks;
  final ProviderDetect? detect;
  final String? docsUrl;
  final Verification verification;
  final List<String>? notes;
  final List<String>? notesZh;

  String get label => nameZh ?? name;
}

class ProviderMatch {
  const ProviderMatch({
    required this.provider,
    required this.confidence,
    required this.reason,
  });

  final ProviderPreset provider;
  final String confidence;
  final String reason;
}

class ResolvedProvider {
  const ResolvedProvider({
    required this.provider,
    required this.match,
    required this.detected,
  });

  final ProviderPreset provider;
  final ProviderMatch match;
  final bool detected;
}

class DavResource {
  const DavResource({
    required this.href,
    required this.path,
    required this.name,
    required this.isCollection,
    required this.status,
    this.etag,
    this.size,
    this.lastModified,
    this.contentType,
    this.displayName,
    this.quotaAvailableBytes,
    this.quotaUsedBytes,
  });

  final String href;
  final String path;
  final String name;
  final bool isCollection;
  final String? etag;
  final int? size;
  final DateTime? lastModified;
  final String? contentType;
  final String? displayName;
  final int? quotaAvailableBytes;
  final int? quotaUsedBytes;
  final int status;

  Map<String, Object?> toJson() => <String, Object?>{
        'href': href,
        'path': path,
        'name': name,
        'isCollection': isCollection,
        'etag': etag,
        'size': size,
        'lastModified': lastModified?.toIso8601String(),
        'contentType': contentType,
        'displayName': displayName,
        'quotaAvailableBytes': quotaAvailableBytes,
        'quotaUsedBytes': quotaUsedBytes,
        'status': status,
      };
}

class ReadResult {
  const ReadResult({
    required this.data,
    required this.status,
    required this.notModified,
    this.etag,
    this.contentType,
  });

  final List<int> data;
  final int status;
  final bool notModified;
  final String? etag;
  final String? contentType;
}

class JsonReadResult {
  const JsonReadResult({required this.value, required this.notModified, this.etag});

  final Object? value;
  final bool notModified;
  final String? etag;
}

class WriteResult {
  const WriteResult({required this.status, this.etag});

  final int status;
  final String? etag;
}

class MoveCopyResult {
  const MoveCopyResult({required this.status});

  final int status;
}

class ConnectionInfo {
  const ConnectionInfo({
    required this.ok,
    required this.status,
    required this.provider,
    required this.baseUrl,
    required this.latencyMs,
    required this.authScheme,
    this.dav,
    this.optionsUnsupported,
  });

  final bool ok;
  final int status;
  final ProviderPreset provider;
  final String baseUrl;
  final int latencyMs;
  final List<String>? dav;
  final AuthScheme authScheme;
  final bool? optionsUnsupported;

  Map<String, Object?> toJson() => <String, Object?>{
        'ok': ok,
        'status': status,
        'provider': provider.id,
        'baseUrl': baseUrl,
        'latencyMs': latencyMs,
        'dav': dav,
        'authScheme': authScheme.name,
        'optionsUnsupported': optionsUnsupported,
      };
}

class QuotaInfo {
  const QuotaInfo({this.usedBytes, this.availableBytes, this.totalBytes});

  final int? usedBytes;
  final int? availableBytes;
  final int? totalBytes;

  Map<String, Object?> toJson() => <String, Object?>{
        'usedBytes': usedBytes,
        'availableBytes': availableBytes,
        'totalBytes': totalBytes,
      };
}
