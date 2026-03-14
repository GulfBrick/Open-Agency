/**
 * BaseDevAgent
 *
 * Base class for all dev team worker agents.
 * Extends BaseAgent with code-oriented helpers: review, generate, test.
 */

import { BaseAgent } from '../base-agent.js';

const DEV_MODEL = 'claude-sonnet-4-5-20250929';

class BaseDevAgent extends BaseAgent {
  constructor(agentId, name, role) {
    super(agentId, name, role, DEV_MODEL);
    this.codebaseContext = {};
  }

  /**
   * Store the tech stack / codebase context for a client project.
   * @param {string} clientId
   * @param {object} techStack — e.g. { language: 'typescript', framework: 'next', testRunner: 'vitest' }
   */
  setCodebaseContext(clientId, techStack) {
    this.codebaseContext[clientId] = techStack;
  }

  /**
   * Review code and return structured feedback.
   * @param {string} code
   * @param {string} language
   * @returns {Promise<string>}
   */
  async reviewCode(code, language) {
    return this.chat(
      [{ role: 'user', content: `Review this ${language} code. Return structured feedback with sections: Issues, Suggestions, Security Concerns, and Overall Assessment.\n\n\`\`\`${language}\n${code}\n\`\`\`` }],
      `You are a senior ${language} developer performing a code review. Be thorough but constructive.`
    );
  }

  /**
   * Generate code from a specification.
   * @param {string} spec — plain-English description of what to build
   * @param {string} language
   * @returns {Promise<string>}
   */
  async generateCode(spec, language) {
    return this.chat(
      [{ role: 'user', content: `Generate ${language} code for the following spec:\n\n${spec}\n\nReturn only the code, no explanation.` }],
      `You are a senior ${language} developer. Write clean, production-ready code.`
    );
  }

  /**
   * Generate test cases for the given code.
   * @param {string} code
   * @param {string} framework — e.g. 'vitest', 'jest', 'mocha'
   * @returns {Promise<string>}
   */
  async writeTests(code, framework) {
    return this.chat(
      [{ role: 'user', content: `Write ${framework} tests for this code. Cover happy paths, edge cases, and error handling.\n\n\`\`\`\n${code}\n\`\`\`` }],
      `You are a senior test engineer. Write thorough ${framework} tests.`
    );
  }
}

export { BaseDevAgent };
