import 'package:anydav/anydav.dart';
import 'package:test/test.dart';

import 'mock_client.dart';

void main() {
  late MockDav dav;
  late WebDavClient client;

  setUp(() {
    dav = MockDav(quotaAvailable: 1000000, quotaUsed: 2048);
    client = WebDavClient(
      baseUrl: dav.url,
      username: 'alice',
      password: 'secret',
      provider: 'generic',
      httpClient: dav.client,
      retries: 0,
      retryDelay: const Duration(milliseconds: 1),
    );
  });

  tearDown(() => client.close());

  test('tests the connection and reports DAV capabilities', () async {
    final info = await client.testConnection();
    expect(info.ok, isTrue);
    expect(info.provider.id, 'generic');
    expect(info.dav, ['1', '2']);
    expect(info.authScheme, AuthScheme.basic);
  });

  test('creates collections, writes files, stats and lists them', () async {
    await client.mkdir('/notes', recursive: true);
    expect(await client.exists('/notes'), isTrue);
    await client.writeText('/notes/a.txt', 'hello', createParents: false);
    final stat = await client.stat('/notes/a.txt');
    expect(stat, isNotNull);
    expect(stat!.isCollection, isFalse);
    expect(stat.size, 5);
    expect(stat.etag, isNotNull);
    final list = await client.list('/notes');
    expect(list.length, 1);
    expect(list.first.name, 'a.txt');
    expect(list.first.path, '/notes/a.txt');
  });

  test('handles Unicode, spaces and percent-encoded input paths', () async {
    await client.mkdir('/中文 目录');
    await client.writeText('/中文 目录/文件.txt', '你好');
    final text = await client.readText(
      '/%E4%B8%AD%E6%96%87%20%E7%9B%AE%E5%BD%95/%E6%96%87%E4%BB%B6.txt',
    );
    expect(text, '你好');
    final list = await client.list('/中文 目录');
    expect(list.first.name, '文件.txt');
  });

  test('keeps literal percent sequences in file names', () async {
    await client.writeText('/a%2520b.txt', 'literal');
    final list = await client.list('/');
    expect(list.map((resource) => resource.name), contains('a%20b.txt'));
    expect(await client.readText('/a%2520b.txt'), 'literal');
  });

  test('creates missing parents automatically for writes', () async {
    await client.writeText('/a/b/c.txt', 'x');
    expect(await client.exists('/a'), isTrue);
    expect(await client.exists('/a/b'), isTrue);
    expect(await client.readText('/a/b/c.txt'), 'x');
  });

  test('recovers when a cached parent disappeared', () async {
    await client.writeText('/a/b.txt', 'one');
    dav.dirs.remove('/dav/a/');
    await client.writeText('/a/b.txt', 'two');
    expect(await client.readText('/a/b.txt'), 'two');
  });

  test('supports conditional writes and reads', () async {
    await client.writeText('/c.txt', 'one');
    await expectLater(
      client.writeText('/c.txt', 'two', ifNoneMatch: '*'),
      throwsA(isA<DavError>()),
    );
    await expectLater(
      client.writeText('/c.txt', 'two', ifMatch: '"wrong"'),
      throwsA(isA<DavError>()),
    );
    final stat = await client.stat('/c.txt');
    final updated = await client.writeText('/c.txt', 'two', ifMatch: stat?.etag);
    expect(await client.readText('/c.txt'), 'two');
    final notModified = await client.readFile('/c.txt', ifNoneMatch: updated.etag);
    expect(notModified.notModified, isTrue);
    expect(notModified.data, isEmpty);
  });

  test('reads byte ranges', () async {
    await client.writeText('/c.txt', 'abcdef');
    final range = await client.readFile('/c.txt', rangeStart: 1, rangeEnd: 3);
    expect(range.status, 206);
    expect(range.data, [98, 99, 100]);
  });

  test('moves, copies and removes resources', () async {
    await client.writeText('/m.txt', 'm');
    await client.copy('/m.txt', '/copy.txt');
    expect(await client.exists('/copy.txt'), isTrue);
    await client.move('/m.txt', '/moved.txt');
    expect(await client.exists('/m.txt'), isFalse);
    expect(await client.exists('/moved.txt'), isTrue);
    await client.remove('/moved.txt');
    expect(await client.removeIfExists('/moved.txt'), isFalse);
  });

  test('reads quota properties', () async {
    final quota = await client.getQuota();
    expect(quota, isNotNull);
    expect(quota!.usedBytes, 2048);
    expect(quota.availableBytes, 1000000);
    expect(quota.totalBytes, 1002048);
  });

  test('returns null for a missing stat and throws for a missing listing', () async {
    expect(await client.stat('/missing.txt'), isNull);
    await expectLater(client.list('/missing'), throwsA(isA<DavError>()));
  });

  test('reads and writes JSON', () async {
    await client.writeJson('/state.json', {'hello': '世界', 'n': 1});
    final result = await client.readJson('/state.json');
    expect(result.value, {'hello': '世界', 'n': 1});
    final missing = await client.readJson('/none.json');
    expect(missing.value, isNull);
  });

  test('supports Depth 0 listings that include the collection itself', () async {
    final self = (await client.list('/', depth: 0)).single;
    expect(self.isCollection, isTrue);
    expect(self.path, '/');
  });

  test('resolves hrefs through a same-origin proxy with a different path', () async {
    final proxyDav = MockDav(pathMapFrom: '/api/dav/', pathMapTo: '/dav/');
    proxyDav.seedFile('/dav/hello.txt', 'hello');
    final proxyClient = WebDavClient(
      baseUrl: 'http://mock.local/api/dav/',
      username: 'alice',
      password: 'secret',
      provider: 'generic',
      httpClient: proxyDav.client,
      retries: 0,
    );
    final list = await proxyClient.list('/');
    expect(list.map((resource) => resource.name), ['hello.txt']);
    expect(list.first.path, '/hello.txt');
    expect(await proxyClient.readText('/hello.txt'), 'hello');
  });

  test('keeps file paths free of a trailing slash in DELETE and MOVE', () async {
    await client.writeText('/x.txt', 'x');
    dav.resetLog();
    await client.remove('/x.txt');
    expect(dav.log, contains('DELETE /dav/x.txt'));

    await client.writeText('/y.txt', 'y');
    dav.resetLog();
    await client.move('/y.txt', '/z.txt');
    expect(dav.log, contains('MOVE /dav/y.txt'));
  });

  test('surfaces authentication failures with a hint', () async {
    final bad = WebDavClient(
      baseUrl: dav.url,
      username: 'alice',
      password: 'wrong',
      provider: 'generic',
      httpClient: dav.client,
      retries: 0,
    );
    await expectLater(
      bad.testConnection(),
      throwsA(
        isA<DavError>().having((error) => error.code, 'code', DavErrorCode.unauthorized),
      ),
    );
  });

  test('retries idempotent requests on 503', () async {
    final retrying = WebDavClient(
      baseUrl: dav.url,
      username: 'alice',
      password: 'secret',
      provider: 'generic',
      httpClient: dav.client,
      retries: 2,
      retryDelay: const Duration(milliseconds: 1),
      maxRetryDelay: const Duration(milliseconds: 5),
    );
    dav.failNext(503, count: 2);
    final info = await retrying.testConnection();
    expect(info.ok, isTrue);
    expect(dav.countRequests('OPTIONS'), greaterThanOrEqualTo(3));
  });

  test('applies provider-specific hints without hiding the status', () async {
    final jianguoyun = WebDavClient(
      baseUrl: dav.url,
      username: 'alice',
      password: 'secret',
      provider: 'jianguoyun',
      httpClient: dav.client,
      retries: 0,
    );
    dav.failNext(403);
    await expectLater(
      jianguoyun.testConnection(),
      throwsA(
        isA<DavError>()
            .having((error) => error.code, 'code', DavErrorCode.forbidden)
            .having((error) => error.status, 'status', 403)
            .having((error) => error.hint, 'hint', contains('600 次')),
      ),
    );
  });

  test('refuses to delete the account root', () async {
    await expectLater(
      client.remove('/'),
      throwsA(
        isA<DavError>().having((error) => error.code, 'code', DavErrorCode.invalidPath),
      ),
    );
  });
}
