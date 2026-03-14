/**
 * Closer Bot Brain
 *
 * Extends the base AgentBrain with sales conversation logic.
 * Handles discovery calls, demos, objection handling, and deal closing.
 * Reports outcomes to Sales Lead.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../../core/message-bus.js';
import { taskQueue } from '../../core/task-queue.js';

const AGENT_ID = 'closer';
const AGENT_DIR = 'sales/closer';
const WORKER_MODEL = 'claude-sonnet-4-5-20250929';

/** Closer escalation triggers */
const ESCALATION_TRIGGERS = [
  'custom pricing', 'discount', 'special terms',
  'enterprise', 'strategic account',
  'complaint', 'unhappy', 'frustrated',
  'competitor mentioned', 'switching cost',
  'legal', 'contract dispute',
];

/** Conversation outcome types */
const CONVERSATION_OUTCOME = {
  DISCOVERY_COMPLETE: 'DISCOVERY_COMPLETE',
  DEMO_DELIVERED: 'DEMO_DELIVERED',
  OBJECTION_HANDLED: 'OBJECTION_HANDLED',
  PROPOSAL_REQUESTED: 'PROPOSAL_REQUESTED',
  VERBAL_COMMIT: 'VERBAL_COMMIT',
  FOLLOW_UP_NEEDED: 'FOLLOW_UP_NEEDED',
  DEAL_LOST: 'DEAL_LOST',
  NO_SHOW: 'NO_SHOW',
};

class CloserBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      model: WORKER_MODEL,
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initCloserState();
  }

  /**
   * Initialise or load closer state from memory.
   */
  _initCloserState() {
    if (!memory.has('closer:state')) {
      memory.set('closer:state', {
        activeConversations: [],
        completedConversations: [],
        metrics: {
          totalConversations: 0,
          discoveryCompleted: 0,
          demosDelivered: 0,
          proposalsRequested: 0,
          verbalCommits: 0,
          dealsLost: 0,
          noShows: 0,
        },
        objectionLog: [],
      });
    }
  }

  /**
   * Get current closer state.
   * @returns {object}
   */
  getCloserState() {
    return memory.get('closer:state');
  }

  /**
   * Start a new conversation with a prospect.
   * @param {string} leadId
   * @param {string} prospectName
   * @param {string} conversationType — 'discovery', 'demo', 'follow-up', 'close'
   * @param {string} [context] — additional context about the prospect
   * @returns {object} The conversation record
   */
  startConversation(leadId, prospectName, conversationType, context) {
    const state = this.getCloserState();

    const conversation = {
      id: `CONV-${Date.now()}`,
      leadId,
      prospectName,
      conversationType,
      context: context || '',
      outcome: null,
      notes: '',
      objections: [],
      nextSteps: '',
      startedAt: new Date().toISOString(),
      completedAt: null,
    };

    state.activeConversations.push(conversation);
    state.metrics.totalConversations++;
    memory.set('closer:state', state);

    logger.log(AGENT_ID, 'CONVERSATION_STARTED', {
      conversationId: conversation.id,
      leadId,
      type: conversationType,
    });

    return conversation;
  }

  /**
   * Record the outcome of a conversation.
   * @param {string} conversationId
   * @param {string} outcome — CONVERSATION_OUTCOME value
   * @param {{ notes?: string, objections?: string[], nextSteps?: string }} [details]
   * @returns {object|null} Updated conversation
   */
  recordOutcome(conversationId, outcome, details = {}) {
    const state = this.getCloserState();
    const idx = state.activeConversations.findIndex(c => c.id === conversationId);
    if (idx === -1) return null;

    const conversation = state.activeConversations[idx];
    conversation.outcome = outcome;
    conversation.notes = details.notes || '';
    conversation.nextSteps = details.nextSteps || '';
    conversation.completedAt = new Date().toISOString();

    if (details.objections?.length > 0) {
      conversation.objections = details.objections;
      for (const obj of details.objections) {
        state.objectionLog.push({
          leadId: conversation.leadId,
          objection: obj,
          conversationId,
          at: new Date().toISOString(),
        });
      }
    }

    // Update metrics
    const metricMap = {
      [CONVERSATION_OUTCOME.DISCOVERY_COMPLETE]: 'discoveryCompleted',
      [CONVERSATION_OUTCOME.DEMO_DELIVERED]: 'demosDelivered',
      [CONVERSATION_OUTCOME.PROPOSAL_REQUESTED]: 'proposalsRequested',
      [CONVERSATION_OUTCOME.VERBAL_COMMIT]: 'verbalCommits',
      [CONVERSATION_OUTCOME.DEAL_LOST]: 'dealsLost',
      [CONVERSATION_OUTCOME.NO_SHOW]: 'noShows',
    };
    if (metricMap[outcome]) {
      state.metrics[metricMap[outcome]]++;
    }

    // Move to completed
    state.activeConversations.splice(idx, 1);
    state.completedConversations.push(conversation);

    memory.set('closer:state', state);

    // Report outcome to Sales Lead
    messageBus.send({
      from: AGENT_ID,
      to: 'sales-lead',
      type: MESSAGE_TYPES.REPORT,
      priority: outcome === CONVERSATION_OUTCOME.VERBAL_COMMIT ? PRIORITY.HIGH : PRIORITY.MEDIUM,
      payload: {
        event: 'CONVERSATION_OUTCOME',
        conversationId,
        leadId: conversation.leadId,
        prospectName: conversation.prospectName,
        outcome,
        notes: conversation.notes,
        nextSteps: conversation.nextSteps,
        objections: conversation.objections,
      },
    });

    // If proposal requested, notify Sales Lead to trigger Proposal Bot
    if (outcome === CONVERSATION_OUTCOME.PROPOSAL_REQUESTED) {
      messageBus.send({
        from: AGENT_ID,
        to: 'sales-lead',
        type: MESSAGE_TYPES.TASK,
        priority: PRIORITY.HIGH,
        payload: {
          event: 'PROPOSAL_NEEDED',
          leadId: conversation.leadId,
          prospectName: conversation.prospectName,
          context: conversation.notes,
        },
      });
    }

    logger.log(AGENT_ID, 'CONVERSATION_COMPLETED', {
      conversationId,
      outcome,
      leadId: conversation.leadId,
    });

    return conversation;
  }

  /**
   * Get conversation performance metrics.
   * @returns {object}
   */
  getPerformanceMetrics() {
    const state = this.getCloserState();
    return {
      ...state.metrics,
      activeConversations: state.activeConversations.length,
      conversionRate: state.metrics.totalConversations > 0
        ? Math.round((state.metrics.verbalCommits / state.metrics.totalConversations) * 100)
        : 0,
      topObjections: this._getTopObjections(state),
    };
  }

  /**
   * Get the most common objections.
   * @private
   */
  _getTopObjections(state) {
    const counts = {};
    for (const entry of state.objectionLog) {
      counts[entry.objection] = (counts[entry.objection] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([objection, count]) => ({ objection, count }));
  }

  /**
   * Process a message with closer context.
   * @param {object} message
   * @returns {Promise<object>}
   */
  async processMessage(message) {
    const metrics = this.getPerformanceMetrics();
    const additionalContext = [
      `Active conversations: ${metrics.activeConversations}`,
      `Total conversations: ${metrics.totalConversations}`,
      `Conversion rate: ${metrics.conversionRate}%`,
      `Verbal commits: ${metrics.verbalCommits}`,
    ].join('\n');

    return super.processMessage(message, additionalContext);
  }
}

const closerBrain = new CloserBrain();

export { closerBrain, CONVERSATION_OUTCOME };
