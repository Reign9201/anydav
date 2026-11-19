import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';

import 'errors.dart';
import 'types.dart';

class AuthOptions {
  const AuthOptions({
    required this.scheme,
    this.username,
    this.password,
    this.token,
  });

  final AuthScheme scheme;
  final String? username;
  final String? password;
  final String? token;
}

String basicAuthHeader(String username, String password) =>
    'Basic ${base64Encode(utf8.encode('$username:$password'))}';

class DigestChallenge {
  const DigestChallenge({
    required this.realm,
    required this.nonce,
    required this.algorithm,
    this.opaque,
    this.qop,
    this.stale,
    this.charset,
  });

  final String realm;
  final String nonce;
  final String? opaque;
  final String algorithm;
  final List<String>? qop;
  final bool? stale;
  final String? charset;
}

final Random _random = Random.secure();

String _randomHex(int length) {
  final buffer = StringBuffer();
  for (var i = 0; i < length; i++) {
    buffer.write(_random.nextInt(16).toRadixString(16));
  }
  return buffer.toString();
}

DigestChallenge? parseDigestChallenge(String? header) {
  if (header == null) return null;
  final match = RegExp(r'\bDigest\s+', caseSensitive: false).firstMatch(header);
  if (match == null) return null;
  final rest = header.substring(match.end);
  final params = <String, String>{};
  var index = 0;

  bool isSpaceOrComma(String ch) => ch == ' ' || ch == '\t' || ch == ',' || ch == '\r' || ch == '\n';
  bool isSpace(String ch) => ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n';

  while (index < rest.length) {
    while (index < rest.length && isSpaceOrComma(rest[index])) {
      index++;
    }
    final keyStart = index;
    while (index < rest.length &&
        RegExp(r'[A-Za-z0-9_-]').hasMatch(rest[index])) {
      index++;
    }
    final key = rest.substring(keyStart, index).toLowerCase();
    if (key.isEmpty) break;
    while (index < rest.length && isSpace(rest[index])) {
      index++;
    }
    if (index >= rest.length || rest[index] != '=') break;
    index++;
    while (index < rest.length && isSpace(rest[index])) {
      index++;
    }
    var value = '';
    if (index < rest.length && rest[index] == '"') {
      index++;
      final valueStart = index;
      while (index < rest.length && rest[index] != '"') {
        index++;
      }
      value = rest.substring(valueStart, index);
      if (index < rest.length) index++;
    } else {
      final valueStart = index;
      while (index < rest.length && !isSpaceOrComma(rest[index])) {
        index++;
      }
      value = rest.substring(valueStart, index);
    }
    params[key] = value;
  }

  final realm = params['realm'];
  final nonce = params['nonce'];
  if (realm == null || nonce == null) return null;
  final qop = params['qop']
      ?.split(',')
      .map((value) => value.trim().toLowerCase())
      .where((value) => value.isNotEmpty)
      .toList(growable: false);
  return DigestChallenge(
    realm: realm,
    nonce: nonce,
    opaque: params['opaque'],
    algorithm: params['algorithm'] ?? 'MD5',
    qop: qop,
    stale: params['stale'] == 'true',
    charset: params['charset'],
  );
}

String _hashHex(String algorithm, String value) {
  final bytes = utf8.encode(value);
  final upper = algorithm.toUpperCase();
  if (upper.startsWith('SHA-256')) {
    return sha256.convert(bytes).toString();
  }
  if (upper == 'MD5' || upper == 'MD5-SESS') {
    return md5.convert(bytes).toString();
  }
  throw DavError(
    DavErrorCode.unauthorized,
    'Unsupported Digest algorithm: $algorithm',
  );
}

String _quote(String value) =>
    '"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"';

String digestAuthHeader({
  required String username,
  required String password,
  required String method,
  required String uri,
  required DigestChallenge challenge,
  required int nc,
  String? cnonce,
}) {
  final algorithm = challenge.algorithm;
  final ncValue = nc.toRadixString(16).padLeft(8, '0');
  final clientNonce = cnonce ?? _randomHex(16);
  final qop = challenge.qop?.contains('auth') == true ? 'auth' : null;

  var ha1 = _hashHex(algorithm, '$username:${challenge.realm}:$password');
  if (algorithm.toUpperCase().endsWith('-SESS')) {
    ha1 = _hashHex(algorithm, '$ha1:${challenge.nonce}:$clientNonce');
  }
  final ha2 = _hashHex(algorithm, '$method:$uri');
  final response = qop == null
      ? _hashHex(algorithm, '$ha1:${challenge.nonce}:$ha2')
      : _hashHex(
          algorithm,
          '$ha1:${challenge.nonce}:$ncValue:$clientNonce:$qop:$ha2',
        );

  final parts = <String>[
    'username=${_quote(username)}',
    'realm=${_quote(challenge.realm)}',
    'nonce=${_quote(challenge.nonce)}',
    'uri=${_quote(uri)}',
    'response=${_quote(response)}',
    'algorithm=$algorithm',
  ];
  if (qop != null) {
    parts
      ..add('qop=$qop')
      ..add('nc=$ncValue')
      ..add('cnonce=${_quote(clientNonce)}');
  }
  final opaque = challenge.opaque;
  if (opaque != null) parts.add('opaque=${_quote(opaque)}');
  return 'Digest ${parts.join(', ')}';
}

class WebDavAuth {
  WebDavAuth(this.options);

  final AuthOptions options;
  DigestChallenge? _challenge;
  int _nc = 1;

  AuthScheme get scheme => options.scheme;

  Map<String, String> initialHeader(String method, Uri uri) {
    switch (options.scheme) {
      case AuthScheme.basic:
        return <String, String>{
          'authorization': basicAuthHeader(options.username ?? '', options.password ?? ''),
        };
      case AuthScheme.bearer:
        final token = options.token;
        return token == null || token.isEmpty
            ? const <String, String>{}
            : <String, String>{'authorization': 'Bearer $token'};
      case AuthScheme.digest:
        return _digestHeader(method, uri);
      case AuthScheme.none:
        return const <String, String>{};
    }
  }

  Map<String, String>? challengeHeader(
    String method,
    Uri uri,
    String? wwwAuthenticate,
  ) {
    if (options.scheme != AuthScheme.digest) return null;
    final challenge = parseDigestChallenge(wwwAuthenticate);
    if (challenge == null) return null;
    _challenge = challenge;
    _nc = 1;
    return _digestHeader(method, uri);
  }

  Map<String, String> _digestHeader(String method, Uri uri) {
    final challenge = _challenge;
    if (challenge == null) return const <String, String>{};
    final header = digestAuthHeader(
      username: options.username ?? '',
      password: options.password ?? '',
      method: method,
      uri: '${uri.path}${uri.hasQuery ? '?${uri.query}' : ''}',
      challenge: challenge,
      nc: _nc++,
    );
    return <String, String>{'authorization': header};
  }
}
