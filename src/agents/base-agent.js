/**
 * BaseAgent
 *
 * Lightweight base class for all agents.
 * Wraps Anthropic chat, context lookup, task recording, and escalation.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../core/logger.js';

class BaseAgent {
  /**
   * @param {string} agentId  — unique identifier (e.g. 'cfo', 'cmo')
   * @param {string} name     — display name (e.g. 'Marcus')
   * @param {string} role     — role title (e.g. 'CFO')
   * @param {string} model    — Claude model ID
   */
  constructor(agentId, name, role, model = 'claude-opus-4-6') {
    this.agentId = agentId;
    this.name = name;
    this.role = role;
    this.model = model;
    this.client = new Anthropic();
  }

  /**
   * Send messages to the Anthropic API and return the response text.
   * @param {object[]} messages — array of { role, content }
   * @param {string} systemPrompt
   * @returns {Promise<string>}
   */
  async chat(messages, systemPrompt) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });
    return response.content[0].text;
  }

  /**
   * Get context for a given client. Placeholder — will be wired to agentProfile later.
   * @param {string} clientId
   * @returns {object}
   */
  getContext(clientId) {
    return {};
  }

  /**
   * Record a completed task.
   * @param {string} taskType
   * @param {string} outcome — 'success' | 'failure'
   * @param {string} clientId
   * @param {object} [details]
   */
  recordTask(taskType, outcome, clientId, details = {}) {
    this.log('TASK_RECORDED', { taskType, outcome, clientId, ...details });
  }

  /**
   * Escalate an issue to another agent (console log for now).
   * @param {string} to — target agent ID
   * @param {string} subject
   * @param {object} [details]
   */
  escalate(to, subject, details = {}) {
    console.log(`[ESCALATION] ${this.agentId} -> ${to}: ${subject}`);
    this.log('ESCALATION_SENT', { to, subject, ...details });
  }

  /**
   * Log an action via the central logger.
   * @param {string} action
   * @param {object} [details]
   */
  log(action, details = {}) {
    logger.log(this.agentId, action, details);
  }
}

export { BaseAgent };
