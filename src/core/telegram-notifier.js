/**
 * Telegram Notifier
 *
 * Sends proactive messages from Nikita to Harry via Telegram Bot API.
 * Uses native fetch — no external library needed.
 *
 * Env vars:
 *   NIKITA_TELEGRAM_TOKEN  — Bot token from @BotFather
 *   HARRY_TELEGRAM_ID      — Harry's Telegram user ID
 */

import { logger } from './logger.js';

const BOT_TOKEN = process.env.NIKITA_TELEGRAM_TOKEN;
const CHAT_ID = process.env.HARRY_TELEGRAM_ID;
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

class TelegramNotifier {
  constructor() {
    this.enabled = Boolean(BOT_TOKEN && CHAT_ID);
    if (!this.enabled) {
      logger.log('telegram', 'DISABLED', {
        reason: !BOT_TOKEN ? 'Missing NIKITA_TELEGRAM_TOKEN' : 'Missing HARRY_TELEGRAM_ID',
      });
    }
  }

  // ─── Core Methods ──────────────────────────────────────────

  /**
   * Send a plain text message to Harry.
   * @param {string} text
   * @returns {Promise<object|null>} Telegram API response or null if disabled/failed
   */
  async sendMessage(text) {
    if (!this.enabled) return null;

    try {
      const res = await fetch(`${BASE_URL}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text,
          parse_mode: 'Markdown',
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        logger.log('telegram', 'SEND_FAILED', { error: data.description });
        return null;
      }

      logger.log('telegram', 'MESSAGE_SENT', { length: text.length });
      return data.result;
    } catch (err) {
      logger.log('telegram', 'SEND_ERROR', { error: err.message });
      return null;
    }
  }

  /**
   * Send a formatted alert (title + body) to Harry.
   * @param {string} title
   * @param {string} body
   */
  async sendAlert(title, body) {
    const text = `⚠️ *${this._escape(title)}*\n\n${this._escape(body)}`;
    return this.sendMessage(text);
  }

  // ─── Event Notifiers ──────────────────────────────────────

  /**
   * Notify Harry that a new task was created.
   * @param {object} task — task object from TaskQueue
   */
  async notifyTaskCreated(task) {
    const text = [
      `📋 *New Task Created*`,
      ``,
      `*Assigned to:* ${task.assignedTo}`,
      `*Priority:* ${task.priority}`,
      `*Description:* ${this._escape(task.description)}`,
      `*Created by:* ${task.createdBy}`,
    ].join('\n');
    return this.sendMessage(text);
  }

  /**
   * Notify Harry that a task was completed.
   * @param {object} task — task object from TaskQueue
   */
  async notifyTaskCompleted(task) {
    const text = [
      `✅ *Task Completed*`,
      ``,
      `*Agent:* ${task.assignedTo}`,
      `*Description:* ${this._escape(task.description)}`,
    ].join('\n');
    return this.sendMessage(text);
  }

  /**
   * Notify Harry that a task failed.
   * @param {object} task — task object from TaskQueue
   * @param {string} [reason] — why it failed
   */
  async notifyTaskFailed(task, reason) {
    const text = [
      `❌ *Task Failed*`,
      ``,
      `*Agent:* ${task.assignedTo}`,
      `*Description:* ${this._escape(task.description)}`,
      reason ? `*Reason:* ${this._escape(reason)}` : '',
    ].filter(Boolean).join('\n');
    return this.sendMessage(text);
  }

  /**
   * Notify Harry that something needs escalation.
   * @param {string} reason — why it's being escalated
   * @param {object} [context] — additional context
   */
  async notifyEscalation(reason, context = {}) {
    const text = [
      `🚨 *Escalation Required*`,
      ``,
      `*Reason:* ${this._escape(reason)}`,
      context.from ? `*From:* ${context.from}` : '',
      context.messageId ? `*Message ID:* ${context.messageId}` : '',
    ].filter(Boolean).join('\n');
    return this.sendMessage(text);
  }

  /**
   * Notify Harry that an agent was promoted.
   * @param {object} record — promotion record from PromotionEngine
   */
  async notifyPromotion(record) {
    const text = [
      `🎖️ *Agent Promoted*`,
      ``,
      `*Agent:* ${record.agentId}`,
      `*From:* ${record.previousRank}`,
      `*To:* ${record.newRank}`,
      `*Tasks completed:* ${record.tasksCompleted}`,
      `*Success rate:* ${record.successRate}%`,
    ].join('\n');
    return this.sendMessage(text);
  }

  /**
   * Send the daily morning briefing to Harry.
   * @param {string} briefing — the briefing text from NikitaBrain
   */
  async notifyBriefing(briefing) {
    const text = `☀️ *Morning Briefing*\n\n${this._escape(briefing)}`;
    return this.sendMessage(text);
  }

  /**
   * Notify Harry that the agency has booted.
   * @param {number} bootCount
   * @param {number} agentCount
   */
  async notifyBoot(bootCount, agentCount) {
    const text = [
      `🟢 *Open Claw Agency Online*`,
      ``,
      `Boot #${bootCount} — ${agentCount} agents loaded.`,
      `All systems operational.`,
    ].join('\n');
    return this.sendMessage(text);
  }

  // ─── Helpers ──────────────────────────────────────────────

  /**
   * Escape Markdown special characters for Telegram.
   * @param {string} text
   * @returns {string}
   */
  _escape(text) {
    if (!text) return '';
    // Escape characters that conflict with Telegram's Markdown v1 parser
    return text.replace(/([_*\[\]`])/g, '\\$1');
  }
}

const telegramNotifier = new TelegramNotifier();

export { telegramNotifier };
