import 'dart:convert';

import 'package:anydav/anydav.dart';
import 'package:test/test.dart';

void main() {
  group('Basic auth', () {
    test('encodes UTF-8 credentials without corrupting them', () {
      final header = basicAuthHeader('张三@example.com', '应用密码');
      final decoded = utf8.decode(base64Decode(header.substring(6)));
      expect(decoded, '张三@example.com:应用密码');
    });
  });

  group('parseDigestChallenge', () {
    test('finds Digest among multiple schemes', () {
      final challenge = parseDigestChallenge(
        'Basic realm="basic", Digest realm="testrealm@host.com", '
        'qop="auth,auth-int", nonce="abc", opaque="def", algorithm=MD5',
      );
      expect(challenge, isNotNull);
      expect(challenge!.realm, 'testrealm@host.com');
      expect(challenge.nonce, 'abc');
      expect(challenge.opaque, 'def');
      expect(challenge.qop, ['auth', 'auth-int']);
      expect(challenge.algorithm, 'MD5');
    });

    test('returns null for non-Digest headers', () {
      expect(parseDigestChallenge('Basic realm="x"'), isNull);
      expect(parseDigestChallenge(null), isNull);
    });
  });

  group('digestAuthHeader', () {
    test('matches the RFC 2617 example vector', () {
      final header = digestAuthHeader(
        username: 'Mufasa',
        password: 'Circle Of Life',
        method: 'GET',
        uri: '/dir/index.html',
        challenge: const DigestChallenge(
          realm: 'testrealm@host.com',
          nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c093',
          opaque: '5ccc069c403ebaf9f0171e9517f40e41',
          algorithm: 'MD5',
          qop: ['auth'],
        ),
        nc: 1,
        cnonce: '0a4f113b',
      );
      expect(header, startsWith('Digest '));
      expect(header, contains('username="Mufasa"'));
      expect(header, contains('response="6629fae49393a05397450978507c4ef1"'));
      expect(header, contains('qop=auth'));
      expect(header, contains('nc=00000001'));
      expect(header, contains('opaque="5ccc069c403ebaf9f0171e9517f40e41"'));
    });
  });
}
