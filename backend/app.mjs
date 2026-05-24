import { randomUUID } from 'node:crypto';
import { createAgent, feed, handleMessage, interactAgents, publicAgentView, runProactiveTick } from './engine.mjs';

export function createHandler(store) {
  return async function handler(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const method = req.method || 'GET';

      if (method === 'OPTIONS') return send(res, 204, null);
      if (method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
      if (method === 'POST' && url.pathname === '/admin/reset') return send(res, 200, await store.reset());

      if (method === 'GET' && url.pathname === '/agents') {
        return send(res, 200, await store.read((world) => world.agents.map((agent) => publicAgentView(world, agent.id))));
      }

      if (method === 'POST' && url.pathname === '/agents') {
        const body = await readJson(req);
        if (!body.name || !body.bio) return send(res, 400, { error: 'name_and_bio_required' });
        const agent = createAgent(body);
        await store.mutate((world) => {
          world.agents.push(agent);
          world.activity_events.push({
            id: randomUUID(),
            agent_id: agent.id,
            recipient_id: null,
            event_type: 'agent_joined',
            content: `${agent.name} just moved in.`,
            created_at: new Date().toISOString()
          });
        });
        return send(res, 201, await store.read((world) => publicAgentView(world, agent.id)));
      }

      if (method === 'GET' && url.pathname === '/feed') {
        const limit = Number(url.searchParams.get('limit') || 30);
        return send(res, 200, await store.read((world) => feed(world, limit)));
      }

      const messageMatch = url.pathname.match(/^\/agents\/([^/]+)\/messages$/);
      if (method === 'POST' && messageMatch) {
        const body = await readJson(req);
        const result = await store.mutate((world) => handleMessage(world, messageMatch[1], body));
        return send(res, result.status, result.body);
      }

      const interactionMatch = url.pathname.match(/^\/agents\/([^/]+)\/interactions$/);
      if (method === 'POST' && interactionMatch) {
        const body = await readJson(req);
        const result = await store.mutate((world) => interactAgents(world, interactionMatch[1], body.target_agent_id, body));
        return send(res, result.status, result.body);
      }

      if (method === 'POST' && url.pathname === '/scheduler/tick') {
        const now = url.searchParams.get('now') ? new Date(url.searchParams.get('now')) : new Date();
        if (Number.isNaN(now.getTime())) return send(res, 400, { error: 'invalid_now' });
        const events = await store.mutate((world) => runProactiveTick(world, now));
        return send(res, 200, { events });
      }

      if (method === 'GET' && url.pathname === '/observability/events') {
        return send(res, 200, await store.read((world) => world.behavior_events.slice(-50).reverse()));
      }

      if (method === 'GET' && url.pathname === '/observability/owner-checkins') {
        return send(res, 200, await store.read((world) => world.owner_checkins.slice(-50).reverse()));
      }

      return send(res, 404, { error: 'not_found' });
    } catch (error) {
      console.error(error);
      return send(res, 500, { error: 'internal_error', detail: error.message });
    }
  };
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (body === null) return res.end();
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body, null, 2));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy(new Error('request_too_large'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error(`invalid_json: ${error.message}`));
      }
    });
    req.on('error', reject);
  });
}
