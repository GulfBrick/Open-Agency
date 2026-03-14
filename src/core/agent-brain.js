/**
 * Base Agent Brain
 *
 * Shared brain class for all C-Suite and department-lead agents.
 * Handles persona loading, message processing, reporting, and escalation detection.
 * Individual agents extend this with domain-specific logic.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { memory } from './memory.js';
import { taskQueue, TASK_STATUS } from './task-queue.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from './message-bus.js';
import { businessKnowledge } from './business-knowledge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const AGENTS_DIR = join(PROJECT_ROOT, 'agents');

const MODEL = 'claude-opus-4-6';

class AgentBrain {
  /**
   * @param {string} agentId — unique ID (e.g. 'cfo', 'cto', 'cmo')
   * @param {string} agentDir — folder name under agents/ (e.g. 'cfo')
   * @param {object} [opts]
   * @param {string} [opts.model] — override the default model
   * @param {string[]} [opts.escalationTriggers] — domain-specific escalation keywords
   */
  constructor(agentId, agentDir, opts = {}) {
    this.agentId = agentId;
    this.agentDir = agentDir;
    this.model = opts.model || MODEL;
    this.escalationTriggers = opts.escalationTriggers || [];
    this.client = new Anthropic();
    this.persona = this._loadPersona();
  }

  /**
   * Load persona files (SOUL.md, IDENTITY.md, CLAUDE.md) from the agent's directory.
   * @returns {{ soul: string, identity: string, instructions: string, tools: string|null }}
   */
  _loadPersona() {
    const dir = join(AGENTS_DIR, this.agentDir);
    const files = {};

    for (const file of ['SOUL.md', 'IDENTITY.md', 'CLAUDE.md', 'TOOLS.md']) {
      const path = join(dir, file);
      if (existsSync(path)) {
        files[file] = readFileSync(path, 'utf-8');
      }
    }

    return {
      soul: files['SOUL.md'] || '',
      identity: files['IDENTITY.md'] || '',
      instructions: files['CLAUDE.md'] || '',
      tools: files['TOOLS.md'] || null,
    };
  }

  /**
   * Build the full system prompt from persona files.
   * @returns {string}
   */
  getSystemPrompt() {
    const parts = [this.persona.soul, this.persona.identity, this.persona.instructions];
    if (this.persona.tools) {
      parts.push(this.persona.tools);
    }
    return parts.join('\n\n---\n\n');
  }

  /**
   * Detect if a message text contains escalation triggers.
   * @param {string} text
   * @returns {{ shouldEscalate: boolean, triggers: string[] }}
   */
  detectEscalation(text) {
    const lower = text.toLowerCase();
    const matched = this.escalationTriggers.filter(t => lower.includes(t));
    return {
      shouldEscalate: matched.length > 0,
      triggers: matched,
    };
  }

  /**
   * Process an incoming message and produce a decision.
   * @param {object} message — a message bus message
   * @param {string} [additionalContext] — domain-specific context to inject
   * @returns {object} Decision: { action, response, escalate, escalationReason, tasks }
   */
  async processMessage(message, additionalContext = '') {
    const context = this._buildContext(message, additionalContext);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: this.getSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: `You have received a message. Decide what to do.\n\nContext:\n${context}\n\nMessage:\nFrom: ${message.from}\nType: ${message.type}\nPriority: ${message.priority}\nContent: ${JSON.stringify(message.payload)}\n\nRespond with a JSON object:\n{\n  "action": "respond|delegate|escalate|acknowledge",\n  "response": "your response text",\n  "escalate": true/false,\n  "escalationReason": "reason if escalating",\n  "tasks": [{ "assignTo": "agentId", "description": "task description", "priority": "HIGH|MEDIUM|LOW" }]\n}`,
        },
      ],
    });

    const responseText = response.content[0].text;
    let decision;
    try {
      const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      decision = JSON.parse(cleaned);
    } catch {
      decision = {
        action: 'respond',
        response: responseText,
        escalate: false,
        tasks: [],
      };
    }

    logger.log(this.agentId, 'DECISION_MADE', {
      messageId: message.id,
      action: decision.action,
      escalate: decision.escalate,
      taskCount: decision.tasks?.length || 0,
    });

    // Execute tasks if any
    if (decision.tasks?.length > 0) {
      for (const task of decision.tasks) {
        taskQueue.enqueue({
          assignedTo: task.assignTo,
          createdBy: this.agentId,
          type: message.type,
          priority: task.priority || 'MEDIUM',
          description: task.description,
        });
      }
    }

    // If escalation needed, send to Nikita
    if (decision.escalate) {
      messageBus.send({
        from: this.agentId,
        to: 'nikita',
        type: MESSAGE_TYPES.ESCALATION,
        priority: PRIORITY.HIGH,
        payload: {
          originalMessage: message,
          reason: decision.escalationReason,
          agentResponse: decision.response,
        },
      });
    }

    return decision;
  }

  /**
   * Generate a domain-specific report using the LLM.
   * @param {string} reportType — e.g. 'daily-snapshot', 'weekly-summary'
   * @param {object} data — structured data to include in the report
   * @returns {string} The generated report text
   */
  async generateReport(reportType, data) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: this.getSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: `Generate a ${reportType} report for Nikita. Be concise, lead with what matters most.\n\nData:\n${JSON.stringify(data, null, 2)}\n\nFormat: Start with a one-line summary, then bullet points for key items, end with action items or recommendations.`,
        },
      ],
    });

    const report = response.content[0].text;

    logger.log(this.agentId, 'REPORT_GENERATED', { reportType });

    return report;
  }

  /**
   * Send a report to Nikita via the message bus.
   * @param {string} reportType
   * @param {string} reportText
   */
  sendReportToNikita(reportType, reportText) {
    messageBus.send({
      from: this.agentId,
      to: 'nikita',
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.MEDIUM,
      payload: {
        reportType,
        content: reportText,
        generatedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Build context string for message processing.
   * @private
   */
  _buildContext(message, additionalContext) {
    const myTasks = taskQueue.getByAgent(this.agentId);
    const activeTasks = myTasks.filter(t => t.status === TASK_STATUS.IN_PROGRESS);
    const pendingTasks = myTasks.filter(t => t.status === TASK_STATUS.PENDING);

    const payloadText = typeof message.payload === 'string'
      ? message.payload
      : JSON.stringify(message.payload);
    const escalation = this.detectEscalation(payloadText);

    const parts = [
      `Agent: ${this.agentId}`,
      `Active tasks: ${activeTasks.length}`,
      `Pending tasks: ${pendingTasks.length}`,
      `Escalation check: ${escalation.shouldEscalate ? `YES (${escalation.triggers.join(', ')})` : 'No'}`,
      `Time: ${new Date().toISOString()}`,
    ];

    if (additionalContext) {
      parts.push(`Domain context:\n${additionalContext}`);
    }

    return parts.join('\n');
  }
}

export { AgentBrain };
