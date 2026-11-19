import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DavError,
  errorFromStatus,
  hintForStatus,
  networkError,
  parseRetryAfter,
} from '../src/errors.js';
import { getProvider } from '../src/providers.js';

describe('errorFromStatus', () => {
  it('maps common statuses and retryability', () => {
    assert.equal(errorFromStatus(401, { method: 'GET', url: 'https://x/' }).code, 'UNAUTHORIZED');
    assert.equal(errorFromStatus(404, { method: 'GET', url: 'https://x/' }).code, 'NOT_FOUND');
    assert.equal(errorFromStatus(412, { method: 'PUT', url: 'https://x/' }).code, 'PRECONDITION_FAILED');
    assert.equal(errorFromStatus(429, { method: 'GET', url: 'https://x/' }).code, 'RATE_LIMITED');
    assert.equal(errorFromStatus(507, { method: 'PUT', url: 'https://x/' }).code, 'INSUFFICIENT_STORAGE');
    assert.equal(errorFromStatus(503, { method: 'GET', url: 'https://x/' }).retryable, true);
    assert.equal(errorFromStatus(401, { method: 'GET', url: 'https://x/' }).retryable, false);
  });

  it('uses provider-aware hints', () => {
    const jianguoyun = getProvider('jianguoyun');
    const unauthorized = errorFromStatus(401, {
      method: 'GET',
      url: 'https://dav.jianguoyun.com/dav/',
      provider: jianguoyun,
    });
    assert.match(unauthorized.hint ?? '', /第三方应用密码/);
    const rateLimited = errorFromStatus(403, {
      method: 'GET',
      url: 'https://dav.jianguoyun.com/dav/',
      provider: jianguoyun,
    });
    assert.match(rateLimited.hint ?? '', /600 次/);
    assert.match(hintForStatus(409, 'PUT') ?? '', /mkdir/);
  });

  it('parses Retry-After in seconds and HTTP-date form', () => {
    assert.equal(parseRetryAfter('5', 0), 5000);
    const now = Date.parse('Wed, 19 Nov 2025 08:00:00 GMT');
    assert.equal(parseRetryAfter('Wed, 19 Nov 2025 08:00:10 GMT', now), 10_000);
    assert.equal(parseRetryAfter(undefined), undefined);
    assert.equal(parseRetryAfter('not-a-date'), undefined);
  });
});

describe('networkError', () => {
  it('classifies TLS failures separately', () => {
    const error = networkError(new Error('certificate verify failed'), {
      method: 'GET',
      url: 'https://x/',
    });
    assert.equal(error.code, 'TLS');
    assert.equal(error.retryable, false);
  });

  it('keeps generic network errors retryable', () => {
    const error = networkError(new Error('ECONNRESET'), { method: 'GET', url: 'https://x/' });
    assert.equal(error.code, 'NETWORK');
    assert.equal(error.retryable, true);
  });
});

describe('DavError', () => {
  it('serializes for CLI/JSON output', () => {
    const error = new DavError({ code: 'NOT_FOUND', message: 'gone', status: 404 });
    assert.deepEqual(error.toJSON(), {
      name: 'DavError',
      code: 'NOT_FOUND',
      message: 'gone',
      status: 404,
      method: undefined,
      url: undefined,
      providerId: undefined,
      retryable: false,
      retryAfterMs: undefined,
      hint: undefined,
    });
  });
});
