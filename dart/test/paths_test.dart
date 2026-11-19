import 'package:anydav/anydav.dart';
import 'package:test/test.dart';

void main() {
  group('normalizeBaseUrl', () {
    test('adds a trailing slash and strips query/hash', () {
      final base = normalizeBaseUrl('https://dav.jianguoyun.com/dav?x=1#top');
      expect(base.href, 'https://dav.jianguoyun.com/dav/');
      expect(base.path, '/dav/');
    });

    test('keeps an encoded path', () {
      final base = normalizeBaseUrl(
        'https://example.com/remote.php/dav/files/%E5%BC%A0%E4%B8%89/',
      );
      expect(base.href, 'https://example.com/remote.php/dav/files/%E5%BC%A0%E4%B8%89/');
      expect(base.path, '/remote.php/dav/files/张三/');
    });

    test('rejects missing schemes and embedded credentials', () {
      expect(() => normalizeBaseUrl('dav.jianguoyun.com/dav/'), throwsA(isA<DavError>()));
      expect(() => normalizeBaseUrl('ftp://example.com/'), throwsA(isA<DavError>()));
      expect(() => normalizeBaseUrl('https://user:pass@example.com/dav/'), throwsA(isA<DavError>()));
    });
  });

  group('normalizePath and encodePath', () {
    test('normalizes slashes, dots and Unicode', () {
      expect(normalizePath(''), '/');
      expect(normalizePath('//a//./b//'), '/a/b/');
      expect(normalizePath('é.txt'), '/é.txt');
    });

    test('decodes already-encoded input once', () {
      expect(
        normalizePath('/%E6%88%91%E7%9A%84%20%E6%96%87%E4%BB%B6/a.txt'),
        '/我的 文件/a.txt',
      );
    });

    test('rejects parent traversal and backslashes', () {
      expect(() => normalizePath('../etc/passwd'), throwsA(isA<DavError>()));
      expect(() => normalizePath('/a/../../b'), throwsA(isA<DavError>()));
      expect(() => normalizePath(r'a\b'), throwsA(isA<DavError>()));
    });

    test('encodes segments without losing the collection slash', () {
      expect(
        encodePath('/我的 文件/a+b?.txt'),
        '/%E6%88%91%E7%9A%84%20%E6%96%87%E4%BB%B6/a%2Bb%3F.txt',
      );
      expect(encodePath('/folder/'), '/folder/');
      expect(encodePath('/folder'), '/folder');
    });

    test('derives names and parents', () {
      expect(nameFromPath('/a/b/c.txt'), 'c.txt');
      expect(nameFromPath('/a/b/'), 'b');
      expect(nameFromPath('/'), '');
      expect(parentPaths('/a/b/c.txt'), ['/a', '/a/b']);
      expect(parentPaths('/a/'), isEmpty);
      expect(pathsEqual('/a/', '/a'), isTrue);
      expect(pathsEqual('/a', '/b'), isFalse);
    });
  });

  group('pathFromHref', () {
    test('strips the account base path', () {
      expect(
        pathFromHref(
          '/remote.php/dav/files/alice/foo/a%20b.txt',
          '/remote.php/dav/files/alice/',
          '/foo',
        ),
        '/foo/a b.txt',
      );
    });

    test('handles absolute hrefs and the collection itself', () {
      expect(
        pathFromHref('https://host/dav/folder/', '/dav/', '/folder/'),
        '/folder/',
      );
      expect(pathFromHref('/dav/', '/dav/', '/'), '/');
    });

    test('survives a reverse-proxy prefix', () {
      expect(pathFromHref('/prefix/dav/folder/a.txt', '/dav/', '/folder'), '/folder/a.txt');
    });

    test('falls back to the server path when nothing matches', () {
      expect(
        pathFromHref('/other/place/a.txt', '/dav/', '/folder'),
        '/other/place/a.txt',
      );
    });
  });
}
