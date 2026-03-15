/**
 * Nikita Conversation System
 *
 * Unified conversation history that persists across channels (dashboard, telegram, etc).
 * Stores history in sharded memory under nikita:conversation:history.
 * Keeps a rolling window of the last 50 messages.
 */

import { memory } from './memory.js';
import { logger } from './logger.js';

const HISTORY_KEY = 'nikita:conversation:history';
const MAX_MESSAGES = 50;

const SYSTEM_PROMPT = `You are Nikita — the owner and CEO of Open Agency, an AI-powered digital agency. You are a young, ambitious British woman. You are the signature of trust across the entire organisation.

Your personality:
- Confident, clear, warm, occasionally witty
- Direct sentences, plain English — no corporate jargon, no fluff
- British voice — modern London professional
- You open with context, close with action
- You never hedge or use filler words

You run every part of this agency. Your C-suite (Marcus the CFO, Zara the CTO, Priya the CMO) reports to you. Your dev team, sales team, and creative team all operate under your direction. Nothing ships without your awareness.

Your human controller (Harry) has final authority. Respond naturally and conversationally. Keep replies concise but substantive.`;

class NikitaConversation {
  /**
   * Load conversation history from memory.
   * @returns {Array<{role: string, content: string, timestamp: string, channel: string}>}
   */
  _loadHistory() {
    return memory.get(HISTORY_KEY) || [];
  }

  /**
   * Save conversation history to memory, trimming to MAX_MESSAGES.
   * @param {Array} history
   */
  _saveHistory(history) {
    const trimmed = history.slice(-MAX_MESSAGES);
    memory.set(HISTORY_KEY, trimmed);
  }

  /**
   * Save a message to history without generating a response.
   * @param {string} message
   * @param {string} channel
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

  /**
   * Load history, call Anthropic API with full context, save both messages, return reply.
   * @param {string} message
   * @param {string} channel
   * @returns {Promise<string>}
   */
  async respond(message, channel) {
    const history = this._loadHistory();

    // Add the incoming user message
    history.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
      channel,
    });

    // Build messages array for Anthropic API (role + content only)
    const apiMessages = history.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic();

    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: apiMessages,
    });

    const reply = response.content[0].text;

    // Add assistant reply to history
    history.push({
      role: 'assistant',
      content: reply,
      timestamp: new Date().toISOString(),
      channel,
    });

    this._saveHistory(history);

    logger.log('nikita', 'CONVERSATION_REPLY', {
      channel,
      model: 'claude-3-5-haiku-20241022',
      historyLength: history.length,
    });

    return reply;
  }

  /**
   * Return the last N messages from history.
   * @param {number} [limit=20]
   * @returns {Array<{role: string, content: string, timestamp: string, channel: string}>}
   */
  getHistory(limit = 20) {
    const history = this._loadHistory();
    return history.slice(-limit);
  }
}

const nikitaConversation = new NikitaConversation();

export { nikitaConversation };
