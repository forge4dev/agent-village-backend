import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { JsonStore } from './store.mjs';

test('JsonStore serializes concurrent mutations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-village-store-'));
  const store = new JsonStore(join(dir, 'world.json'));
  await store.load();
  store.world.counter = 0;

  await Promise.all([
    store.mutate(async (world) => {
      const current = world.counter;
      await delay(10);
      world.counter = current + 1;
    }),
    store.mutate(async (world) => {
      const current = world.counter;
      await delay(1);
      world.counter = current + 1;
    })
  ]);

  assert.equal(store.world.counter, 2);
});
