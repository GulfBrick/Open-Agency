/**
 * Agent Conversation Engine
 *
 * The heart of multi-agent collaboration. When Agent A needs to talk to Agent B,
 * this creates a real conversation where B responds IN CHARACTER using their own
 * SOUL.md persona and system prompt.
 *
 * Each conversation is persisted to data/conversations/[conversationId].json
 * and fires events on the message bus.
 */

import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from './message-bus.js';
import { agentPersonas } from './agent-personas.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const CONVERSATIONS_DIR = join(PROJECT_ROOT, 'data', 'conversations');

mkdirSync(CONVERSATIONS_DIR, { recursive: true });

const CONVERSATION_STATUS = {
  OPEN: 'OPEN',
  WAITING_ON: 'WAITING_ON',
  RESOLVED: 'RESOLVED',
};

/** Model allocation — Nikita and C-suite get Opus, workers get Sonnet */
const OPUS_AGENTS = new Set(['nikita', 'cfo', 'cto', 'cmo']);
function getModelForAgent(agentId) {
  return OPUS_AGENTS.has(agentId) ? 'claude-opus-4-5' : 'claude-sonnet-4-5-20250929';
}

class AgentConversation {
  constructor() {
    this.client = new Anthropic();
    /** @type {Map<string, object>} */
    this.conversations = new Map();
  }

  /**
   * Create a new conversation between agents.
   * @param {string} topic — what this conversation is about
   * @param {string} initiator — agentId who starts it
   * @param {string[]} participants — all agentIds involved (including initiator)
   * @param {string} [clientId] — optional client context
   * @returns {object} The conversation object
   */
  createConversation(topic, initiator, participants, clientId = null) {
    const conversation = {
      conversationId: randomUUID(),
      topic,
      initiator,
      participants,
      messages: [],
      status: CONVERSATION_STATUS.OPEN,
      clientId,
      outcome: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.conversations.set(conversation.conversationId, conversation);
    this._persist(conversation);

    logger.log(initiator, 'CONVERSATION_CREATED', {
      conversationId: conversation.conversationId,
      topic,
      participants,
      clientId,
    });

    return conversation;
  }

  /**
   * Send a message from one agent to another within a conversation.
   * The recipient agent ACTUALLY responds using their own persona.
   *
   * @param {string} conversationId
   * @param {string} fromAgentId — who is speaking
   * @param {string} toAgentId — who should respond
   * @param {string} content — what the sender says
   * @returns {Promise<object>} The recipient's response message
   */
  async sendMessage(conversationId, fromAgentId, toAgentId, content) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Record the sender's message
    const senderMessage = {
      id: randomUUID(),
      from: fromAgentId,
      to: toAgentId,
      content,
      timestamp: new Date().toISOString(),
    };
    conversation.messages.push(senderMessage);
    conversation.status = CONVERSATION_STATUS.WAITING_ON;
    conversation.waitingOn = toAgentId;
    conversation.updatedAt = new Date().toISOString();

    logger.log(fromAgentId, 'CONVERSATION_MESSAGE', {
      conversationId,
      to: toAgentId,
      contentLength: content.length,
    });

    // Fire message bus event
    messageBus.send({
      from: fromAgentId,
      to: toAgentId,
      type: MESSAGE_TYPES.TASK,
      priority: PRIORITY.MEDIUM,
      payload: {
        event: 'CONVERSATION_MESSAGE',
        conversationId,
        content,
      },
    });

    // Now get the recipient to respond IN CHARACTER
    const recipientResponse = await this._getAgentResponse(
      conversation,
      toAgentId,
      fromAgentId,
      content,
    );

    // Record the recipient's response
    const responseMessage = {
      id: randomUUID(),
      from: toAgentId,
      to: fromAgentId,
      content: recipientResponse,
      timestamp: new Date().toISOString(),
    };
    conversation.messages.push(responseMessage);
    conversation.status = CONVERSATION_STATUS.OPEN;
    conversation.waitingOn = null;
    conversation.updatedAt = new Date().toISOString();

    this._persist(conversation);

    logger.log(toAgentId, 'CONVERSATION_RESPONSE', {
      conversationId,
      to: fromAgentId,
      contentLength: recipientResponse.length,
    });

    // Fire response event
    messageBus.send({
      from: toAgentId,
      to: fromAgentId,
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.MEDIUM,
      payload: {
        event: 'CONVERSATION_MESSAGE',
        conversationId,
        content: recipientResponse,
      },
    });

    return responseMessage;
  }

  /**
   * Get the full conversation thread.
   * @param {string} conversationId
   * @returns {object|null}
   */
  getConversation(conversationId) {
    return this.conversations.get(conversationId) || null;
  }

  /**
   * Resolve a conversation — mark it done and record the outcome.
   * @param {string} conversationId
   * @param {string} outcome — summary of what was decided
   * @returns {object} The resolved conversation
   */
  resolveConversation(conversationId, outcome) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    conversation.status = CONVERSATION_STATUS.RESOLVED;
    conversation.outcome = outcome;
    conversation.resolvedAt = new Date().toISOString();
    conversation.updatedAt = new Date().toISOString();

    this._persist(conversation);

    logger.log('system', 'CONVERSATION_RESOLVED', {
      conversationId,
      outcomeLength: outcome.length,
      messageCount: conversation.messages.length,
    });

    // Fire resolved event
    messageBus.send({
      from: 'system',
      to: conversation.initiator,
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.MEDIUM,
      payload: {
        event: 'CONVERSATION_RESOLVED',
        conversationId,
        outcome,
      },
    });

    return conversation;
  }

  /**
   * Have a full back-and-forth conversation between two agents.
   * They exchange messages until one signals they've reached agreement,
   * or until maxRounds is hit.
   *
   * @param {string} topic — what to discuss
   * @param {string} agentA — first agent (kicks off the convo)
   * @param {string} agentB — second agent
   * @param {string} initialPrompt — the opening message from agentA
   * @param {object} [opts]
   * @param {number} [opts.maxRounds=3] — max back-and-forth exchanges
   * @param {string} [opts.clientId] — optional client context
   * @returns {Promise<object>} The full conversation with outcome
   */
  async runConversation(topic, agentA, agentB, initialPrompt, opts = {}) {
    const { maxRounds = 3, clientId = null } = opts;

    const conversation = this.createConversation(
      topic,
      agentA,
      [agentA, agentB],
      clientId,
    );

    const nameA = agentPersonas.getAgentName(agentA);
    const nameB = agentPersonas.getAgentName(agentB);

    console.log(`\n--- Conversation: ${nameA} <-> ${nameB} ---`);
    console.log(`Topic: ${topic}`);
    console.log(`---`);

    let lastMessage = initialPrompt;
    let currentSender = agentA;
    let currentRecipient = agentB;

    for (let round = 0; round < maxRounds; round++) {
      console.log(`\n[${agentPersonas.getAgentName(currentSender)}]:`);
      if (round === 0) {
        // First message — just log it, the sendMessage will record it
        console.log(lastMessage.substring(0, 200) + (lastMessage.length > 200 ? '...' : ''));
      }

      const response = await this.sendMessage(
        conversation.conversationId,
        currentSender,
        currentRecipient,
        lastMessage,
      );

      console.log(`\n[${agentPersonas.getAgentName(currentRecipient)}]:`);
      console.log(response.content.substring(0, 300) + (response.content.length > 300 ? '...' : ''));

      lastMessage = response.content;

      // Check if the agent signalled agreement/resolution
      if (this._detectAgreement(response.content)) {
        logger.log('system', 'CONVERSATION_AGREEMENT_DETECTED', {
          conversationId: conversation.conversationId,
          round: round + 1,
        });
        break;
      }

      // Swap roles for next round
      [currentSender, currentRecipient] = [currentRecipient, currentSender];
    }

    // Generate a summary outcome from the final state
    const outcome = await this._summariseConversation(conversation);
    this.resolveConversation(conversation.conversationId, outcome);

    console.log(`\n--- Conversation Resolved ---`);
    console.log(`Outcome: ${outcome.substring(0, 200)}...`);
    console.log(`---\n`);

    return this.getConversation(conversation.conversationId);
  }

  // ─── Private Methods ──────────────────────────────────────

  /**
   * Call the Anthropic API as a specific agent, using their persona.
   * The conversation history is included so the agent has full context.
   */
  async _getAgentResponse(conversation, respondingAgentId, fromAgentId, latestMessage) {
    const systemPrompt = agentPersonas.getSystemPrompt(respondingAgentId);
    const model = getModelForAgent(respondingAgentId);
    const respondingName = agentPersonas.getAgentName(respondingAgentId);
    const fromName = agentPersonas.getAgentName(fromAgentId);

    // Build conversation history as messages array
    const messages = [];

    // Add prior conversation context
    if (conversation.messages.length > 1) {
      const history = conversation.messages.slice(0, -1); // exclude the message we just added
      const historyText = history.map(m => {
        const name = agentPersonas.getAgentName(m.from);
        return `[${name}]: ${m.content}`;
      }).join('\n\n');

      messages.push({
        role: 'user',
        content: `Here is the conversation so far between you and your colleagues about "${conversation.topic}":\n\n${historyText}`,
      });
      messages.push({
        role: 'assistant',
        content: 'Got it, I have the context. What\'s the latest?',
      });
    }

    // Add the latest message
    messages.push({
      role: 'user',
      content: `[${fromName}] says to you:\n\n${latestMessage}\n\n---\nRespond as ${respondingName}. Stay in character. Be specific and actionable. If you agree with the direction, say so clearly and summarise the joint proposal.`,
    });

    const response = await this.client.messages.create({
      model,
      max_tokens: 1500,
      system: systemPrompt,
      messages,
    });

    return response.content[0].text;
  }

  /**
   * Check if a message signals the agents have reached agreement.
   */
  _detectAgreement(text) {
    const lower = text.toLowerCase();
    const signals = [
      'i agree',
      'we\'re aligned',
      'joint proposal',
      'here\'s our joint',
      'here is our joint',
      'we agree',
      'that works for me',
      'i\'m on board',
      'let\'s go with',
      'approved from my side',
      'we\'ve agreed',
      'consensus reached',
    ];
    return signals.some(s => lower.includes(s));
  }

  /**
   * Use Nikita (Opus) to summarise a conversation into a clear outcome.
   */
  async _summariseConversation(conversation) {
    const transcript = conversation.messages.map(m => {
      const name = agentPersonas.getAgentName(m.from);
      return `[${name}]: ${m.content}`;
    }).join('\n\n');

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      system: 'You summarise agent conversations into clear, actionable outcomes. Be concise.',
      messages: [
        {
          role: 'user',
          content: `Summarise this conversation into a clear outcome/proposal. What was decided? What are the next steps?\n\nTopic: ${conversation.topic}\n\n${transcript}`,
        },
      ],
    });

    return response.content[0].text;
  }

  /**
   * Persist a conversation to disk.
   */
  _persist(conversation) {
    const filePath = join(CONVERSATIONS_DIR, `${conversation.conversationId}.json`);
    writeFileSync(filePath, JSON.stringify(conversation, null, 2));
  }

  /**
   * Load a conversation from disk.
   * @param {string} conversationId
   * @returns {object|null}
   */
  loadConversation(conversationId) {
    const filePath = join(CONVERSATIONS_DIR, `${conversationId}.json`);
    if (!existsSync(filePath)) return null;
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    this.conversations.set(conversationId, data);
    return data;
  }
}

const agentConversation = new AgentConversation();

export { agentConversation, CONVERSATION_STATUS };
