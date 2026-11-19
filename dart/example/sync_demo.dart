// Run from the dart/ package:
//   WEBDAV_URL=https://dav.jianguoyun.com/dav/ \
//   WEBDAV_USER=me@example.com \
//   WEBDAV_PASSWORD=app-password \
//   dart run example/sync_demo.dart
import 'dart:convert';
import 'dart:io';

import 'package:anydav/anydav.dart';

Future<void> main() async {
  final environment = Platform.environment;
  final url = environment['WEBDAV_URL'];
  final user = environment['WEBDAV_USER'];
  final password = environment['WEBDAV_PASSWORD'];
  if (url == null || user == null || password == null) {
    stderr.writeln(
      'Set WEBDAV_URL, WEBDAV_USER and WEBDAV_PASSWORD (use an app password).',
    );
    exitCode = 2;
    return;
  }

  final client = WebDavClient(
    baseUrl: url,
    username: user,
    password: password,
    provider: environment['WEBDAV_PROVIDER'],
    timeout: const Duration(seconds: 25),
  );

  try {
    final info = await client.testConnection();
    stdout.writeln(
      'connected: ${info.provider.label} (${info.provider.id}) '
      '${info.latencyMs}ms dav=${info.dav}',
    );

    const folder = '/anydav-demo';
    await client.mkdir(folder, recursive: true);
    final stamp = DateTime.now().toUtc().toIso8601String();
    await client.writeJson('$folder/hello.json', <String, Object?>{
      'hello': '世界',
      'at': stamp,
    });
    final files = await client.list(folder);
    stdout.writeln('files: ${files.map((file) => file.name).join(', ')}');
    final value = await client.readJson('$folder/hello.json');
    stdout.writeln('remote: ${jsonEncode(value.value)}');

    final engine = JsonSyncEngine<Map<String, dynamic>>(
      JsonSyncOptions<Map<String, dynamic>>(
        client: client,
        folder: '$folder/sync',
        deviceId: environment['DEVICE_ID'] ?? 'dart-demo',
        merge: (context) {
          final items = <String, dynamic>{
            ...(context.local?['items'] as Map<String, dynamic>? ??
                const <String, dynamic>{}),
          };
          for (final remote in context.remotes) {
            final remoteItems =
                remote.state['items'] as Map<String, dynamic>? ??
                    const <String, dynamic>{};
            items.addAll(remoteItems);
          }
          return <String, dynamic>{'items': items};
        },
      ),
    );
    final result = await engine.sync(<String, dynamic>{
      'items': <String, dynamic>{
        'demo': <String, Object?>{'at': stamp, 'value': 'ok'},
      },
    });
    stdout.writeln(
      'sync: uploaded=${result.uploaded} '
      'downloaded=${result.downloaded} devices=${result.devices}',
    );
  } on DavError catch (error) {
    stderr.writeln('failed: ${error.code.name} ${error.status ?? ''} ${error.message}');
    if (error.hint != null) stderr.writeln('hint: ${error.hint}');
    exitCode = 1;
  } finally {
    client.close();
  }
}
