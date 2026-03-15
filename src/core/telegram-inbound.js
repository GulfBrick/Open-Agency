// telegram-inbound.js — Telegram long-polling listener for messages from Harry
// Part of Open Claw Agency core infrastructure

import { logger } from './logger.js';
import { nikitaGateway } from './nikita-gateway.js';
import { nikitaBrain } from '../nikita/brain.js';
import { workflowEngine } from './workflow-engine.js';
import { telegramNotifier } from './telegram-notifier.js';

const TELEGRAM_API = 'https://api.telegram.org/bot';
const POLL_TIMEOUT = 30; // seconds

class TelegramInbound {
  constructor() {
    this.token = process.env.NIKITA_TELEGRAM_TOKEN;
    this.harryId = process.env.HARRY_TELEGRAM_ID;
    this.enabled = Boolean(this.token && this.harryId);
    this.offset = 0;
    this.running = false;
    this.abortController = null;
  }

  /**
   * Start the long-polling loop.
   */
  start() {
    if (this.running) {
      logger.log('telegram-inbound', 'ALREADY_RUNNING', {});
      return;
    }

    this.token = process.env.NIKITA_TELEGRAM_TOKEN;
    this.harryId = process.env.HARRY_TELEGRAM_ID;

    if (!this.token) {
      logger.log('telegram-inbound', 'DISABLED', { reason: 'Missing NIKITA_TELEGRAM_TOKEN' });
      return;
    }

    if (!this.harryId) {
      logger.log('telegram-inbound', 'DISABLED', { reason: 'Missing HARRY_TELEGRAM_ID' });
      return;
    }

    this.running = true;
    this.enabled = true;
    logger.log('telegram-inbound', 'STARTED', { harryId: this.harryId });
    this._poll();
  }

  /**
   * Stop the long-polling loop gracefully.
   */
  stop() {
    if (!this.running) return;

    logger.log('telegram-inbound', 'STOPPING', {});
    this.running = false;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Internal polling loop — calls itself recursively while this.running is true.
   */
  async _poll() {
    while (this.running) {
      try {
        const updates = await this._getUpdates();

        for (const update of updates) {
          // Advance offset past this update so we never re-process it
          this.offset = update.update_id + 1;

          await this._handleUpdate(update);
        }
      } catch (err) {
        if (!this.running) break; // abort signal during shutdown — not an error

        logger.log('telegram-inbound', 'POLL_ERROR', { error: err.message });

        // Back off briefly before retrying to avoid hammering the API
        await this._sleep(3000);
      }
    }

    logger.log('telegram-inbound', 'POLL_LOOP_EXITED', {});
  }

  /**
   * Fetch new updates from Telegram using long polling.
   */
  async _getUpdates() {
    const url = `${TELEGRAM_API}${this.token}/getUpdates?offset=${this.offset}&timeout=${POLL_TIMEOUT}&allowed_updates=["message"]`;

    this.abortController = new AbortController();

    // Allow extra time beyond the long-poll timeout for network overhead
    const timeoutMs = (POLL_TIMEOUT + 10) * 1000;
    const timer = setTimeout(() => {
      if (this.abortController) this.abortController.abort();
    }, timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: this.abortController.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Telegram API ${res.status}: ${body}`);
      }

      const data = await res.json();

      if (!data.ok) {
        throw new Error(`Telegram API returned ok=false: ${JSON.stringify(data)}`);
      }

      return data.result || [];
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /**
   * Process a single Telegram update.
   */
  async _handleUpdate(update) {
    const message = update.message;
    if (!message) return; // ignore non-message updates (edits, callbacks, etc.)

    const chatId = String(message.chat?.id);
    const text = (message.text || '').trim();

    // Security gate — only accept messages from Harry
    if (chatId !== String(this.harryId)) {
      logger.log('telegram-inbound', 'REJECTED_UNKNOWN_CHAT', { chatId });
      return;
    }

    if (!text) {
      logger.log('telegram-inbound', 'NON_TEXT_MESSAGE', {});
      return;
    }

    logger.log('telegram-inbound', 'HARRY_MESSAGE', { text: text.substring(0, 100) });

    try {
      await this._routeMessage(text);
    } catch (err) {
      logger.log('telegram-inbound', 'ROUTE_ERROR', { error: err.message });

      // Notify Harry that something went wrong
      try {
        await telegramNotifier.sendMessage(`Something went wrong processing that message: ${err.message}`);
      } catch (_) {
        // Best effort — don't let notification failure crash the loop
      }
    }
  }

  /**
   * Route a text message to the appropriate handler.
   */
  async _routeMessage(text) {
    // /status
    if (text === '/status') {
      logger.log('telegram-inbound', 'COMMAND', { command: '/status' });
      await nikitaGateway.broadcastStatus();
      return;
    }

    // /approve <id>
    if (text.startsWith('/approve ')) {
      const id = text.slice('/approve '.length).trim();
      if (!id) {
        logger.log('telegram-inbound', 'COMMAND_MISSING_ARG', { command: '/approve' });
        await telegramNotifier.sendMessage('Usage: /approve <workflow-id>');
        return;
      }
      logger.log('telegram-inbound', 'COMMAND', { command: '/approve', workflowId: id });
      // Support partial IDs (first 8 chars) — find the full workflow ID
      let fullId = id;
      if (id.length < 36) {
        const workflows = workflowEngine.listWorkflows();
        const match = workflows.find(w => w.workflowId.startsWith(id));
        if (match) {
          fullId = match.workflowId;
        }
      }
      const approved = workflowEngine.approveWorkflow(fullId, 'harry');
      if (approved) {
        await telegramNotifier.sendMessage(`Workflow approved: ${fullId.substring(0, 8)}`);
      } else {
        await telegramNotifier.sendMessage(`Workflow not found or not waiting for approval: ${id}`);
      }
      return;
    }

    // /briefing
    if (text === '/briefing') {
      logger.log('telegram-inbound', 'COMMAND', { command: '/briefing' });
      await nikitaBrain.generateBriefing();
      return;
    }

    // Everything else — general message to Nikita
    logger.log('telegram-inbound', 'ROUTING_TO_NIKITA', { textLength: text.length });
    await nikitaGateway.receiveFromHarry(text);
  }

  /**
   * Simple async sleep helper.
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const telegramInbound = new TelegramInbound();
