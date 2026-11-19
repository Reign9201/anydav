#!/usr/bin/env node
/**
 * Minimal same-origin WebDAV proxy for browser apps.
 *
 *   WEBDAV_BASE_URL=https://dav.jianguoyun.com/dav/ \
 *   WEBDAV_USERNAME=me@example.com \
 *   WEBDAV_PASSWORD=app-password \
 *   ALLOW_ORIGIN=http://localhost:5173 \
 *   node examples/node-proxy.mjs
 *
 * Then in the browser:
 *
 *   const client = createWebDavClient({
 *     baseUrl: 'http://localhost:8787/api/dav/',
 *     username: 'proxy',        // stripped by the proxy
 *     password: 'anything',     // stripped by the proxy
 *   });
 *
 * SECURITY: this is a development example. Before exposing it, add a real
 * login/session check, keep the upstream account server-side (as here), and
 * never let the client choose the target host.
 */
import { createServer } from 'node:http';
import { Readable } from 'node:stream';

const baseRaw = process.env.WEBDAV_BASE_URL;
if (!baseRaw) {
  console.error('WEBDAV_BASE_URL is required, e.g. https://dav.jianguoyun.com/dav/');
  process.exit(2);
}
const baseUrl = new URL(baseRaw);
if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
  console.error('WEBDAV_BASE_URL must be http(s)://');
  process.exit(2);
}
if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/';

const username = process.env.WEBDAV_USERNAME ?? '';
const password = process.env.WEBDAV_PASSWORD ?? '';
const allowOrigin = process.env.ALLOW_ORIGIN ?? 'http://localhost:5173';
const proxyToken = process.env.PROXY_TOKEN;
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';
const maxBytes = Number(process.env.MAX_BODY_BYTES ?? 64 * 1024 * 1024);

const PREFIX = '/api/dav';
const METHODS = ['OPTIONS', 'PROPFIND', 'MKCOL', 'GET', 'HEAD', 'PUT', 'DELETE', 'MOVE', 'COPY'];
const FORWARD_HEADERS = [
  'content-type',
  'content-length',
  'depth',
  'overwrite',
  'if-match',
  'if-none-match',
  'range',
];
const EXPOSE = [
  'content-type',
  'content-length',
  'etag',
  'last-modified',
  'dav',
  'content-range',
  'accept-ranges',
  'allow',
];

if (allowOrigin === '*') {
  console.warn('ALLOW_ORIGIN=*: any website can read this WebDAV account. Use an exact origin.');
}

function cors(response) {
  response.setHeader('access-control-allow-origin', allowOrigin);
  if (allowOrigin !== '*') {
    response.setHeader('access-control-allow-credentials', 'true');
  }
  response.setHeader('access-control-expose-headers', EXPOSE.join(', '));
  response.setHeader('vary', 'Origin');
}

function fail(response, status, message) {
  cors(response);
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(message);
}

/** Reject traversal and malformed paths before touching the upstream URL. */
function safeSuffix(pathname) {
  if (!pathname.startsWith(PREFIX)) return undefined;
  let suffix = pathname.slice(PREFIX.length);
  if (!suffix.startsWith('/')) suffix = '/' + suffix;
  let decoded;
  try {
    decoded = decodeURIComponent(suffix);
  } catch {
    return undefined;
  }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.includes('..')) return undefined;
  if (decoded.split('/').some((segment) => segment === '..')) return undefined;
  return suffix;
}

function upstreamUrl(suffix, search = '') {
  const target = new URL(baseUrl.href + suffix.slice(1));
  if (search) target.search = search;
  return target;
}

const server = createServer(async (request, response) => {
  cors(response);

  const requestUrl = new URL(request.url ?? '/', 'http://proxy.local');

  // Browser CORS preflight, not a WebDAV OPTIONS.
  if (request.method === 'OPTIONS' && request.headers['access-control-request-method']) {
    response.writeHead(204, {
      'access-control-allow-methods': METHODS.join(', '),
      'access-control-allow-headers':
        'content-type, depth, destination, overwrite, if-match, if-none-match, range, x-proxy-token',
      'access-control-max-age': '600',
    });
    response.end();
    return;
  }

  if (!METHODS.includes(request.method ?? '')) {
    fail(response, 405, 'method not allowed');
    return;
  }
  if (proxyToken && request.headers['x-proxy-token'] !== proxyToken) {
    fail(response, 401, 'proxy token required');
    return;
  }

  const suffix = safeSuffix(requestUrl.pathname);
  if (suffix === undefined) {
    fail(response, 404, 'not found');
    return;
  }

  const contentLengthHeader = request.headers['content-length'];
  const contentLength = Number(contentLengthHeader ?? '0');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    fail(response, 413, 'body too large');
    return;
  }

  const headers = {
    authorization: `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`,
  };
  for (const name of FORWARD_HEADERS) {
    const value = request.headers[name];
    if (typeof value === 'string') headers[name] = value;
  }

  // Rewrite MOVE/COPY destinations from proxy space to upstream space.
  const destination = request.headers.destination;
  if (typeof destination === 'string') {
    let destinationUrl;
    try {
      destinationUrl = new URL(destination, `http://${request.headers.host ?? 'proxy.local'}`);
    } catch {
      fail(response, 400, 'invalid destination');
      return;
    }
    const destinationSuffix = safeSuffix(destinationUrl.pathname);
    if (destinationSuffix === undefined) {
      fail(response, 400, 'destination must stay under ' + PREFIX);
      return;
    }
    headers.destination = upstreamUrl(destinationSuffix).toString();
  }

  const hasBody =
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method ?? '') &&
    (contentLengthHeader !== undefined
      ? contentLength > 0
      : ['PUT', 'PROPFIND', 'COPY'].includes(request.method ?? ''));
  let upstream;
  try {
    upstream = await fetch(upstreamUrl(suffix, requestUrl.search), {
      method: request.method,
      headers,
      body: hasBody ? Readable.toWeb(request) : undefined,
      duplex: hasBody ? 'half' : undefined,
      redirect: 'follow',
    });
  } catch (error) {
    fail(response, 502, `upstream request failed: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const responseHeaders = {};
  for (const name of EXPOSE) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders[name] = value;
  }
  cors(response);
  response.writeHead(upstream.status, responseHeaders);
  if (!upstream.body) {
    response.end();
    return;
  }
  Readable.fromWeb(upstream.body).pipe(response);
});

server.listen(port, host, () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  console.log(`webdav proxy listening on http://${host}:${actualPort}${PREFIX}/ -> ${baseUrl.origin}`);
  console.log(`allowed origin: ${allowOrigin}${proxyToken ? ' (proxy token required)' : ''}`);
});
