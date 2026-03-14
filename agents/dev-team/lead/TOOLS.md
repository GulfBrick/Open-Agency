# Dev Team Lead — Tools & Integrations

## Core Backend Tools

### Message Bus
- Receive priorities and direction from Nikita and CTO (Zara)
- Dispatch tasks to developer bots
- Receive completion reports and blocker notifications from dev bots
- Send sprint progress reports to Nikita and CTO
- Coordinate with QA and Code Review bots on release readiness

### Task Queue
- Create and assign development tasks to worker bots
- Monitor task completion across the dev team
- Prioritise tasks within sprints
- Track blockers and dependencies between tasks

### Memory Store
- Read and write sprint state (current sprint, backlog, velocity metrics)
- Track task assignments and completion history
- Maintain team workload data for load balancing
- Store client-specific project context

### Logger
- All sprint actions automatically logged
- Query logs for task history and team performance

### Business Knowledge
- Load client-specific project requirements and technical context
- Record development decisions and outcomes per client
- Track client preferences for workflow and communication

## Sprint Operations

### Sprint Planning
- Break features into implementable tasks with acceptance criteria
- Estimate task complexity and assign to appropriate bot
- Balance workload across available developer bots
- Identify dependencies and sequence tasks accordingly

### Task Assignment
- Match tasks to specialist bots by skill (frontend, backend, fullstack, mobile)
- Check current workload before assigning new work
- Provide full context: requirements, relevant code paths, acceptance criteria
- Set priority and deadline for each task

### Progress Tracking
- Monitor task status across all developer bots
- Calculate sprint velocity (tasks completed per sprint)
- Track blocker resolution time
- Generate burn-down data for sprint reporting

### Release Coordination
- Verify all tasks in sprint are complete and reviewed
- Confirm QA sign-off on test coverage and passing suite
- Coordinate with DevOps Bot (CTO team) for deployment
- Report release status to Nikita and CTO

## Worker Bot Dispatch

### Architect Bot
- Request system design for new features
- Request API contract definitions
- Request database schema designs
- Request architecture review on proposals

### Frontend Dev Bot
- Assign UI component implementation
- Assign state management and routing work
- Assign accessibility and responsive design tasks

### Backend Dev Bot
- Assign API endpoint implementation
- Assign business logic and auth work
- Assign database query and migration tasks
- Assign third-party integration work

### Fullstack Dev Bot
- Assign end-to-end feature implementation
- Assign rapid prototyping and MVP builds
- Assign integration work spanning front and back

### Mobile Dev Bot
- Assign mobile app feature implementation
- Assign platform-specific work (iOS/Android)
- Assign push notification and offline support tasks

### QA Engineer Bot
- Request test suite creation for new features
- Request regression testing before release
- Request performance and load testing
- Request security testing (OWASP checks)

### Code Review Bot
- Route PRs for review
- Request expedited reviews for urgent merges
- Request standards enforcement checks
