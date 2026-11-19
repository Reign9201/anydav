import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

import 'errors.dart';
import 'types.dart';

class DavHttpResponse {
  const DavHttpResponse({
    required this.status,
    required this.reasonPhrase,
    required this.headers,
    required this.body,
    required this.url,
  });

  final int status;
  final String reasonPhrase;
  final Map<String, String> headers;
  final List<int> body;
  final String url;

  String get text => utf8.decode(body, allowMalformed: true);

  String? header(String name) {
    final wanted = name.toLowerCase();
    for (final entry in headers.entries) {
      if (entry.key.toLowerCase() == wanted) return entry.value;
    }
    return null;
  }
}

Future<DavHttpResponse> fetchOnce({
  required http.Client client,
  required String method,
  required Uri uri,
  Map<String, String> headers = const <String, String>{},
  List<int>? body,
  required Duration timeout,
  ProviderPreset? provider,
}) async {
  final request = http.Request(method, uri)
    ..followRedirects = true
    ..maxRedirects = 3
    // WebDAV servers commonly close idle connections; disabling reuse avoids
    // writing the next request onto a half-closed socket.
    ..persistentConnection = false;
  request.headers.addAll(headers);
  if (body != null) request.bodyBytes = body;
  try {
    final streamed = await client.send(request).timeout(timeout);
    final response = await http.Response.fromStream(streamed).timeout(timeout);
    return DavHttpResponse(
      status: response.statusCode,
      reasonPhrase: response.reasonPhrase ?? '',
      headers: response.headers,
      body: response.bodyBytes,
      url: response.request?.url.toString() ?? uri.toString(),
    );
  } on TimeoutException catch (error) {
    throw networkError(
      error,
      method: method,
      url: uri.toString(),
      provider: provider,
      timedOut: true,
    );
  } on http.ClientException catch (error) {
    throw networkError(
      error,
      method: method,
      url: uri.toString(),
      provider: provider,
    );
  } catch (error) {
    throw networkError(
      error,
      method: method,
      url: uri.toString(),
      provider: provider,
    );
  }
}

const Set<String> _idempotent = <String>{
  'GET',
  'HEAD',
  'OPTIONS',
  'PROPFIND',
  'PUT',
  'DELETE',
  'MKCOL',
};

bool isIdempotent(String method) => _idempotent.contains(method.toUpperCase());

int backoffDelayMs(int attempt, int baseMs, int maxMs) {
  final exponential = min(maxMs, baseMs * pow(2, max(0, attempt)).toInt());
  final jitter = 0.5 + Random().nextDouble() * 0.5;
  return (exponential * jitter).round();
}

Future<void> delay(Duration duration) => Future<void>.delayed(duration);
