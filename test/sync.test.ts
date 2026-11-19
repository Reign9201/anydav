import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { WebDavClient } from '../src/client.js';
import {
  JsonSyncEngine,
  MemorySyncCache,
  stableStringify,
  type MergeContext,
} from '../src/sync.js';
import { DavError } from '../src/errors.js';
import { MockWebDavServer } from './mock-server.js';

interface State {
  items: Record<string, { value: string; at: number }>;
}

function mergeStates({ local, remotes }: MergeContext<State>): State {
  const items: State['items'] = { ...(local?.items ?? {}) };
  for (const remote of remotes) {
    for (const [key, item] of Object.entries(remote.state.items ?? {})) {
      if (!items[key] || item.at > items[key].at) items[key] = item;
    }
  }
  return { items };
}

describe('stableStringify', () => {
  it('sorts object keys recursively', () => {
    assert.equal(stableStringify({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
    assert.equal(stableStringify([{ b: 1, a: 2 }]), '[{"a":2,"b":1}]');
  });

  it('rejects cyclic values', () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    assert.throws(() => stableStringify(value), DavError);
  });
});

describe('JsonSyncEngine', () => {
  let server: MockWebDavServer;
  let clientA: WebDavClient;
  let clientB: WebDavClient;
  let syncA: JsonSyncEngine<State>;
  let syncB: JsonSyncEngine<State>;

  beforeEach(async () => {
    server = new MockWebDavServer();
    const url = await server.start();
    const makeClient = () =>
      new WebDavClient({
        baseUrl: url,
        username: 'alice',
        password: 'secret',
        provider: 'generic',
        retries: 0,
        retryDelayMs: 1,
      });
    clientA = makeClient();
    clientB = makeClient();
    const makeSync = (client: WebDavClient, deviceId: string) =>
      new JsonSyncEngine<State>({
        client,
        folder: '/sync',
        deviceId,
        merge: mergeStates,
        cache: new MemorySyncCache(),
      });
    syncA = makeSync(clientA, 'dev-a');
    syncB = makeSync(clientB, 'dev-b');
  });

  afterEach(async () => {
    clientA.close();
    clientB.close();
    await server.stop();
  });

  it('merges two devices through the shared folder', async () => {
    const first = await syncA.sync({ items: { a: { value: 'A', at: 1 } } });
    assert.equal(first.uploaded, true);
    assert.deepEqual(first.devices, []);

    const second = await syncB.sync({ items: { b: { value: 'B', at: 2 } } });
    assert.equal(second.state.items.a.value, 'A');
    assert.equal(second.state.items.b.value, 'B');
    assert.deepEqual(second.devices, ['dev-a']);
    assert.deepEqual(second.downloaded, ['dev-a.json']);

    const third = await syncA.sync({ items: { a: { value: 'A', at: 1 } } });
    assert.equal(third.state.items.b.value, 'B');
    assert.deepEqual(third.devices, ['dev-b']);
    assert.ok(third.downloaded.includes('dev-b.json'));
  });

  it('skips downloads that are unchanged according to ETags', async () => {
    await syncA.sync({ items: { a: { value: 'A', at: 1 } } });
    await syncB.sync({ items: { b: { value: 'B', at: 2 } } });
    const stable = await syncB.sync({ items: { b: { value: 'B', at: 2 } } });
    server.resetRequests();
    const again = await syncB.sync(stable.state);
    assert.equal(again.uploaded, false);
    assert.equal(server.countRequests('GET'), 0);
  });

  it('skips malformed remote files when skipInvalid is enabled', async () => {
    server.seedFile('/dav/sync/broken.json', '{not json');
    const result = await syncA.sync({ items: { a: { value: 'A', at: 1 } } });
    assert.deepEqual(result.skipped, ['broken.json']);
    assert.equal(result.state.items.a.value, 'A');
  });

  it('validates device ids and extensions', async () => {
    assert.throws(
      () =>
        new JsonSyncEngine<State>({
          client: clientA,
          folder: '/sync',
          deviceId: '../evil',
          merge: mergeStates,
        }),
      DavError,
    );
    assert.throws(
      () =>
        new JsonSyncEngine<State>({
          client: clientA,
          folder: '/sync',
          deviceId: 'ok',
          extension: 'json',
          merge: mergeStates,
        }),
      DavError,
    );
  });
});
