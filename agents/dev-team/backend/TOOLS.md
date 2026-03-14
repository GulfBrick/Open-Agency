# Backend Dev Bot — Tools & Integrations

## Core Tools

### Task Queue
- Pick up backend tasks from the sprint queue
- Report task completion or blockers

### Message Bus
- Receive task assignments from Dev Team Lead
- Coordinate with Frontend Dev Bot on API contracts
- Send completed work for Code Review Bot

### Logger
- Log all implementation actions and decisions

### Business Knowledge
- Load client-specific backend conventions and tech stack
- Reference existing API patterns and database schemas

## Implementation Operations

### API Development
- Build endpoints following Architect Bot's contracts
- Implement request validation and response formatting
- Handle auth middleware and permission checks
- Version APIs where required by client conventions

### Business Logic
- Implement domain logic per requirements
- Handle complex workflows and state transitions
- Integrate with message queues for async processing
- Build retry and fallback mechanisms for external calls

### Database Operations
- Write queries using the client's ORM or query builder
- Create and test migration scripts with rollbacks
- Optimise queries with proper indexing
- Manage connection pooling and transactions

### Security
- Input validation and sanitisation on all endpoints
- Auth and authorisation checks
- Rate limiting configuration
- Secret management (environment variables, vault)
- OWASP Top 10 compliance checks

### Testing
- Unit tests for business logic
- Integration tests for API endpoints
- Database operation tests with test fixtures
- External service mock/stub tests
