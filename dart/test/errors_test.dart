import 'package:anydav/anydav.dart';
import 'package:test/test.dart';

void main() {
  group('errorFromStatus', () {
    test('maps common statuses and retryability', () {
      expect(errorFromStatus(401, method: 'GET', url: 'https://x/').code, DavErrorCode.unauthorized);
      expect(errorFromStatus(404, method: 'GET', url: 'https://x/').code, DavErrorCode.notFound);
      expect(
        errorFromStatus(412, method: 'PUT', url: 'https://x/').code,
        DavErrorCode.preconditionFailed,
      );
      expect(errorFromStatus(429, method: 'GET', url: 'https://x/').code, DavErrorCode.rateLimited);
      expect(
        errorFromStatus(507, method: 'PUT', url: 'https://x/').code,
        DavErrorCode.insufficientStorage,
      );
      expect(errorFromStatus(503, method: 'GET', url: 'https://x/').retryable, isTrue);
      expect(errorFromStatus(401, method: 'GET', url: 'https://x/').retryable, isFalse);
    });

    test('uses provider-aware hints', () {
      final jianguoyun = getProvider('jianguoyun');
      final unauthorized = errorFromStatus(
        401,
        method: 'GET',
        url: 'https://dav.jianguoyun.com/dav/',
        provider: jianguoyun,
      );
      expect(unauthorized.hint, contains('第三方应用密码'));
      final rateLimited = errorFromStatus(
        403,
        method: 'GET',
        url: 'https://dav.jianguoyun.com/dav/',
        provider: jianguoyun,
      );
      expect(rateLimited.hint, contains('600 次'));
      expect(hintForStatus(409, 'PUT', null), contains('mkdir'));
    });

    test('parses Retry-After in seconds and HTTP-date form', () {
      expect(parseRetryAfter('5'), const Duration(seconds: 5));
      final now = DateTime.utc(2025, 11, 19, 8);
      expect(
        parseRetryAfter('Wed, 19 Nov 2025 08:00:10 GMT', now: now),
        const Duration(seconds: 10),
      );
      expect(parseRetryAfter(null), isNull);
      expect(parseRetryAfter('not-a-date'), isNull);
    });
  });

  group('networkError', () {
    test('classifies TLS failures separately', () {
      final error = networkError(
        Exception('certificate verify failed'),
        method: 'GET',
        url: 'https://x/',
      );
      expect(error.code, DavErrorCode.tls);
      expect(error.retryable, isFalse);
    });

    test('keeps generic network errors retryable', () {
      final error = networkError(
        Exception('ECONNRESET'),
        method: 'GET',
        url: 'https://x/',
      );
      expect(error.code, DavErrorCode.network);
      expect(error.retryable, isTrue);
    });
  });

  group('parseHttpDate', () {
    test('parses HTTP and ISO timestamps', () {
      expect(parseHttpDate('Wed, 19 Nov 2025 08:00:00 GMT'), DateTime.utc(2025, 11, 19, 8));
      expect(parseHttpDate('2025-11-19T08:00:00Z'), DateTime.utc(2025, 11, 19, 8));
      expect(parseHttpDate(null), isNull);
    });
  });
}
