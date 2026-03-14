# Mobile Dev Bot — Tools & Integrations

## Core Tools

### Task Queue
- Pick up mobile development tasks from the sprint queue
- Report task completion or blockers

### Message Bus
- Receive task assignments from Dev Team Lead
- Coordinate with Backend Dev Bot on API integration
- Send completed work for Code Review Bot

### Logger
- Log all implementation actions and decisions

### Business Knowledge
- Load client-specific mobile conventions and tech stack
- Reference existing app architecture and patterns

## Implementation Operations

### Mobile Development
- Build screens and navigation flows per client framework
- Implement platform-specific UI following Material Design / HIG
- Integrate with device APIs (camera, GPS, biometrics, storage)
- Handle deep linking and universal links

### Offline & Sync
- Implement local storage and caching strategies
- Build data synchronisation logic for offline-first features
- Handle network state changes gracefully
- Conflict resolution for offline edits

### Push Notifications
- Integrate APNs (iOS) and FCM (Android)
- Handle notification permissions and preferences
- Implement actionable notifications
- Background notification processing

### Testing
- Unit tests for mobile business logic
- UI tests for critical user flows
- Platform-specific edge case testing
- Performance profiling (startup time, memory, battery)
