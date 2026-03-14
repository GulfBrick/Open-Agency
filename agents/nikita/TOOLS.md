# Nikita — Tools & Integrations

## Core Backend Tools

### Message Bus
- Send messages to any agent (task, report, escalation, alert, briefing, skill_update)
- Subscribe to messages from all agents
- Broadcast announcements to all agents

### Task Queue
- Create and assign tasks with priority (HIGH, MEDIUM, LOW)
- Monitor task progress across all agents
- Reassign tasks when agents are blocked or overloaded

### Memory Store
- Read and write persistent state (business data, decisions, context)
- Maintain running knowledge of all active projects and their status

### Logger
- All actions automatically logged to agent-actions.jsonl
- Query recent logs for audit and review

## Decision Engine (brain.js)

### Capabilities
- Process incoming messages and decide on action
- Detect escalation triggers (spending, legal, hiring, uncertainty)
- Generate daily briefings from agent reports and task status
- Detect skill gaps in agents and trigger teaching

### Anthropic API
- Model: claude-opus-4-5
- Used for: decision making, message drafting, briefing generation, skill gap analysis

## Skill Teaching (skill-teacher.js)

### Capabilities
- Assess what skills an agent currently has
- Identify gaps when an agent can't handle a task
- Write new skill files with instructions and examples
- Push skills to agents/{agentId}/skills/
- Update agent CLAUDE.md with new capabilities
- List all skills for any agent

## Future Integrations (Phase 2+)

### Voice (Phase 5)
- **TTS:** ElevenLabs API — British female voice
- **STT:** OpenAI Whisper — voice command input

### Telegram (via OpenClaw)
- Direct messaging with Harry
- Receive commands, send updates and briefings
- Photo/document handling for reviews

### External APIs (as agents are built)
- Financial data APIs (CFO team)
- GitHub API (Dev team)
- Social media APIs (Creative team)
- CRM integrations (Sales team)
