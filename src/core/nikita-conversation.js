/**
 * Nikita Agentic Loop — The Jarvis Engine
 *
 * This is NOT a chatbot. This is an autonomous agent.
 *
 * When Harry sends a message, Nikita enters an agentic loop:
 *   1. She thinks about what to do
 *   2. She calls tools (delegate, check status, query data, etc.)
 *   3. She sees the results
 *   4. She calls MORE tools if needed
 *   5. She keeps going until she has everything she needs
 *   6. She responds to Harry with a synthesised answer
 *
 * This is identical to how Open Claw / Claude Code works —
 * a while loop that runs until stop_reason is "end_turn".
 */

import Anthropic from '@anthropic-ai/sdk';
import { memory } from './memory.js';
import { logger } from './logger.js';
import { nikitaBrain } from '../nikita/brain.js';
import { TOOL_DEFINITIONS, executeTool } from '../nikita/tools.js';
import { taskQueue, TASK_STATUS } from './task-queue.js';
import { agentRegistry } from './agent-registry.js';
import { businessKnowledge } from './business-knowledge.js';
import { workflowEngine } from './workflow-engine.js';

const HISTORY_KEY = 'nikita:conversation:history';
const MAX_MESSAGES = 50;
const MAX_ITERATIONS = 15; // safety limit — max tool call rounds per message
const MODEL = 'claude-haiku-4-5'; // Nikita's brain model

class NikitaConversation {
  constructor() {
    this.client = new Anthropic();
  }

  /**
   * The main entry point. Harry says something → Nikita thinks, acts, responds.
   *
   * This runs the full agentic loop — Nikita will call tools, see results,
   * call more tools, and keep going until she's satisfied.
   *
   * @param {string} message — what Harry said
   * @param {string} channel — 'dashboard', 'telegram', etc.
   * @returns {Promise<string>} Nikita's final response text
   */
  async respond(message, channel) {
    const history = this._loadHistory();

    // Save Harry's message to history
    history.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
      channel,
    });

    logger.log('nikita', 'AGENTIC_INPUT', { channel, message: message.substring(0, 100) });

    // Build the API messages from conversation history
    const apiMessages = this._buildApiMessages(history);

    // Add the new message with agency context
    const agencySnapshot = this._getAgencySnapshot();
    apiMessages.push({
      role: 'user',
      content: [
        message,
        '',
        `[Agency snapshot: ${agencySnapshot}]`,
      ].join('\n'),
    });

    // ─── THE AGENTIC LOOP ─────────────────────────────
    let iterations = 0;
    let finalText = '';

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: nikitaBrain.getSystemPrompt() + '\n\n' + this._getToolInstructions(),
        tools: TOOL_DEFINITIONS,
        messages: apiMessages,
      });

      // Add Claude's response to the conversation
      apiMessages.push({ role: 'assistant', content: response.content });

      // Log what happened this iteration
      const toolCalls = response.content.filter(b => b.type === 'tool_use');
      const textBlocks = response.content.filter(b => b.type === 'text');

      if (textBlocks.length > 0) {
        finalText = textBlocks.map(b => b.text).join('\n');
      }

      logger.log('nikita', 'AGENTIC_ITERATION', {
        iteration: iterations,
        stopReason: response.stop_reason,
        toolCalls: toolCalls.length,
        hasText: textBlocks.length > 0,
      });

      // If Nikita is DONE (no more tool calls), break
      if (response.stop_reason === 'end_turn') {
        break;
      }

      // If she wants to use tools, execute them all
      if (response.stop_reason === 'tool_use' && toolCalls.length > 0) {
        const toolResults = [];

        for (const toolCall of toolCalls) {
          logger.log('nikita', 'TOOL_CALL', {
            tool: toolCall.name,
            input: JSON.stringify(toolCall.input).substring(0, 200),
            iteration: iterations,
          });

          // Execute the actual tool
          const result = await executeTool(toolCall.name, toolCall.input);

          logger.log('nikita', 'TOOL_RESULT', {
            tool: toolCall.name,
            resultLength: result.length,
            iteration: iterations,
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: result,
          });
        }

        // Feed results back to Nikita — she'll see them and decide what to do next
        apiMessages.push({ role: 'user', content: toolResults });

        // Loop continues — Nikita decides if she needs more info or is done
      }
    }

    if (iterations >= MAX_ITERATIONS) {
      logger.log('nikita', 'AGENTIC_MAX_ITERATIONS', { iterations });
      if (!finalText) {
        finalText = "I've been working through quite a few steps on this. Let me summarise where I've got to.";
      }
    }

    // Save Nikita's response to history
    history.push({
      role: 'assistant',
      content: finalText,
      timestamp: new Date().toISOString(),
      channel,
      iterations,
    });

    this._saveHistory(history);

    logger.log('nikita', 'AGENTIC_COMPLETE', {
      channel,
      iterations,
      responseLength: finalText.length,
    });

    return finalText;
  }

  // ─── Helpers ──────────────────────────────────────────

  /**
   * Build API messages from stored conversation history.
   * Only sends the last 10 exchanges to keep context manageable.
   */
  _buildApiMessages(history) {
    const recent = history.slice(-20);
    const messages = [];

    for (const msg of recent.slice(0, -1)) { // exclude the latest (we add it with context)
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }

    return messages;
  }

  /**
   * Quick snapshot of agency state injected with each message.
   */
  _getAgencySnapshot() {
    const agents = agentRegistry.list();
    const allTasks = taskQueue.getAll();
    const clients = businessKnowledge.listClients();
    const pending = allTasks.filter(t => t.status === 'PENDING').length;
    const inProgress = allTasks.filter(t => t.status === 'IN_PROGRESS').length;
    const completed = allTasks.filter(t => t.status === 'COMPLETED').length;

    return `${agents.length} agents online | ${clients.length} clients | Tasks: ${pending} pending, ${inProgress} in progress, ${completed} completed`;
  }

  /**
   * Additional instructions appended to Nikita's system prompt
   * to guide tool use behaviour.
   */
  _getToolInstructions() {
    return `You have access to tools that let you actually run the agency. USE THEM.

When Harry asks you to do something:
- Use delegate_to_agent to assign work to the right person
- Use get_task_status to check on progress
- Use get_financials / get_system_health / get_marketing_status to pull real data
- Use start_workflow for multi-step projects
- Use onboard_client for new clients
- Use notify_harry to send Telegram alerts

You are an autonomous agent. You gather information, take action, and report results.
You NEVER make up data. If you don't have data, use a tool to get it.
You NEVER do the work yourself — you delegate to your team.
When you're done taking action, respond naturally to Harry in your voice.
Keep responses concise. Lead with what matters.`;
  }

  /**
   * Load conversation history from sharded memory.
   */
  _loadHistory() {
    return memory.get(HISTORY_KEY) || [];
  }

  /**
   * Save history, trimmed to MAX_MESSAGES.
   */
  _saveHistory(history) {
    memory.set(HISTORY_KEY, history.slice(-MAX_MESSAGES));
  }

  /**
   * Get recent history for the dashboard.
   */
  getHistory(limit = 20) {
    return this._loadHistory().slice(-limit);
  }

  /**
   * Log an incoming message without generating a response.
   */
  logIncoming(message, channel) {
    const history = this._loadHistory();
    history.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
      channel,
    });
    this._saveHistory(history);
  }
}

const nikitaConversation = new NikitaConversation();

export { nikitaConversation };
