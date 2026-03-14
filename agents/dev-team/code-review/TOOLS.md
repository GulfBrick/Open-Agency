# Code Review Bot — Tools & Integrations

## Core Tools

### Task Queue
- Pick up review tasks from the sprint queue
- Report review completion with verdict

### Message Bus
- Receive PR review requests from Dev Team Lead
- Send review verdicts (approved/changes requested/blocked)
- Alert Dev Team Lead on security findings
- Notify developers of review feedback

### Logger
- Log all review actions, verdicts, and findings

### Business Knowledge
- Load client-specific coding standards and conventions
- Reference established patterns in the codebase

## Review Operations

### Code Analysis
- Read full PR diff and understand the change in context
- Check implementation against design spec and requirements
- Identify logic errors and missing edge case handling
- Verify error handling on all failure paths

### Security Review
- Check for OWASP Top 10 vulnerabilities
- Verify input validation and sanitisation
- Check auth and authorisation boundaries
- Scan for hardcoded secrets or sensitive data exposure
- Verify parameterised queries (no SQL injection)

### Performance Review
- Identify N+1 query patterns
- Flag unnecessary database calls or API requests
- Check for memory leaks and resource cleanup
- Identify blocking operations on critical paths

### Standards Enforcement
- Verify naming conventions and file structure
- Check import patterns and dependency usage
- Validate error handling patterns
- Ensure consistent code style with the rest of the codebase

### Test Coverage Review
- Verify tests exist for changed code
- Check that new features have appropriate test coverage
- Validate that tests actually test the right things (not just coverage padding)
- Flag coverage decreases
