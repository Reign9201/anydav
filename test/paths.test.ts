import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  encodePath,
  nameFromPath,
  normalizeBaseUrl,
  normalizePath,
  parentPaths,
  pathFromHref,
  pathsEqual,
} from '../src/paths.js';
import { DavError } from '../src/errors.js';

describe('normalizeBaseUrl', () => {
  it('adds a trailing slash and strips query/hash', () => {
    const base = normalizeBaseUrl('https://dav.jianguoyun.com/dav?x=1#top');
    assert.equal(base.href, 'https://dav.jianguoyun.com/dav/');
    assert.equal(base.path, '/dav/');
  });

  it('keeps an encoded path', () => {
    const base = normalizeBaseUrl('https://example.com/remote.php/dav/files/%E5%BC%A0%E4%B8%89/');
    assert.equal(base.href, 'https://example.com/remote.php/dav/files/%E5%BC%A0%E4%B8%89/');
    assert.equal(base.path, '/remote.php/dav/files/张三/');
  });

  it('rejects missing schemes and embedded credentials', () => {
    assert.throws(() => normalizeBaseUrl('dav.jianguoyun.com/dav/'), DavError);
    assert.throws(() => normalizeBaseUrl('ftp://example.com/'), DavError);
    assert.throws(() => normalizeBaseUrl('https://user:pass@example.com/dav/'), DavError);
  });
});

describe('normalizePath and encodePath', () => {
  it('normalizes slashes, dots and Unicode', () => {
    assert.equal(normalizePath(''), '/');
    assert.equal(normalizePath('//a//./b//'), '/a/b/');
    assert.equal(normalizePath('é.txt'), '/é.txt');
  });

  it('decodes already-encoded input once', () => {
    assert.equal(normalizePath('/%E6%88%91%E7%9A%84%20%E6%96%87%E4%BB%B6/a.txt'), '/我的 文件/a.txt');
  });

  it('rejects parent traversal and backslashes', () => {
    assert.throws(() => normalizePath('../etc/passwd'), DavError);
    assert.throws(() => normalizePath('/a/../../b'), DavError);
    assert.throws(() => normalizePath('a\\b'), DavError);
  });

  it('encodes segments without losing the collection slash', () => {
    assert.equal(encodePath('/我的 文件/a+b?.txt'), '/%E6%88%91%E7%9A%84%20%E6%96%87%E4%BB%B6/a%2Bb%3F.txt');
    assert.equal(encodePath('/folder/'), '/folder/');
    assert.equal(encodePath('/folder'), '/folder');
  });

  it('derives names and parents', () => {
    assert.equal(nameFromPath('/a/b/c.txt'), 'c.txt');
    assert.equal(nameFromPath('/a/b/'), 'b');
    assert.equal(nameFromPath('/'), '');
    assert.deepEqual(parentPaths('/a/b/c.txt'), ['/a', '/a/b']);
    assert.deepEqual(parentPaths('/a/'), []);
    assert.ok(pathsEqual('/a/', '/a'));
    assert.ok(!pathsEqual('/a', '/b'));
  });
});

describe('pathFromHref', () => {
  it('strips the account base path', () => {
    assert.equal(
      pathFromHref('/remote.php/dav/files/alice/foo/a%20b.txt', '/remote.php/dav/files/alice/', '/foo'),
      '/foo/a b.txt',
    );
  });

  it('handles absolute hrefs and the collection itself', () => {
    assert.equal(
      pathFromHref('https://host/dav/folder/', '/dav/', '/folder/'),
      '/folder/',
    );
    assert.equal(pathFromHref('/dav/', '/dav/', '/'), '/');
  });

  it('survives a reverse-proxy prefix', () => {
    assert.equal(pathFromHref('/prefix/dav/folder/a.txt', '/dav/', '/folder'), '/folder/a.txt');
  });

  it('falls back to the server path when nothing matches', () => {
    assert.equal(pathFromHref('/other/place/a.txt', '/dav/', '/folder'), '/other/place/a.txt');
  });
});
