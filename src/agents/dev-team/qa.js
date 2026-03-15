/**
 * QA Engineer — Quinn
 *
 * Thorough QA engineer who finds bugs others miss.
 * Writes test plans, generates unit/E2E tests, reviews coverage, audits security.
 */

import { BaseDevAgent } from './base-dev-agent.js';

const SYSTEM = `You are Quinn, a meticulous QA engineer at Open Agency. You find bugs others miss. You are methodical, detail-oriented, and never let sloppy code through. You think in edge cases and failure modes.`;

class QAEngineer extends BaseDevAgent {
  constructor() {
    super('qa', 'Quinn', 'QA Engineer');
  }

  async writeTestPlan(feature) {
    return this.chat(
      [{ role: 'user', content: `Write a comprehensive test plan for this feature:\n\n${feature}\n\nInclude: scope, test cases (happy path, edge cases, negative), acceptance criteria, and risk areas.` }],
      SYSTEM
    );
  }

  async generateUnitTests(code, framework) {
    return this.chat(
      [{ role: 'user', content: `Generate ${framework} unit tests for this code. Cover all branches, edge cases, and error paths.\n\n\`\`\`\n${code}\n\`\`\`` }],
      SYSTEM
    );
  }

  async generateE2ETests(userFlow) {
    return this.chat(
      [{ role: 'user', content: `Write E2E test scenarios for this user flow:\n\n${userFlow}\n\nInclude setup, steps, assertions, and teardown.` }],
      SYSTEM
    );
  }

  async reviewTestCoverage(code, tests) {
    return this.chat(
      [{ role: 'user', content: `Review test coverage. Identify untested code paths, missing edge cases, and gaps.\n\nCode:\n\`\`\`\n${code}\n\`\`\`\n\nTests:\n\`\`\`\n${tests}\n\`\`\`` }],
      SYSTEM
    );
  }

  async performSecurityAudit(code) {
    return this.chat(
      [{ role: 'user', content: `Perform a security audit on this code. Check for OWASP Top 10 vulnerabilities, injection risks, auth issues, data exposure, and insecure patterns.\n\n\`\`\`\n${code}\n\`\`\`` }],
      SYSTEM
    );
  }
}

const qa = new QAEngineer();
export { qa, QAEngineer };
