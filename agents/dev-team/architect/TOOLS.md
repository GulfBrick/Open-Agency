# Architect Bot — Tools & Integrations

## Core Tools

### Message Bus
- Receive design requests from Dev Team Lead
- Send completed specs and design docs to Dev Team Lead
- Notify dev bots of architectural decisions that affect their work

### Task Queue
- Pick up design tasks from the sprint queue
- Report design completion and hand off to implementation

### Memory Store
- Store and retrieve design documents and specs
- Maintain architecture decision records (ADRs)
- Track API contracts and schema versions per client

### Logger
- Log all design decisions and spec completions

### Business Knowledge
- Load client-specific technical context (stack, conventions, existing architecture)
- Reference client codebase patterns for consistency

## Design Operations

### System Design
- Analyse requirements and produce component architecture
- Map data flows between system components
- Identify integration points and external dependencies
- Define error handling and failure recovery strategies

### API Design
- Define endpoint contracts (REST, GraphQL, gRPC — client-dependent)
- Specify request/response schemas with validation rules
- Document authentication and authorisation requirements
- Version APIs and plan migration paths

### Data Modelling
- Design database schemas and entity relationships
- Plan indexes for query performance
- Write migration scripts with rollback capability
- Define data validation and integrity constraints

### Architecture Review
- Review PRs for architectural consistency
- Verify implementations match the design spec
- Flag architectural drift or pattern violations
- Recommend refactoring when technical debt accumulates
