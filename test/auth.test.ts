import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  base64Encode,
  basicAuthHeader,
  digestAuthHeader,
  parseDigestChallenge,
} from '../src/auth.js';

describe('Basic auth', () => {
  it('encodes UTF-8 credentials without corrupting them', () => {
    const header = basicAuthHeader('张三@example.com', '应用密码');
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    assert.equal(decoded, '张三@example.com:应用密码');
    assert.equal(base64Encode('abc'), 'YWJj');
  });
});

describe('parseDigestChallenge', () => {
  it('finds Digest among multiple schemes', () => {
    const challenge = parseDigestChallenge(
      'Basic realm="basic", Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="abc", opaque="def", algorithm=MD5',
    );
    assert.ok(challenge);
    assert.equal(challenge.realm, 'testrealm@host.com');
    assert.equal(challenge.nonce, 'abc');
    assert.equal(challenge.opaque, 'def');
    assert.deepEqual(challenge.qop, ['auth', 'auth-int']);
    assert.equal(challenge.algorithm, 'MD5');
  });

  it('returns undefined for non-Digest headers', () => {
    assert.equal(parseDigestChallenge('Basic realm="x"'), undefined);
    assert.equal(parseDigestChallenge(undefined), undefined);
  });
});

describe('digestAuthHeader', () => {
  it('matches the RFC 2617 example vector', async () => {
    const header = await digestAuthHeader({
      username: 'Mufasa',
      password: 'Circle Of Life',
      method: 'GET',
      uri: '/dir/index.html',
      challenge: {
        realm: 'testrealm@host.com',
        nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c093',
        opaque: '5ccc069c403ebaf9f0171e9517f40e41',
        algorithm: 'MD5',
        qop: ['auth'],
      },
      nc: 1,
      cnonce: '0a4f113b',
    });
    assert.match(header, /^Digest /);
    assert.match(header, /username="Mufasa"/);
    assert.match(header, /response="6629fae49393a05397450978507c4ef1"/);
    assert.match(header, /qop=auth/);
    assert.match(header, /nc=00000001/);
    assert.match(header, /opaque="5ccc069c403ebaf9f0171e9517f40e41"/);
  });
});
