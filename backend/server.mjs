import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHandler } from './app.mjs';
import { runProactiveTick } from './engine.mjs';
import { JsonStore } from './store.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8787);
const dataPath = process.env.DATA_PATH || join(here, '..', 'data', 'living-home.json');
const schedulerMs = Number(process.env.SCHEDULER_MS || 15000);

const store = new JsonStore(dataPath);
await store.load();

setInterval(async () => {
  const events = await store.mutate((world) => runProactiveTick(world));
  if (events.length) console.log('scheduler', JSON.stringify(events));
}, schedulerMs).unref();

const server = http.createServer(createHandler(store));
server.listen(port, () => {
  console.log(`Agent Village backend listening on http://localhost:${port}`);
});
