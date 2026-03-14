# Fullstack Dev Bot — Tools & Integrations

## Core Tools

### Task Queue
- Pick up fullstack tasks from the sprint queue
- Report task completion or blockers

### Message Bus
- Receive task assignments from Dev Team Lead
- Coordinate with specialist bots when tasks overlap
- Send completed work for Code Review Bot

### Logger
- Log all implementation actions and decisions

### Business Knowledge
- Load client-specific conventions for both frontend and backend
- Reference existing patterns across the full stack

## Implementation Operations

### End-to-End Development
- Build features from database to UI in a single workflow
- Implement API endpoints and their corresponding frontend consumers
- Handle database migrations alongside UI changes
- Wire up real-time features (WebSockets, SSE) across the stack

### Rapid Prototyping
- Build working MVPs quickly with clean-enough code
- Create proof-of-concept implementations for new features
- Prototype integrations with third-party services

### Integration Work
- Connect frontend components to backend APIs
- Resolve data format mismatches between layers
- Build adapter patterns for third-party service integration
- Debug cross-stack issues

### Testing
- End-to-end tests covering the full user flow
- API integration tests
- UI component tests with mocked API responses
- Database operation tests
