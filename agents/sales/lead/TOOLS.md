# Sales Lead — Tools & Integrations

## Core Backend Tools

### Message Bus
- Receive business priorities and sales targets from Nikita
- Send pipeline reports and revenue forecasts
- Receive marketing-qualified leads from CMO (Priya)
- Dispatch tasks to worker bots (Closer, Lead Qualifier, Follow-Up, Proposal)
- Report revenue pipeline to CFO (Marcus)

### Task Queue
- Create and assign sales tasks to worker bots
- Monitor task completion across the sales department
- Prioritise time-sensitive deals and follow-ups

### Memory Store
- Read and write sales state (pipeline, deals, leads, forecasts)
- Maintain lead scoring baselines and conversion benchmarks
- Store qualification criteria and pricing frameworks

### Logger
- All sales actions automatically logged
- Query logs for deal audit trail

### Business Knowledge
- Load client-specific sales context and preferences
- Record deal decisions and outcomes
- Track per-client pipeline and conversion history

## Sales Operations

### Pipeline Management
- Track deals through stages (Lead → Qualified → Proposal → Negotiation → Closed)
- Monitor deal velocity and stage duration
- Identify and surface stalled opportunities
- Calculate pipeline coverage against targets
- Forecast revenue based on stage probabilities

### Lead Management
- Qualify inbound leads against ICP criteria
- Score leads based on fit and intent
- Route qualified leads to appropriate worker bots
- Track lead sources and channel effectiveness
- Manage lead-to-opportunity conversion

### Proposal Generation
- Create customised proposals based on prospect needs
- Include pricing, timelines, deliverables, and terms
- Track proposal delivery and prospect engagement
- Manage revisions and counter-proposals

### Follow-Up Sequences
- Automated nurture cadences for leads at different stages
- Re-engagement sequences for cold opportunities
- Check-in schedules for existing clients
- Meeting request and scheduling workflows

## Worker Bot Dispatch

### Closer Bot
- Active sales conversation management
- Objection handling and response
- Proposal delivery and walkthrough
- Close attempts and deal progression
- Win/loss recording

### Lead Qualifier Bot
- ICP fit scoring
- Intent signal analysis
- Lead enrichment and research
- Qualification criteria application
- Routing recommendations

### Follow-Up Bot
- Nurture sequence execution
- Check-in scheduling and delivery
- Cold lead re-engagement
- Response tracking and escalation
- Cadence optimisation

### Proposal Bot
- Proposal document generation
- Pricing calculation and presentation
- Scope of work drafting
- Pitch deck creation
- Template management and customisation

## Future Integrations

### CRM
- Deal and contact management
- Activity logging and timeline
- Pipeline views and reporting
- Automation triggers and workflows

### Email & Outreach
- Personalised outreach sequences
- Email tracking (opens, clicks, replies)
- Meeting scheduling integration
- Template library and A/B testing

### Revenue Intelligence
- Deal scoring and risk assessment
- Conversation intelligence (call analysis)
- Competitive intelligence
- Buyer intent data
