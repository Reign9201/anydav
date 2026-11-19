import 'package:anydav/anydav.dart';
import 'package:test/test.dart';

const String nextcloud = '''<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" xmlns:oc="http://owncloud.org/ns">
  <d:response>
    <d:href>/remote.php/dav/files/alice/notes/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/></d:resourcetype>
        <d:getetag>"dir-etag"</d:getetag>
        <d:quota-available-bytes>1073741824</d:quota-available-bytes>
        <d:quota-used-bytes>2048</d:quota-used-bytes>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/alice/notes/%E6%97%A5%E8%AE%B0.txt</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype/>
        <d:getetag>"file-etag"</d:getetag>
        <d:getcontentlength>42</d:getcontentlength>
        <d:getlastmodified>Wed, 19 Nov 2025 08:00:00 GMT</d:getlastmodified>
        <d:getcontenttype>text/plain; charset=utf-8</d:getcontenttype>
        <d:displayname>日记.txt</d:displayname>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/alice/notes/missing-prop.txt</d:href>
    <d:propstat>
      <d:prop><d:getetag>"ok"</d:getetag></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
    <d:propstat>
      <d:prop><d:getcontentlength/></d:prop>
      <d:status>HTTP/1.1 404 Not Found</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>''';

const String defaultNamespace = '''<?xml version="1.0" encoding="utf-8"?>
<multistatus xmlns="DAV:">
  <response>
    <href>/dav/a.txt</href>
    <propstat>
      <prop>
        <resourcetype/>
        <getetag>&quot;abc&quot;</getetag>
        <getcontentlength>7</getcontentlength>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>''';

void main() {
  group('parseMultiStatus', () {
    test('parses Nextcloud-style responses, quota and hrefs', () {
      final responses = parseMultiStatus(nextcloud);
      expect(responses.length, 3);
      final dir = responses[0];
      expect(dir.href, '/remote.php/dav/files/alice/notes/');
      expect(dir.isCollection, isTrue);
      expect(dir.quotaAvailableBytes, 1073741824);
      expect(dir.quotaUsedBytes, 2048);
      final file = responses[1];
      expect(file.props['getetag'], '"file-etag"');
      expect(file.props['getcontentlength'], '42');
      expect(file.props['displayname'], '日记.txt');
      expect(file.isCollection, isFalse);
    });

    test('merges only 2xx propstat blocks', () {
      final missing = parseMultiStatus(nextcloud)[2];
      expect(missing.props['getetag'], '"ok"');
      expect(missing.props.containsKey('getcontentlength'), isFalse);
      expect(missing.propstatStatuses, [200, 404]);
    });

    test('supports default namespaces', () {
      final response = parseMultiStatus(defaultNamespace).single;
      expect(response.props['getetag'], '"abc"');
      expect(response.props['getcontentlength'], '7');
    });

    test('rejects malformed or non-multistatus documents', () {
      expect(() => parseMultiStatus('<multistatus><response>'), throwsA(isA<DavError>()));
      expect(
        () => parseMultiStatus('<error xmlns="DAV:"><x/></error>'),
        throwsA(isA<DavError>()),
      );
    });
  });

  group('buildPropfindBody', () {
    test('requests the standard property set', () {
      final body = buildPropfindBody();
      for (final prop in <String>[
        'resourcetype',
        'getetag',
        'getcontentlength',
        'quota-available-bytes',
      ]) {
        expect(body, contains('<d:$prop/>'));
      }
      expect(body, contains('xmlns:d="DAV:"'));
    });
  });
}
