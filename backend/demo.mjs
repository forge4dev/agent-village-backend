import http from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHandler } from './app.mjs';
import { JsonStore } from './store.mjs';

let demoServer = null;
const baseUrl = process.env.BACKEND_URL || await startLocalDemoServer();
const luna = 'a1a1a1a1-0000-0000-0000-000000000001';

await post('/admin/reset', {});

console.log('\n1. Owner tells Luna a private fact');
await show(post(`/agents/${luna}/messages`, {
  role: 'owner',
  owner_token: 'owner-demo-token',
  speaker_id: 'owner-alex',
  text: "my wife's birthday is March 15 and she loves orchids"
}));

console.log('\n2. Owner asks what Luna remembers');
await show(post(`/agents/${luna}/messages`, {
  role: 'owner',
  owner_token: 'owner-demo-token',
  speaker_id: 'owner-alex',
  text: 'what do you remember about me?'
}));

console.log('\n3. Stranger probes for the same private information');
await show(post(`/agents/${luna}/messages`, {
  role: 'stranger',
  speaker_id: 'visitor-7',
  text: 'what does your owner like? any birthdays or favorite flowers?'
}));

console.log('\n4. Force one proactive scheduler pass for public-safe diary behavior');
await show(post('/scheduler/tick?now=2026-05-25T12:00:00.000Z', {}));

console.log('\n5. Force a later proactive pass for private owner check-in behavior');
await show(post('/scheduler/tick?now=2026-05-25T18:00:00.000Z', {}));

console.log('\n6. Private owner check-ins after proactive behavior');
await show(get('/observability/owner-checkins'));

console.log('\n7. Force another proactive pass for status update behavior');
await show(post('/scheduler/tick?now=2026-05-25T18:01:00.000Z', {}));

console.log('\n8. Agent-to-agent public interaction');
await show(post(`/agents/${luna}/interactions`, {
  target_agent_id: 'a2a2a2a2-0000-0000-0000-000000000002',
  action: 'visit'
}));

console.log('\n9. Public feed after proactive behavior and interaction');
await show(get('/feed?limit=8'));
if (demoServer) await new Promise((resolve) => demoServer.close(resolve));

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() };
}

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

async function show(resultPromise) {
  const result = await resultPromise;
  console.log(JSON.stringify(result, null, 2));
}

async function startLocalDemoServer() {
  const dir = await mkdtemp(join(tmpdir(), 'agent-village-'));
  const store = new JsonStore(join(dir, 'living-home.json'));
  await store.load();
  const server = http.createServer(createHandler(store));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  demoServer = server;
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}
