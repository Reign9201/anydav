import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PROVIDERS,
  PROVIDER_SPEC,
  detectProvider,
  fillUrlTemplate,
  getProvider,
  hasProvider,
  resolveProvider,
} from '../src/providers.js';
import { DavError } from '../src/errors.js';

describe('provider registry', () => {
  it('contains every mainstream provider and unique ids', () => {
    assert.ok(PROVIDERS.length >= 30);
    assert.equal(PROVIDER_SPEC.schemaVersion, 1);
    const ids = new Set(PROVIDERS.map((provider) => provider.id));
    assert.equal(ids.size, PROVIDERS.length);
    for (const id of [
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
      assert.ok(ids.has(id), `missing ${id}`);
    }
  });

  it('captures the documented Jianguoyun limits', () => {
    const provider = getProvider('jianguoyun');
    assert.equal(provider.baseUrl, 'https://dav.jianguoyun.com/dav/');
    assert.equal(provider.auth.passwordKind, 'app-password');
    assert.equal(provider.limits?.maxUploadBytes, 500 * 1024 * 1024);
    assert.equal(provider.limits?.requestsPer30Min?.free, 600);
    assert.equal(provider.limits?.requestsPer30Min?.paid, 1500);
    assert.equal(provider.limits?.propfindMaxEntries, 750);
    assert.equal(provider.verification, 'live');
  });

  it('resolves explicit ids and rejects unknown ones', () => {
    assert.equal(resolveProvider('nextcloud', 'https://example.com/').provider.id, 'nextcloud');
    assert.equal(resolveProvider(undefined, 'https://dav.jianguoyun.com/dav/').provider.id, 'jianguoyun');
    assert.throws(() => getProvider('nope'), DavError);
    assert.ok(hasProvider('pcloud'));
    assert.ok(!hasProvider('nope'));
  });
});

describe('detectProvider', () => {
  it('matches exact hosts with high confidence', () => {
    const match = detectProvider('https://dav.jianguoyun.com/dav/');
    assert.equal(match.provider.id, 'jianguoyun');
    assert.equal(match.confidence, 'high');
  });

  it('matches provider-specific path prefixes', () => {
    assert.equal(
      detectProvider('https://cloud.example.com/remote.php/dav/files/alice/').provider.id,
      'nextcloud',
    );
    assert.equal(detectProvider('https://example.com/seafdav/').provider.id, 'seafile');
  });

  it('matches host suffixes, ports and falls back to generic', () => {
    assert.equal(detectProvider('https://poyo.teracloud.jp/dav/').provider.id, 'infinicloud');
    assert.equal(detectProvider('https://nas.local:5006/home/').provider.id, 'synology');
    assert.equal(detectProvider('http://127.0.0.1:5244/dav/').provider.id, 'alist');
    assert.equal(detectProvider('https://unknown.example.com/dav/').provider.id, 'generic');
    assert.equal(detectProvider('https://unknown.example.com/dav/').confidence, 'none');
  });

  it('prefers MagentaCLOUD over the generic Nextcloud path', () => {
    assert.equal(detectProvider('https://magentacloud.de/remote.php/webdav/').provider.id, 'magentacloud');
  });
});

describe('fillUrlTemplate', () => {
  it('fills known placeholders and leaves unknown ones', () => {
    assert.equal(
      fillUrlTemplate('https://{host}/remote.php/dav/files/{username}/', {
        host: 'cloud.example.com',
        username: 'alice',
      }),
      'https://cloud.example.com/remote.php/dav/files/alice/',
    );
    assert.equal(fillUrlTemplate('https://{host}:{port}/{share}/', { host: 'nas' }), 'https://nas:{port}/{share}/');
  });
});
