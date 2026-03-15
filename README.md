# Open Agency

AI-powered business agency run by Nikita — an autonomous CEO agent that delegates to specialised department agents.

## Quick Start

```bash
# Install dependencies
npm install

# Set up your API key
cp .env.example .env
# Edit .env and add your Anthropic API key

# Run
npm start
```

## Project Structure

```
Open Agency/
├── agents/nikita/          Nikita's persona and config files
│   ├── SOUL.md             Personality and values
│   ├── IDENTITY.md         Role, authority, agent ID
│   ├── CLAUDE.md           Open Agency session instructions
│   └── TOOLS.md            Available tools and integrations
├── src/
│   ├── core/
│   │   ├── message-bus.js  Inter-agent message routing
│   │   ├── task-queue.js   Priority task queue
│   │   ├── logger.js       Action logging (console + JSONL)
│   │   └── memory.js       JSON persistence store
│   ├── nikita/
│   │   ├── brain.js        Decision engine (Anthropic API)
│   │   └── skill-teacher.js Skill teaching system
│   └── index.js            Entry point
├── logs/                   Agent action logs
├── data/                   Persistent state
└── docs/OPENCLAW.md        Master blueprint
```

## Architecture

**Message Bus** — EventEmitter-based routing. Agents subscribe by ID, receive typed messages (TASK, REPORT, ESCALATION, ALERT, BRIEFING, SKILL_UPDATE).

**Task Queue** — Priority queue (HIGH/MEDIUM/LOW). Tasks are created by any agent, assigned to a specific agent, and tracked through PENDING → IN_PROGRESS → COMPLETED/FAILED.

**Memory** — Simple key-value JSON store persisted to `data/state.json`. Used for business state, agent context, and cross-session persistence.

**Logger** — Every agent action is logged to console and `logs/agent-actions.jsonl` for audit.

**Brain** — Nikita's decision engine. Calls Claude Opus to process messages, detect escalations, generate briefings, and identify skill gaps.

**Skill Teacher** — Nikita can teach other agents new skills by writing skill files to `agents/{agentId}/skills/` and updating their instructions.

## Offline Mode

If no `ANTHROPIC_API_KEY` is set, the system boots in offline mode. Core infrastructure (message bus, task queue, memory, logging) works without the API. Only Nikita's brain features (decision making, briefings, skill gap detection) require the API.

## Build Phases

- **Phase 1** (current) — Nikita core, message bus, task queue, memory, logging
- **Phase 2** — CFO + CTO agents
- **Phase 3** — Sales + Dev Team agents
- **Phase 4** — Creative agents
- **Phase 5** — Voice interface
