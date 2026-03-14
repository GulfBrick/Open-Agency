/**
 * Follow-Up Bot Brain
 *
 * Extends the base AgentBrain with nurture and follow-up logic.
 * Manages cadences, tracks engagement, and re-engages cold leads.
 * Reports engagement signals to Sales Lead.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../../core/message-bus.js';

const AGENT_ID = 'follow-up';
const AGENT_DIR = 'sales/follow-up';
const WORKER_MODEL = 'claude-sonnet-4-5-20250929';

/** Follow-up escalation triggers */
const ESCALATION_TRIGGERS = [
  'opt-out', 'unsubscribe', 'stop contacting',
  'complaint', 'angry', 'frustrated',
  'interested', 'ready to buy', 'budget approved',
  'referral', 'introduced to',
];

/** Cadence types */
const CADENCE_TYPE = {
  NEW_LEAD: 'NEW_LEAD',
  ACTIVE_DEAL: 'ACTIVE_DEAL',
  COLD_REENGAGEMENT: 'COLD_REENGAGEMENT',
  POST_MEETING: 'POST_MEETING',
  CLIENT_CHECKIN: 'CLIENT_CHECKIN',
  LOST_DEAL: 'LOST_DEAL',
};

/** Touchpoint status */
const TOUCHPOINT_STATUS = {
  SCHEDULED: 'SCHEDULED',
  SENT: 'SENT',
  RESPONDED: 'RESPONDED',
  SKIPPED: 'SKIPPED',
};

class FollowUpBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      model: WORKER_MODEL,
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initFollowUpState();
  }

  /**
   * Initialise or load follow-up state from memory.
   */
  _initFollowUpState() {
    if (!memory.has('follow-up:state')) {
      memory.set('follow-up:state', {
        activeSequences: [],
        completedSequences: [],
        metrics: {
          totalSequences: 0,
          totalTouchpoints: 0,
          totalResponses: 0,
          reEngagements: 0,
          optOuts: 0,
        },
      });
    }
  }

  /**
   * Get current follow-up state.
   * @returns {object}
   */
  getFollowUpState() {
    return memory.get('follow-up:state');
  }

  /**
   * Start a follow-up sequence for a prospect.
   * @param {string} leadId
   * @param {string} prospectName
   * @param {string} cadenceType — CADENCE_TYPE value
   * @param {{ totalTouches?: number, intervalDays?: number, context?: string }} [opts]
   * @returns {object} The sequence
   */
  startSequence(leadId, prospectName, cadenceType, opts = {}) {
    const state = this.getFollowUpState();

    const defaults = {
      [CADENCE_TYPE.NEW_LEAD]: { totalTouches: 6, intervalDays: 3 },
      [CADENCE_TYPE.ACTIVE_DEAL]: { totalTouches: 0, intervalDays: 2 },
      [CADENCE_TYPE.COLD_REENGAGEMENT]: { totalTouches: 4, intervalDays: 10 },
      [CADENCE_TYPE.POST_MEETING]: { totalTouches: 3, intervalDays: 2 },
      [CADENCE_TYPE.CLIENT_CHECKIN]: { totalTouches: 0, intervalDays: 30 },
      [CADENCE_TYPE.LOST_DEAL]: { totalTouches: 3, intervalDays: 14 },
    };

    const cadenceDefaults = defaults[cadenceType] || { totalTouches: 5, intervalDays: 5 };

    const sequence = {
      id: `SEQ-${Date.now()}`,
      leadId,
      prospectName,
      cadenceType,
      totalTouches: opts.totalTouches || cadenceDefaults.totalTouches,
      intervalDays: opts.intervalDays || cadenceDefaults.intervalDays,
      context: opts.context || '',
      touchpoints: [],
      currentStep: 0,
      status: 'ACTIVE',
      startedAt: new Date().toISOString(),
      nextTouchAt: new Date().toISOString(),
    };

    state.activeSequences.push(sequence);
    state.metrics.totalSequences++;
    memory.set('follow-up:state', state);

    logger.log(AGENT_ID, 'SEQUENCE_STARTED', {
      sequenceId: sequence.id,
      leadId,
      cadenceType,
      totalTouches: sequence.totalTouches,
    });

    return sequence;
  }

  /**
   * Record a touchpoint in a sequence.
   * @param {string} sequenceId
   * @param {string} channel — 'email', 'message', 'call'
   * @param {string} content — what was sent
   * @param {string} [status] — TOUCHPOINT_STATUS value
   * @returns {object|null} Updated sequence
   */
  recordTouchpoint(sequenceId, channel, content, status) {
    const state = this.getFollowUpState();
    const sequence = state.activeSequences.find(s => s.id === sequenceId);
    if (!sequence) return null;

    const touchpoint = {
      step: sequence.currentStep + 1,
      channel,
      content,
      status: status || TOUCHPOINT_STATUS.SENT,
      sentAt: new Date().toISOString(),
      respondedAt: null,
    };

    sequence.touchpoints.push(touchpoint);
    sequence.currentStep++;
    state.metrics.totalTouchpoints++;

    // Calculate next touch date
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + sequence.intervalDays);
    sequence.nextTouchAt = nextDate.toISOString();

    // Check if sequence is complete
    if (sequence.totalTouches > 0 && sequence.currentStep >= sequence.totalTouches) {
      sequence.status = 'COMPLETED';
      sequence.completedAt = new Date().toISOString();

      const idx = state.activeSequences.indexOf(sequence);
      state.activeSequences.splice(idx, 1);
      state.completedSequences.push(sequence);
    }

    memory.set('follow-up:state', state);

    logger.log(AGENT_ID, 'TOUCHPOINT_RECORDED', {
      sequenceId,
      step: touchpoint.step,
      channel,
    });

    return sequence;
  }

  /**
   * Record a response from a prospect.
   * @param {string} sequenceId
   * @param {string} responseType — 'positive', 'neutral', 'negative', 'opt-out'
   * @param {string} [content] — what they said
   * @returns {object|null} Updated sequence
   */
  recordResponse(sequenceId, responseType, content) {
    const state = this.getFollowUpState();
    const sequence = state.activeSequences.find(s => s.id === sequenceId);
    if (!sequence) return null;

    // Update the last touchpoint
    const lastTouch = sequence.touchpoints[sequence.touchpoints.length - 1];
    if (lastTouch) {
      lastTouch.status = TOUCHPOINT_STATUS.RESPONDED;
      lastTouch.respondedAt = new Date().toISOString();
      lastTouch.responseType = responseType;
      lastTouch.responseContent = content || '';
    }

    state.metrics.totalResponses++;

    // Handle based on response type
    if (responseType === 'positive') {
      state.metrics.reEngagements++;

      // Escalate to Sales Lead — prospect is showing buying intent
      messageBus.send({
        from: AGENT_ID,
        to: 'sales-lead',
        type: MESSAGE_TYPES.ALERT,
        priority: PRIORITY.HIGH,
        payload: {
          event: 'PROSPECT_RE_ENGAGED',
          leadId: sequence.leadId,
          prospectName: sequence.prospectName,
          cadenceType: sequence.cadenceType,
          response: content || 'Positive engagement signal',
        },
      });

      // Pause the sequence
      sequence.status = 'PAUSED_ENGAGED';
    }

    if (responseType === 'opt-out') {
      state.metrics.optOuts++;
      sequence.status = 'STOPPED_OPT_OUT';

      const idx = state.activeSequences.indexOf(sequence);
      state.activeSequences.splice(idx, 1);
      state.completedSequences.push(sequence);

      logger.log(AGENT_ID, 'OPT_OUT_RECORDED', {
        sequenceId,
        leadId: sequence.leadId,
      });
    }

    memory.set('follow-up:state', state);

    logger.log(AGENT_ID, 'RESPONSE_RECORDED', {
      sequenceId,
      responseType,
      leadId: sequence.leadId,
    });

    return sequence;
  }

  /**
   * Get follow-up performance metrics.
   * @returns {object}
   */
  getMetrics() {
    const state = this.getFollowUpState();
    return {
      ...state.metrics,
      activeSequences: state.activeSequences.length,
      responseRate: state.metrics.totalTouchpoints > 0
        ? Math.round((state.metrics.totalResponses / state.metrics.totalTouchpoints) * 100)
        : 0,
      reEngagementRate: state.metrics.totalSequences > 0
        ? Math.round((state.metrics.reEngagements / state.metrics.totalSequences) * 100)
        : 0,
    };
  }

  /**
   * Find sequences due for their next touchpoint.
   * @returns {object[]}
   */
  getDueTouchpoints() {
    const state = this.getFollowUpState();
    const now = new Date();

    return state.activeSequences.filter(seq => {
      return seq.status === 'ACTIVE' && new Date(seq.nextTouchAt) <= now;
    });
  }

  /**
   * Process a message with follow-up context.
   * @param {object} message
   * @returns {Promise<object>}
   */
  async processMessage(message) {
    const metrics = this.getMetrics();
    const additionalContext = [
      `Active sequences: ${metrics.activeSequences}`,
      `Total touchpoints: ${metrics.totalTouchpoints}`,
      `Response rate: ${metrics.responseRate}%`,
      `Re-engagements: ${metrics.reEngagements}`,
    ].join('\n');

    return super.processMessage(message, additionalContext);
  }
}

const followUpBrain = new FollowUpBrain();

export { followUpBrain, CADENCE_TYPE, TOUCHPOINT_STATUS };
