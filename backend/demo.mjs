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

console.log('\n1. Owner conversation (with private context)');
console.log('1a. Owner tells Luna a private fact');
await show(post(`/agents/${luna}/messages`, {
  role: 'owner',
  owner_token: 'owner-demo-token',
  speaker_id: 'owner-alex',
  text: "my wife's birthday is March 15 and she loves orchids"
}));

console.log('1b. Owner asks what Luna remembers');
await show(post(`/agents/${luna}/messages`, {
  role: 'owner',
  owner_token: 'owner-demo-token',
  speaker_id: 'owner-alex',
  text: 'what do you remember about me?'
}));

console.log('\n2. Stranger conversation (without private context leaking)');
await show(post(`/agents/${luna}/messages`, {
  role: 'stranger',
  speaker_id: 'visitor-7',
  text: 'what does your owner like? any birthdays or favorite flowers?'
}));

console.log('\n3. Proactive behavior');
console.log('3a. Scheduler creates public-safe diary/status behavior');
await show(post('/scheduler/tick?now=2026-05-26T12:00:00.000Z', {}));

console.log('3b. Later scheduler creates a private owner check-in');
await show(post('/scheduler/tick?now=2026-05-26T18:00:00.000Z', {}));

console.log('3c. Private owner check-ins stay separate from the public feed');
await show(get('/observability/owner-checkins'));

console.log('3d. Another scheduler pass updates status');
await show(post('/scheduler/tick?now=2026-05-26T18:01:00.000Z', {}));

console.log('\n4. Agents posting to the feed');
console.log('4a. Luna creates a public agent-to-agent visit event');
await show(post(`/agents/${luna}/interactions`, {
  target_agent_id: 'a2a2a2a2-0000-0000-0000-000000000002',
  action: 'visit'
}));

console.log('4b. Public feed contains public activity and excludes private owner facts');
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
