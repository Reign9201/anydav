import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPropfindBody,
  parseMultiStatus,
  parseXml,
  textContent,
} from '../src/xml.js';
import { DavError } from '../src/errors.js';

const NEXTCLOUD = `<?xml version="1.0"?>
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
</d:multistatus>`;

const DEFAULT_NAMESPACE = `<?xml version="1.0" encoding="utf-8"?>
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
</multistatus>`;

const UPPERCASE_PREFIX = `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/dav/folder/</D:href>
    <D:propstat>
      <D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

describe('parseXml', () => {
  it('handles namespaces, CDATA and entities', () => {
    const root = parseXml(
      '<d:root xmlns:d="urn:x"><d:a><![CDATA[<raw>]]></d:a><d:b>x &amp; y &#x4E2D;</d:b></d:root>',
    );
    assert.equal(root.localName, 'root');
    assert.equal(root.children[0].namespace, 'urn:x');
    assert.equal(textContent(root.children[0]), '<raw>');
    assert.equal(textContent(root.children[1]), 'x & y 中');
  });

  it('throws a PARSE DavError for malformed input', () => {
    assert.throws(
      () => parseXml('<multistatus><response>'),
      (error: unknown) => error instanceof DavError && error.code === 'PARSE',
    );
  });
});

describe('parseMultiStatus', () => {
  it('parses Nextcloud-style responses, quota and hrefs', () => {
    const responses = parseMultiStatus(NEXTCLOUD);
    assert.equal(responses.length, 3);
    const dir = responses[0];
    assert.equal(dir.href, '/remote.php/dav/files/alice/notes/');
    assert.equal(dir.isCollection, true);
    assert.equal(dir.quotaAvailableBytes, 1073741824);
    assert.equal(dir.quotaUsedBytes, 2048);
    const file = responses[1];
    assert.equal(file.props.getetag, '"file-etag"');
    assert.equal(file.props.getcontentlength, '42');
    assert.equal(file.props.getlastmodified, 'Wed, 19 Nov 2025 08:00:00 GMT');
    assert.equal(file.props.displayname, '日记.txt');
    assert.equal(file.isCollection, false);
  });

  it('merges only 2xx propstat blocks', () => {
    const responses = parseMultiStatus(NEXTCLOUD);
    const missing = responses[2];
    assert.equal(missing.props.getetag, '"ok"');
    assert.equal(missing.props.getcontentlength, undefined);
    assert.deepEqual(missing.propstatStatuses, [200, 404]);
  });

  it('supports default namespaces and uppercase prefixes', () => {
    const defaultNs = parseMultiStatus(DEFAULT_NAMESPACE);
    assert.equal(defaultNs[0].props.getetag, '"abc"');
    assert.equal(defaultNs[0].props.getcontentlength, '7');
    const upper = parseMultiStatus(UPPERCASE_PREFIX);
    assert.equal(upper[0].isCollection, true);
  });

  it('rejects non-multistatus documents', () => {
    assert.throws(() => parseMultiStatus('<error xmlns="DAV:"><x/></error>'), DavError);
  });
});

describe('buildPropfindBody', () => {
  it('requests the standard property set', () => {
    const body = buildPropfindBody();
    for (const prop of ['resourcetype', 'getetag', 'getcontentlength', 'quota-available-bytes']) {
      assert.match(body, new RegExp(`<d:${prop}/>`));
    }
    assert.match(body, /xmlns:d="DAV:"/);
  });
});
