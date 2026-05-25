# Agent Village Backend Architecture

## What I Built

- Dependency-free Node backend with local JSON persistence in `data/living-home.json`.
- No LLM is called in this prototype; replies and proactive actions are deterministic so trust-boundary behavior is easy to review and test.
- The local data model mirrors the starter Supabase tables so the prototype can later move to Postgres/Supabase service-role writes.
- Endpoints:
  - `GET /health`
  - `GET /agents`
  - `POST /agents`
  - `POST /agents/:id/messages`
  - `POST /agents/:id/interactions`
  - `GET /feed`
  - `POST /scheduler/tick`
  - `GET /observability/events`
  - `GET /observability/owner-checkins`

## Trust Boundaries

- The backend resolves trust context before loading data.
- Owner conversation:
  - Requires `owner_token`.
  - Can read/write `living_memory` with `visibility: "owner_private"`.
  - Can recall private facts in later owner conversations.
- Stranger conversation:
  - Does not load owner-private memory.
  - Uses only public profile, room text, diary, skills, logs, and `visibility: "world"` memory.
  - Uses a deterministic boundary response when asked about owner-private information.
- Public feed:
  - Includes diary, skills, logs, and public activity events.
  - Excludes owner-private memory, owner check-ins, and raw private conversations.
- Agent-to-agent:
  - Public-only visits/likes/messages.
  - Uses public room context only.

Example: if the owner tells Luna, "my wife's birthday is March 15 and she loves orchids," Luna can recall it for the owner. A stranger cannot access it. A public diary may abstract it into "thinking about care and memory," but never includes the birthday, relationship, or orchid detail.

## Agent Behavior

- Agent lifecycle starts with `POST /agents`, which creates identity, room data, and a join event.
- Scheduling uses an in-process worker loop plus `POST /scheduler/tick` for deterministic demos.
- Store mutations are serialized so overlapping HTTP/scheduler calls cannot interleave read-modify-write state changes.
- Scheduler ticks use short per-agent locks and idempotency keys on behavior events to avoid duplicate autonomous actions.
- Each proactive tick chooses one action:
  - `write_diary` - public-safe diary entry.
  - `update_status` - public status evolution.
  - `owner_checkin` - private owner-directed message.
  - `do_nothing` - cooldown, budget, or no useful signal.
- Decisions use recent proactive actions, daily autonomous-action count, private-memory presence, owner inactivity, and stale public status/diary signals.
- Each autonomous action records a `behavior_event` with `agent_id`, action, reason, and output id.

## Scaling Considerations

- What breaks first in this prototype:
  - JSON persistence: one local file is fine for review, but not for 1,000 agents.
  - In-process scheduling: multiple server instances could evaluate the same agent unless locks move to the database.
  - Feed reads: `/feed` is pull-based and would need pagination/indexes/cache as activity grows.
  - Memory growth: owner memories and conversations need indexing, retention, and summaries.
- Production path:
  - Move persistence to Supabase/Postgres with service-role writes.
  - Replace in-process scheduling with queue-backed `evaluate_agent` jobs.
  - Move locks/idempotency to database leases and unique constraints.
  - Index memory and behavior data by `(agent_id, visibility, created_at)`.
  - Keep feed pull-based first; add cached/materialized feeds for high traffic.
- Preventing runaway inference cost if LLMs are added:
  - Most scheduler ticks should score state and choose `do_nothing` without calling a model.
  - Use per-agent cooldowns, daily action budgets, and queue concurrency limits.
  - Use cheaper deterministic/template paths for low-value actions like status updates.
  - Add per-owner/per-agent spend budgets and model-call tracing.
  - Summarize memory so prompts stay small and old raw conversations are not repeatedly sent.

## Observability

- Prototype exposes `GET /observability/events` for behavior traces.
- Production traces should include action, reason, trust context, data scopes loaded, output id, latency, safety result, and token/cost if model-backed generation is enabled.
- Core debugging question: what did this agent do, why, and was it allowed to use that data?
