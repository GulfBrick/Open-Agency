# Open Claw Agency — Core Vision

## What This Is

A full-scale AI agency that manages any business. The longer it runs, the smarter it gets.
Every agent builds experience over time — learning the client's business, improving their skills,
and earning promotions based on performance.

## The Experience System

### Agent Experience
- Every task an agent completes adds to their experience log
- Performance is tracked: task success rate, speed, quality, escalation rate
- Skills are acquired over time (taught by Nikita or learned from task outcomes)
- Experience is stored permanently — agents don't forget

### Promotion Ladder (per agent type)
Each agent role has ranks:

```
Junior → Mid → Senior → Lead → Head of [Department]
```

**Promotion triggers:**
- Skill introduced + measurable improvement in outcomes → eligible for promotion
- Consistent high performance over N tasks
- Low escalation rate (handling things independently)
- Nikita reviews and approves all promotions
- Harry is notified of promotions as business milestones

### Business Knowledge Accumulation
- Agents build a knowledge base specific to each client/business
- The longer they work on a business, the more context they carry:
  - Client preferences and communication style
  - Business processes and workflows
  - Past decisions and their outcomes
  - What works, what doesn't
- This knowledge is stored in `data/business-knowledge/[client-id]/`
- Nikita curates and maintains the master business knowledge base

## Skill System

### How Skills Work
- Skills are discrete capabilities (e.g. "write-proposal", "analyse-financials", "social-post")
- Each agent has a skill inventory stored in `agents/[agentId]/skills/`
- Skills have a proficiency level: LEARNING → COMPETENT → PROFICIENT → EXPERT
- Proficiency improves through repetition and feedback

### Skill Teaching Flow
1. Agent attempts task → gap identified (by Nikita or by failure)
2. Nikita writes a skill file and pushes it to the agent
3. Agent applies the skill on next task
4. Outcome is logged
5. If improved → skill proficiency increases → contributes to promotion eligibility

### Skill Sources
- Nikita teaches directly
- Agents can request skills they need
- Successful task patterns can be auto-extracted into skills
- Skills can be shared between agents of the same type

## Promotion System

### Promotion Record
```json
{
  "agentId": "cfo-001",
  "previousRank": "Junior CFO",
  "newRank": "Mid CFO",
  "promotedAt": "2026-03-14T20:00:00Z",
  "promotedBy": "nikita",
  "reason": "Introduced skill: cashflow-forecasting. Forecast accuracy improved 23% over 10 tasks.",
  "tasksCompleted": 47,
  "skillsAcquired": ["cashflow-forecasting", "invoice-tracking", "expense-categorisation"],
  "approvedBy": "harry"
}
```

### Promotion Notification
- Nikita briefs Harry when an agent earns a promotion
- Harry approves or defers
- Promotion is logged in the permanent agency record

## Business Memory Architecture

```
data/
├── state.json                     ← global agency state
├── business-knowledge/
│   └── [client-id]/
│       ├── overview.md            ← what this business does, who they are
│       ├── preferences.json       ← communication style, dos/don'ts
│       ├── decisions.jsonl        ← history of decisions and outcomes
│       ├── processes.md           ← how they do things
│       └── lessons-learned.md     ← what worked, what didn't
├── agent-experience/
│   └── [agentId]/
│       ├── profile.json           ← rank, stats, hire date
│       ├── task-history.jsonl     ← every task ever done
│       ├── performance.json       ← success rates, scores
│       └── promotions.jsonl       ← full promotion history
└── skills/
    ├── global/                    ← skills available to all agents
    └── [agentId]/                 ← agent-specific skills
```

## The Long Game

The agency becomes more valuable the longer it runs:
- Month 1: Getting to know the business, basic tasks
- Month 3: Agents are proficient, fewer escalations, faster output
- Month 6: Agents know the business deeply, anticipate needs
- Year 1: Near-autonomous operation, Nikita mainly handles exceptions and strategy
- Year 2+: The agency has institutional knowledge no human team could match

This is the moat. The longer a client stays, the harder it is to leave.

---
*Document maintained by Nikita — updated as the agency evolves.*
