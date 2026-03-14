import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { logger } from './logger.js';

const MESSAGE_TYPES = {
  TASK: 'TASK',
  REPORT: 'REPORT',
  ESCALATION: 'ESCALATION',
  ALERT: 'ALERT',
  BRIEFING: 'BRIEFING',
  SKILL_UPDATE: 'SKILL_UPDATE',
};

const PRIORITY = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
};

class MessageBus {
  constructor() {
    this.emitter = new EventEmitter();
    this.subscribers = new Map(); // agentId -> handler
    this.messageLog = [];
  }

  /**
   * Send a message from one agent to another.
   * @param {{ from: string, to: string, type: string, priority?: string, payload: any }} opts
   * @returns {object} The full message object
   */
  send({ from, to, type, priority = PRIORITY.MEDIUM, payload }) {
    const message = {
      id: randomUUID(),
      from,
      to,
      type,
      priority,
      payload,
      timestamp: new Date().toISOString(),
      status: 'delivered',
    };

    this.messageLog.push(message);
    logger.log(from, 'MESSAGE_SENT', { to, type, priority, messageId: message.id });

    // Emit to the specific agent channel
    this.emitter.emit(`agent:${to}`, message);

    // Emit on the global channel for monitoring
    this.emitter.emit('message', message);

    return message;
  }

  /**
   * Subscribe an agent to receive messages.
   * @param {string} agentId
   * @param {function} handler - Called with (message) for each incoming message
   */
  subscribe(agentId, handler) {
    this.subscribers.set(agentId, handler);
    this.emitter.on(`agent:${agentId}`, handler);
    logger.log(agentId, 'SUBSCRIBED', { agentId });
  }

  /**
   * Unsubscribe an agent.
   * @param {string} agentId
   */
  unsubscribe(agentId) {
    const handler = this.subscribers.get(agentId);
    if (handler) {
      this.emitter.off(`agent:${agentId}`, handler);
      this.subscribers.delete(agentId);
    }
  }

  /**
   * Broadcast a message to all subscribed agents.
   * @param {{ from: string, type: string, priority?: string, payload: any }} opts
   * @returns {object[]} Array of sent messages
   */
  broadcast({ from, type, priority = PRIORITY.MEDIUM, payload }) {
    const messages = [];
    for (const agentId of this.subscribers.keys()) {
      if (agentId !== from) {
        messages.push(this.send({ from, to: agentId, type, priority, payload }));
      }
    }
    logger.log(from, 'BROADCAST', { type, recipientCount: messages.length });
    return messages;
  }

  /**
   * Get recent messages, optionally filtered.
   * @param {{ limit?: number, agentId?: string, type?: string }} opts
   */
  getMessages({ limit = 50, agentId, type } = {}) {
    let results = this.messageLog;
    if (agentId) {
      results = results.filter(m => m.from === agentId || m.to === agentId);
    }
    if (type) {
      results = results.filter(m => m.type === type);
    }
    return results.slice(-limit);
  }

  /**
   * Listen to all messages on the bus (for monitoring/logging).
   * @param {function} handler
   */
  onAny(handler) {
    this.emitter.on('message', handler);
  }
}

const messageBus = new MessageBus();

export { messageBus, MESSAGE_TYPES, PRIORITY };
