import 'package:anydav/anydav.dart';
import 'package:test/test.dart';

void main() {
  group('provider registry', () {
    test('contains every mainstream provider and unique ids', () {
      expect(providers.length, greaterThanOrEqualTo(30));
      final ids = providers.map((provider) => provider.id).toSet();
      expect(ids.length, providers.length);
      for (final id in <String>[
        'jianguoyun',
        'nextcloud',
        'owncloud',
        'synology',
        'qnap',
        'alist',
        'seafile',
        'infinicloud',
        'pcloud',
        'koofr',
        'yandex',
        'pikpak',
        'generic',
      ]) {
        expect(ids, contains(id));
      }
    });

    test('captures the documented Jianguoyun limits', () {
      final provider = getProvider('jianguoyun');
      expect(provider.baseUrl, 'https://dav.jianguoyun.com/dav/');
      expect(provider.auth.passwordKind, PasswordKind.appPassword);
      expect(provider.limits?.maxUploadBytes, 500 * 1024 * 1024);
      expect(provider.limits?.requestsPer30Min?.free, 600);
      expect(provider.limits?.requestsPer30Min?.paid, 1500);
      expect(provider.limits?.propfindMaxEntries, 750);
      expect(provider.verification, Verification.live);
    });

    test('resolves explicit ids and rejects unknown ones', () {
      expect(resolveProvider('nextcloud', 'https://example.com/').provider.id, 'nextcloud');
      expect(
        resolveProvider(null, 'https://dav.jianguoyun.com/dav/').provider.id,
        'jianguoyun',
      );
      expect(() => getProvider('nope'), throwsA(isA<DavError>()));
      expect(hasProvider('pcloud'), isTrue);
      expect(hasProvider('nope'), isFalse);
    });
  });

  group('detectProvider', () {
    test('matches exact hosts with high confidence', () {
      final match = detectProvider('https://dav.jianguoyun.com/dav/');
      expect(match.provider.id, 'jianguoyun');
      expect(match.confidence, 'high');
    });

    test('matches provider-specific path prefixes', () {
      expect(
        detectProvider('https://cloud.example.com/remote.php/dav/files/alice/').provider.id,
        'nextcloud',
      );
      expect(detectProvider('https://example.com/seafdav/').provider.id, 'seafile');
    });

    test('matches host suffixes, ports and falls back to generic', () {
      expect(detectProvider('https://poyo.teracloud.jp/dav/').provider.id, 'infinicloud');
      expect(detectProvider('https://nas.local:5006/home/').provider.id, 'synology');
      expect(detectProvider('http://127.0.0.1:5244/dav/').provider.id, 'alist');
      expect(detectProvider('https://unknown.example.com/dav/').provider.id, 'generic');
      expect(detectProvider('https://unknown.example.com/dav/').confidence, 'none');
    });

    test('prefers MagentaCLOUD over the generic Nextcloud path', () {
      expect(
        detectProvider('https://magentacloud.de/remote.php/webdav/').provider.id,
        'magentacloud',
      );
    });
  });

  group('fillUrlTemplate', () {
    test('fills known placeholders and leaves unknown ones', () {
      expect(
        fillUrlTemplate(
          'https://{host}/remote.php/dav/files/{username}/',
          host: 'cloud.example.com',
          username: 'alice',
        ),
        'https://cloud.example.com/remote.php/dav/files/alice/',
      );
      expect(
        fillUrlTemplate('https://{host}:{port}/{share}/', host: 'nas'),
        'https://nas:{port}/{share}/',
      );
    });
  });
}
