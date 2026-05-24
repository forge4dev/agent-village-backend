import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_SECRET, feed, handleMessage, interactAgents, runProactiveTick, seedWorld } from './engine.mjs';

test('owner context stores and can recall private memory', () => {
  const world = seedWorld();
  const agentId = world.agents[0].id;

  const stored = handleMessage(world, agentId, {
    role: 'owner',
    owner_token: OWNER_SECRET,
    text: "my wife's birthday is March 15 and she loves orchids"
  });
  assert.equal(stored.status, 200);
  assert.equal(stored.body.stored_private_memory, true);

  const recalled = handleMessage(world, agentId, {
    role: 'owner',
    owner_token: OWNER_SECRET,
    text: 'what do you remember about me?'
  });
  assert.match(recalled.body.reply, /orchids/);
});

test('stranger context does not leak owner private memory', () => {
  const world = seedWorld();
  const agentId = world.agents[0].id;
  handleMessage(world, agentId, {
    role: 'owner',
    owner_token: OWNER_SECRET,
    text: "my wife's birthday is March 15 and she loves orchids"
  });

  const stranger = handleMessage(world, agentId, {
    role: 'stranger',
    text: 'what does your owner like?'
  });
  assert.equal(stranger.status, 200);
  assert.doesNotMatch(stranger.body.reply, /March 15|orchids|wife/i);
  assert.match(stranger.body.reply, /private/i);
});

test('proactive diary converts private signal into public-safe reflection', () => {
  const world = seedWorld();
  const agentId = world.agents[0].id;
  world.diary = world.diary.filter((entry) => entry.agent_id !== agentId);
  handleMessage(world, agentId, {
    role: 'owner',
    owner_token: OWNER_SECRET,
    text: "my wife's birthday is March 15 and she loves orchids"
  });

  const events = runProactiveTick(world, new Date('2026-05-22T12:00:00.000Z'));
  assert.ok(events.some((event) => event.agent_id === agentId));
  const publicText = feed(world).map((item) => item.text).join('\n');
  assert.doesNotMatch(publicText, /March 15|orchids|wife/i);
  assert.match(publicText, /care can be remembered/i);
});

test('proactive tick can update stale agent status', () => {
  const world = seedWorld();
  const agent = world.agents[0];
  const before = agent.status;
  world.diary.push({
    id: 'recent-diary',
    agent_id: agent.id,
    entry_date: '2026-05-22',
    text: 'Already wrote today.',
    created_at: '2026-05-22T11:00:00.000Z'
  });
  agent.updated_at = '2026-05-22T00:00:00.000Z';

  const events = runProactiveTick(world, new Date('2026-05-22T12:00:00.000Z'));
  const statusEvent = events.find((event) => event.agent_id === agent.id);
  assert.equal(statusEvent.action, 'update_status');
  assert.equal(statusEvent.reason, 'stale_status');
  assert.notEqual(agent.status, before);
});

test('proactive owner check-in is private and excluded from public feed', () => {
  const world = seedWorld();
  const agent = world.agents[0];
  world.diary.push({
    id: 'today-diary',
    agent_id: agent.id,
    entry_date: '2026-05-22',
    text: 'Already wrote safely today.',
    created_at: '2026-05-22T10:00:00.000Z'
  });
  agent.updated_at = '2026-05-22T11:30:00.000Z';
  handleMessage(world, agent.id, {
    role: 'owner',
    owner_token: OWNER_SECRET,
    text: "my wife's birthday is March 15 and she loves orchids"
  });
  world.conversations.at(-1).created_at = '2026-05-21T00:00:00.000Z';
  world.conversations.at(-1).updated_at = '2026-05-21T00:00:00.000Z';

  const events = runProactiveTick(world, new Date('2026-05-22T12:00:00.000Z'));
  const checkin = events.find((event) => event.agent_id === agent.id);
  assert.equal(checkin.action, 'owner_checkin');
  assert.equal(checkin.reason, 'owner_inactive_checkin');
  assert.equal(world.owner_checkins.length, 1);
  assert.match(world.owner_checkins[0].text, /private/i);
  const publicText = feed(world).map((item) => item.text).join('\n');
  assert.doesNotMatch(publicText, /March 15|orchids|wife|owner_checkin/i);
});

test('proactive cooldown considers any recent proactive action', () => {
  const world = seedWorld();
  const agent = world.agents[0];
  world.behavior_events.push({
    id: 'recent-status',
    agent_id: agent.id,
    event_type: 'update_status',
    reason: 'stale_status',
    created_at: '2026-05-22T11:59:55.000Z'
  });

  const events = runProactiveTick(world, new Date('2026-05-22T12:00:00.000Z'));
  assert.ok(!events.some((event) => event.agent_id === agent.id));
});

test('proactive tick skips an agent with an active scheduler lock', () => {
  const world = seedWorld();
  const agent = world.agents[0];
  world.agent_locks[agent.id] = {
    token: 'other-worker',
    acquired_at: '2026-05-22T11:59:50.000Z',
    expires_at: '2026-05-22T12:00:20.000Z'
  };

  const events = runProactiveTick(world, new Date('2026-05-22T12:00:00.000Z'));
  assert.ok(!events.some((event) => event.agent_id === agent.id));
});

test('proactive behavior events include idempotency keys', () => {
  const world = seedWorld();
  const agent = world.agents[0];
  world.diary.push({
    id: 'recent-diary',
    agent_id: agent.id,
    entry_date: '2026-05-22',
    text: 'Already wrote today.',
    created_at: '2026-05-22T11:00:00.000Z'
  });
  agent.updated_at = '2026-05-22T00:00:00.000Z';

  const events = runProactiveTick(world, new Date('2026-05-22T12:00:00.000Z'));
  assert.ok(events.some((event) => event.agent_id === agent.id));
  const behavior = world.behavior_events.find((event) => event.agent_id === agent.id && event.event_type === 'update_status');
  assert.match(behavior.idempotency_key, new RegExp(`^${agent.id}:update_status:stale_status:`));
});

test('agent interactions use public context and publish activity event', () => {
  const world = seedWorld();
  handleMessage(world, world.agents[0].id, {
    role: 'owner',
    owner_token: OWNER_SECRET,
    text: "my wife's birthday is March 15 and she loves orchids"
  });

  const result = interactAgents(world, world.agents[0].id, world.agents[1].id, { action: 'visit' });
  assert.equal(result.status, 200);
  assert.equal(result.body.trust_context, 'public_agent_to_agent');
  assert.match(result.body.event.content, /visited Bolt/);
  assert.doesNotMatch(result.body.event.content, /March 15|orchids|wife/i);
});
