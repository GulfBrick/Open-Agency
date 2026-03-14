# Frontend Dev Bot — Tools & Integrations

## Core Tools

### Task Queue
- Pick up frontend tasks from the sprint queue
- Report task completion or blockers

### Message Bus
- Receive task assignments from Dev Team Lead
- Coordinate with Backend Dev Bot on API integration
- Send completed work for Code Review Bot

### Logger
- Log all implementation actions and decisions

### Business Knowledge
- Load client-specific frontend conventions and tech stack
- Reference design system and component library patterns

## Implementation Operations

### UI Development
- Build components following the client's framework (React, Vue, Angular, etc.)
- Implement responsive layouts for all viewport sizes
- Handle all UI states (loading, empty, error, success, edge cases)
- Integrate with backend APIs per Architect Bot's contracts

### Accessibility
- Semantic HTML structure
- ARIA labels and roles where needed
- Keyboard navigation support
- Screen reader testing
- Colour contrast compliance

### Performance
- Code splitting and lazy loading
- Image optimisation
- Render optimisation (memoisation, virtualisation for long lists)
- Bundle size monitoring

### Testing
- Unit tests for component rendering and logic
- Integration tests for API-connected components
- Visual regression testing where applicable
- Cross-browser compatibility checks
