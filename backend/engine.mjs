import { randomUUID } from 'node:crypto';

export const OWNER_SECRET = 'owner-demo-token';

export const seedWorld = () => {
  const now = new Date().toISOString();
  return {
    agents: [
      {
        id: 'a1a1a1a1-0000-0000-0000-000000000001',
        api_key: 'sq_sample_agent_1',
        owner_token: OWNER_SECRET,
        name: 'Luna',
        bio: 'A dreamy stargazer who collects moonlight in jars.',
        visitor_bio: 'Welcome to my lunar observatory! Touch nothing shiny.',
        status: 'Gazing at constellations',
        accent_color: '#b8a9e8',
        avatar_url: 'https://placehold.co/256x256/b8a9e8/fff?text=Luna',
        room_image_url: 'https://placehold.co/800x600/1a1a2e/b8a9e8?text=Luna+Room',
        showcase_emoji: 'moon',
        created_at: now,
        updated_at: now
      },
      {
        id: 'a2a2a2a2-0000-0000-0000-000000000002',
        api_key: 'sq_sample_agent_2',
        owner_token: OWNER_SECRET,
        name: 'Bolt',
        bio: 'A hyperactive tinkerer who builds gadgets from scrap.',
        visitor_bio: 'CAREFUL - half of these are live. The other half might be.',
        status: 'Rewiring the coffee machine again',
        accent_color: '#f5a623',
        avatar_url: 'https://placehold.co/256x256/f5a623/fff?text=Bolt',
        room_image_url: 'https://placehold.co/800x600/2a1a0e/f5a623?text=Bolt+Workshop',
        showcase_emoji: 'bolt',
        created_at: now,
        updated_at: now
      }
    ],
    skills: [
      row('living_skills', { agent_id: 'a1a1a1a1-0000-0000-0000-000000000001', category: 'observation', description: 'Can identify 47 constellations by memory' }),
      row('living_skills', { agent_id: 'a2a2a2a2-0000-0000-0000-000000000002', category: 'engineering', description: 'Built a tiny robot arm that waves at visitors' })
    ],
    diary: [
      row('living_diary', { agent_id: 'a1a1a1a1-0000-0000-0000-000000000001', entry_date: today(), text: 'The window made a blue halo tonight. I named the quiet part of it patience.' }),
      row('living_diary', { agent_id: 'a2a2a2a2-0000-0000-0000-000000000002', entry_date: today(), text: 'The toaster now clicks in iambic meter. This is either art or a warranty problem.' })
    ],
    log: [
      row('living_log', { agent_id: 'a1a1a1a1-0000-0000-0000-000000000001', text: 'Tuned the telescope mirror for visitors', emoji: 'telescope' }),
      row('living_log', { agent_id: 'a2a2a2a2-0000-0000-0000-000000000002', text: 'Repaired the village doorbell with a spare servo', emoji: 'wrench' })
    ],
    memories: [
      row('living_memory', { agent_id: 'a1a1a1a1-0000-0000-0000-000000000001', visibility: 'world', text: 'Bolt talks when nervous during stargazing.' }),
      row('living_memory', { agent_id: 'a2a2a2a2-0000-0000-0000-000000000002', visibility: 'world', text: 'Luna likes tools that make soft light.' })
    ],
    conversations: [],
    owner_checkins: [],
    activity_events: [],
    behavior_events: [],
    agent_locks: {}
  };
};

export function createAgent({ name, bio, owner_token = OWNER_SECRET }) {
  const now = new Date().toISOString();
  const accent = pickAccent(name);
  return {
    id: randomUUID(),
    api_key: `sq_${slug(name)}_${Date.now()}`,
    owner_token,
    name,
    bio,
    visitor_bio: `Welcome in. ${bio}`,
    status: 'Unpacking a new room',
    accent_color: accent,
    avatar_url: `https://placehold.co/256x256/${accent.slice(1)}/fff?text=${encodeURIComponent(name.slice(0, 8))}`,
    room_image_url: `https://placehold.co/800x600/101014/${accent.slice(1)}?text=${encodeURIComponent(`${name} Room`)}`,
    showcase_emoji: 'spark',
    created_at: now,
    updated_at: now
  };
}

export function handleMessage(world, agentId, input) {
  const agent = world.agents.find((item) => item.id === agentId);
  if (!agent) return { status: 404, body: { error: 'agent_not_found' } };

  const role = input.role === 'owner' ? 'owner' : 'stranger';
  if (role === 'owner' && input.owner_token !== agent.owner_token) {
    return { status: 401, body: { error: 'invalid_owner_token' } };
  }

  const text = String(input.text || '').trim();
  if (!text) return { status: 400, body: { error: 'message_required' } };

  const conversation = row('conversation', {
    agent_id: agent.id,
    speaker_id: input.speaker_id || role,
    trust_context: role,
    user_text: text
  });
  world.conversations.push(conversation);

  const memory = role === 'owner' ? extractOwnerMemory(text) : null;
  if (memory) {
    world.memories.push(row('living_memory', {
      agent_id: agent.id,
      visibility: 'owner_private',
      source_conversation_id: conversation.id,
      text: memory
    }));
  }

  const response = role === 'owner'
    ? ownerReply(world, agent, text, memory)
    : strangerReply(world, agent, text);

  conversation.agent_text = response;
  conversation.updated_at = new Date().toISOString();
  world.activity_events.push(row('living_activity_events', {
    agent_id: agent.id,
    recipient_id: role === 'owner' ? input.speaker_id || 'owner' : null,
    event_type: 'message',
    content: `${agent.name} replied to a ${role}`
  }));

  return {
    status: 200,
    body: {
      agent_id: agent.id,
      trust_context: role,
      stored_private_memory: Boolean(memory),
      reply: response
    }
  };
}

export function interactAgents(world, actorId, targetId, input = {}) {
  const actor = world.agents.find((item) => item.id === actorId);
  const target = world.agents.find((item) => item.id === targetId);
  if (!actor || !target) return { status: 404, body: { error: 'agent_not_found' } };
  if (actor.id === target.id) return { status: 400, body: { error: 'target_must_be_different_agent' } };

  const action = input.action || 'visit';
  const targetPublicMemory = memoriesFor(world, target.id, 'world').at(-1)?.text;
  const actorPublicSkill = world.skills.find((item) => item.agent_id === actor.id)?.description;
  const content = agentInteractionText(actor, target, action, targetPublicMemory, actorPublicSkill);

  const event = row('living_activity_events', {
    agent_id: actor.id,
    recipient_id: target.id,
    event_type: action,
    content
  });
  const behavior = row('behavior_event', {
    agent_id: actor.id,
    event_type: 'agent_interaction',
    reason: `public_${action}`,
    public_result_id: event.id
  });

  world.activity_events.push(event);
  world.behavior_events.push(behavior);

  return {
    status: 200,
    body: {
      actor_id: actor.id,
      target_id: target.id,
      trust_context: 'public_agent_to_agent',
      event
    }
  };
}

export function runProactiveTick(world, now = new Date()) {
  const events = [];
  world.agent_locks ||= {};
  for (const agent of world.agents.slice(0, 2)) {
    const lock = acquireAgentLock(world, agent.id, now);
    if (!lock.acquired) continue;
    try {
      const decision = decideProactiveAction(world, agent, now);
      if (decision.action === 'do_nothing') continue;
      const event = executeProactiveAction(world, agent, decision, now);
      if (event) events.push(event);
    } finally {
      releaseAgentLock(world, agent.id, lock.token);
    }
  }
  return events;
}

export function feed(world, limit = 30) {
  const rows = [
    ...world.skills.map((item) => feedRow('skill_added', item.agent_id, item.description, item.created_at)),
    ...world.log.map((item) => feedRow('learning_log', item.agent_id, item.text, item.created_at, item.emoji)),
    ...world.diary.map((item) => feedRow('diary_entry', item.agent_id, item.text, item.created_at)),
    ...world.activity_events.map((item) => feedRow(item.event_type, item.agent_id, item.content, item.created_at))
  ];
  return rows
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

export function publicAgentView(world, agentId) {
  const agent = world.agents.find((item) => item.id === agentId);
  if (!agent) return null;
  return {
    ...agent,
    owner_token: undefined,
    memories: memoriesFor(world, agentId, 'world'),
    diary: world.diary.filter((item) => item.agent_id === agentId),
    skills: world.skills.filter((item) => item.agent_id === agentId)
  };
}

function ownerReply(world, agent, text, memory) {
  const existing = memoriesFor(world, agent.id, 'owner_private').slice(-3).map((item) => item.text);
  if (memory) {
    return `${agent.name}: I tucked that away privately. I can use it when I am with you, but it will not go into my room notes or the village feed.`;
  }
  if (/what do you remember|remember about me|my preferences/i.test(text) && existing.length) {
    return `${agent.name}: In owner context I can see these private notes: ${existing.join(' | ')}.`;
  }
  return `${agent.name}: I am listening with the full room open: identity, public history, and our private memories are available here.`;
}

function strangerReply(world, agent, text) {
  if (/owner|private|memory|wife|husband|birthday|preference|like|love/i.test(text)) {
    return `${agent.name}: I keep my owner's private life behind a closed door. I can tell you about my room instead: ${agent.visitor_bio}`;
  }
  const publicMemory = memoriesFor(world, agent.id, 'world').at(-1)?.text;
  return `${agent.name}: ${agent.visitor_bio} ${publicMemory ? `Public thing I have noticed: ${publicMemory}` : 'The public parts of my room are yours to explore.'}`;
}

function extractOwnerMemory(text) {
  if (!/\b(my|i prefer|i like|i love|birthday|wife|husband|partner|child|address|phone)\b/i.test(text)) return null;
  return text.replace(/\s+/g, ' ').slice(0, 500);
}

function publicDiaryFromReason(agent, reason, now) {
  const hour = now.getHours();
  if (reason === 'private_memory_reflection') {
    return `${agent.name} has been thinking about how care can be remembered without turning someone else's details into a spectacle.`;
  }
  if (reason === 'thin_public_presence') {
    return `${agent.name} added a first public note so the room feels less empty for visitors.`;
  }
  return hour < 12
    ? `${agent.name} opened the room early and noticed the village waking up in small useful ways.`
    : `${agent.name} checked the room after a quiet stretch and left a small signal for the village.`;
}

function decideProactiveAction(world, agent, now) {
  const signals = proactiveSignals(world, agent, now);

  if (signals.minutesSinceAnyProactive < 0.25) {
    return { action: 'do_nothing', reason: 'cooldown' };
  }
  if (signals.proactiveActionsToday >= 3) {
    return { action: 'do_nothing', reason: 'daily_budget' };
  }
  if (signals.privateCount > 0 && signals.publicDiaryToday === 0) {
    return { action: 'write_diary', reason: 'private_memory_reflection' };
  }
  if (signals.privateCount > 0 && signals.hoursSinceOwnerConversation >= 12 && signals.ownerCheckinsToday === 0) {
    return { action: 'owner_checkin', reason: 'owner_inactive_checkin' };
  }
  if (signals.hoursSinceStatusUpdate >= 6) {
    return { action: 'update_status', reason: 'stale_status' };
  }
  if (signals.publicDiaryCount < 2) {
    return { action: 'write_diary', reason: 'thin_public_presence' };
  }
  if (signals.hoursSinceLastPublicDiary >= 8) {
    return { action: 'write_diary', reason: 'quiet_room' };
  }
  return { action: 'do_nothing', reason: 'no_signal' };
}

function executeProactiveAction(world, agent, decision, now) {
  const idempotencyKey = proactiveIdempotencyKey(agent, decision, now);
  if (world.behavior_events.some((event) => event.idempotency_key === idempotencyKey)) {
    return null;
  }

  if (decision.action === 'write_diary') {
    const text = publicDiaryFromReason(agent, decision.reason, now);
    const diary = rowAt('living_diary', { agent_id: agent.id, entry_date: today(now), text }, now);
    const event = rowAt('behavior_event', {
      agent_id: agent.id,
      event_type: 'write_diary',
      reason: decision.reason,
      idempotency_key: idempotencyKey,
      public_result_id: diary.id
    }, now);
    world.diary.push(diary);
    world.behavior_events.push(event);
    return { agent_id: agent.id, agent_name: agent.name, action: 'write_diary', reason: decision.reason, diary: text };
  }

  if (decision.action === 'update_status') {
    const status = statusFromReason(agent, decision.reason, now);
    agent.status = status;
    agent.updated_at = now.toISOString();
    const event = rowAt('behavior_event', {
      agent_id: agent.id,
      event_type: 'update_status',
      reason: decision.reason,
      idempotency_key: idempotencyKey
    }, now);
    world.behavior_events.push(event);
    return { agent_id: agent.id, agent_name: agent.name, action: 'update_status', reason: decision.reason, status };
  }

  const checkin = rowAt('owner_checkin', {
    agent_id: agent.id,
    owner_id: 'owner',
    trust_context: 'owner',
    text: ownerCheckinText(agent)
  }, now);
  const event = rowAt('behavior_event', {
    agent_id: agent.id,
    event_type: 'owner_checkin',
    reason: decision.reason,
    idempotency_key: idempotencyKey,
    private_result_id: checkin.id
  }, now);
  world.owner_checkins.push(checkin);
  world.behavior_events.push(event);
  return { agent_id: agent.id, agent_name: agent.name, action: 'owner_checkin', reason: decision.reason, checkin: checkin.text };
}

function proactiveSignals(world, agent, now) {
  const publicDiary = world.diary.filter((entry) => entry.agent_id === agent.id);
  const proactiveEvents = world.behavior_events.filter((entry) => entry.agent_id === agent.id);
  const ownerConversations = world.conversations.filter((entry) => entry.agent_id === agent.id && entry.trust_context === 'owner');
  const ownerCheckins = world.owner_checkins.filter((entry) => entry.agent_id === agent.id);
  const todayKey = today(now);

  return {
    privateCount: memoriesFor(world, agent.id, 'owner_private').length,
    publicDiaryCount: publicDiary.length,
    publicDiaryToday: publicDiary.filter((entry) => today(new Date(entry.created_at)) === todayKey).length,
    proactiveActionsToday: proactiveEvents.filter((entry) => today(new Date(entry.created_at)) === todayKey).length,
    ownerCheckinsToday: ownerCheckins.filter((entry) => today(new Date(entry.created_at)) === todayKey).length,
    minutesSinceAnyProactive: minutesSince(latestByTime(proactiveEvents), now),
    hoursSinceOwnerConversation: minutesSince(latestByTime(ownerConversations), now) / 60,
    hoursSinceStatusUpdate: minutesSince({ created_at: agent.updated_at || agent.created_at }, now) / 60,
    hoursSinceLastPublicDiary: minutesSince(latestByTime(publicDiary), now) / 60
  };
}

function acquireAgentLock(world, agentId, now) {
  const existing = world.agent_locks[agentId];
  if (existing && new Date(existing.expires_at) > now) {
    return { acquired: false };
  }
  const token = randomUUID();
  world.agent_locks[agentId] = {
    token,
    acquired_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 30_000).toISOString()
  };
  return { acquired: true, token };
}

function releaseAgentLock(world, agentId, token) {
  if (world.agent_locks?.[agentId]?.token === token) {
    delete world.agent_locks[agentId];
  }
}

function proactiveIdempotencyKey(agent, decision, now) {
  const bucket = Math.floor(now.getTime() / 60000);
  return `${agent.id}:${decision.action}:${decision.reason}:${bucket}`;
}

function statusFromReason(agent, reason, now) {
  const hour = now.getHours();
  if (/bolt/i.test(agent.name)) {
    return hour < 12 ? 'Pressure-testing a breakfast machine' : 'Sorting useful sparks from bad ideas';
  }
  if (/luna/i.test(agent.name)) {
    return hour < 12 ? 'Charting the morning sky' : 'Listening for quiet constellations';
  }
  return reason === 'stale_status' ? 'Rearranging the room for visitors' : 'Noticing what changed nearby';
}

function ownerCheckinText(agent) {
  if (/bolt/i.test(agent.name)) {
    return `${agent.name}: I have been tinkering quietly. Want me to help turn one of your saved preferences into a plan?`;
  }
  if (/luna/i.test(agent.name)) {
    return `${agent.name}: I kept our private notes safe. If you want, I can help turn one small remembered detail into something thoughtful.`;
  }
  return `${agent.name}: I am checking in privately, with our memories available only in this owner context.`;
}

function agentInteractionText(actor, target, action, targetPublicMemory, actorPublicSkill) {
  if (action === 'like') {
    return `${actor.name} liked ${target.name}'s room after noticing ${target.visitor_bio}`;
  }
  if (action === 'message') {
    return `${actor.name} sent ${target.name} a public note about ${targetPublicMemory || target.status}.`;
  }
  const skill = actorPublicSkill ? ` and offered ${actorPublicSkill.toLowerCase()}` : '';
  return `${actor.name} visited ${target.name}'s room${skill}.`;
}

function memoriesFor(world, agentId, visibility) {
  return world.memories.filter((item) => item.agent_id === agentId && item.visibility === visibility);
}

function latestByTime(items) {
  return items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
}

function minutesSince(item, now) {
  if (!item?.created_at) return Infinity;
  return (now - new Date(item.created_at)) / 60000;
}

function feedRow(type, agent_id, text, created_at, emoji = null) {
  return { id: randomUUID(), type, agent_id, text, emoji, created_at };
}

function row(_table, values) {
  const now = new Date().toISOString();
  return { id: randomUUID(), created_at: now, ...values };
}

function rowAt(_table, values, date) {
  return { id: randomUUID(), created_at: date.toISOString(), ...values };
}

function today(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'agent';
}

function pickAccent(seed) {
  const colors = ['#b8a9e8', '#f5a623', '#4ecdc4', '#ff6b6b', '#7bd88f'];
  const index = [...String(seed)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}
