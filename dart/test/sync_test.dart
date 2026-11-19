import 'package:anydav/anydav.dart';
import 'package:test/test.dart';

import 'mock_client.dart';

typedef State = Map<String, dynamic>;

State mergeStates(MergeContext<State> context) {
  final items = <String, dynamic>{
    ...(context.local?['items'] as Map<String, dynamic>? ?? const <String, dynamic>{}),
  };
  for (final remote in context.remotes) {
    final remoteItems =
        (remote.state['items'] as Map<String, dynamic>?) ?? const <String, dynamic>{};
    for (final entry in remoteItems.entries) {
      final current = items[entry.key] as Map<String, dynamic>?;
      final incoming = entry.value as Map<String, dynamic>;
      if (current == null || (incoming['at'] as int) > (current['at'] as int)) {
        items[entry.key] = incoming;
      }
    }
  }
  return <String, dynamic>{'items': items};
}

void main() {
  late MockDav dav;
  late WebDavClient clientA;
  late WebDavClient clientB;
  late JsonSyncEngine<State> syncA;
  late JsonSyncEngine<State> syncB;

  WebDavClient makeClient() => WebDavClient(
        baseUrl: dav.url,
        username: 'alice',
        password: 'secret',
        provider: 'generic',
        httpClient: dav.client,
        retries: 0,
        retryDelay: const Duration(milliseconds: 1),
      );

  JsonSyncEngine<State> makeSync(WebDavClient client, String deviceId) =>
      JsonSyncEngine<State>(
        JsonSyncOptions<State>(
          client: client,
          folder: '/sync',
          deviceId: deviceId,
          merge: mergeStates,
          cache: MemorySyncCache(),
        ),
      );

  setUp(() {
    dav = MockDav();
    clientA = makeClient();
    clientB = makeClient();
    syncA = makeSync(clientA, 'dev-a');
    syncB = makeSync(clientB, 'dev-b');
  });

  tearDown(() {
    clientA.close();
    clientB.close();
  });

  test('stableStringify sorts object keys recursively', () {
    expect(stableStringify({'b': 1, 'a': {'d': 2, 'c': 3}}), '{"a":{"c":3,"d":2},"b":1}');
    expect(stableStringify([{'b': 1, 'a': 2}]), '[{"a":2,"b":1}]');
    final cyclic = <String, Object?>{};
    cyclic['self'] = cyclic;
    expect(() => stableStringify(cyclic), throwsA(isA<DavError>()));
  });

  test('merges two devices through the shared folder', () async {
    final first = await syncA.sync({
      'items': {
        'a': {'value': 'A', 'at': 1},
      },
    });
    expect(first.uploaded, isTrue);
    expect(first.devices, isEmpty);

    final second = await syncB.sync({
      'items': {
        'b': {'value': 'B', 'at': 2},
      },
    });
    expect((second.state['items'] as Map)['a'], {'value': 'A', 'at': 1});
    expect((second.state['items'] as Map)['b'], {'value': 'B', 'at': 2});
    expect(second.devices, ['dev-a']);
    expect(second.downloaded, ['dev-a.json']);

    final third = await syncA.sync({
      'items': {
        'a': {'value': 'A', 'at': 1},
      },
    });
    expect((third.state['items'] as Map)['b'], {'value': 'B', 'at': 2});
    expect(third.devices, ['dev-b']);
    expect(third.downloaded, contains('dev-b.json'));
  });

  test('skips downloads that are unchanged according to ETags', () async {
    await syncA.sync({
      'items': {
        'a': {'value': 'A', 'at': 1},
      },
    });
    await syncB.sync({
      'items': {
        'b': {'value': 'B', 'at': 2},
      },
    });
    final stable = await syncB.sync({
      'items': {
        'b': {'value': 'B', 'at': 2},
      },
    });
    dav.resetLog();
    final again = await syncB.sync(stable.state);
    expect(again.uploaded, isFalse);
    expect(dav.countRequests('GET'), 0);
  });

  test('skips malformed remote files when skipInvalid is enabled', () async {
    dav.seedFile('/dav/sync/broken.json', '{not json');
    final result = await syncA.sync({
      'items': {
        'a': {'value': 'A', 'at': 1},
      },
    });
    expect(result.skipped, ['broken.json']);
    expect((result.state['items'] as Map)['a'], {'value': 'A', 'at': 1});
  });

  test('validates device ids and extensions', () {
    expect(
      () => JsonSyncEngine<State>(
        JsonSyncOptions<State>(
          client: clientA,
          folder: '/sync',
          deviceId: '../evil',
          merge: mergeStates,
        ),
      ),
      throwsA(isA<DavError>()),
    );
    expect(
      () => JsonSyncEngine<State>(
        JsonSyncOptions<State>(
          client: clientA,
          folder: '/sync',
          deviceId: 'ok',
          extension: 'json',
          merge: mergeStates,
        ),
      ),
      throwsA(isA<DavError>()),
    );
  });
}
