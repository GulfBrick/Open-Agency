/**
 * Lead Qualifier Bot Brain
 *
 * Extends the base AgentBrain with lead qualification logic.
 * Scores inbound leads against ICP criteria and routes them.
 * Reports qualification metrics to Sales Lead.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../../core/message-bus.js';

const AGENT_ID = 'lead-qualifier';
const AGENT_DIR = 'sales/lead-qualifier';
const WORKER_MODEL = 'claude-sonnet-4-5-20250929';

/** Qualifier escalation triggers */
const ESCALATION_TRIGGERS = [
  'enterprise', 'strategic account', 'existing client',
  'high value', 'urgent need',
  'competitor mention', 'switching from',
  'referral from',
];

/** Qualification verdict */
const VERDICT = {
  QUALIFIED: 'QUALIFIED',
  DISQUALIFIED: 'DISQUALIFIED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
};

class LeadQualifierBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      model: WORKER_MODEL,
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initQualifierState();
  }

  /**
   * Initialise or load qualifier state from memory.
   */
  _initQualifierState() {
    if (!memory.has('lead-qualifier:state')) {
      memory.set('lead-qualifier:state', {
        assessments: [],
        metrics: {
          totalAssessed: 0,
          qualified: 0,
          disqualified: 0,
          needsReview: 0,
          avgScore: 0,
          bySource: {},
        },
        scoringWeights: {
          companyFit: 25,
          needFit: 25,
          budgetSignal: 20,
          timeline: 15,
          decisionAuthority: 15,
        },
      });
    }
  }

  /**
   * Get current qualifier state.
   * @returns {object}
   */
  getQualifierState() {
    return memory.get('lead-qualifier:state');
  }

  /**
   * Assess a lead against qualification criteria.
   * @param {string} leadId
   * @param {{ companyFit: number, needFit: number, budgetSignal: number, timeline: number, decisionAuthority: number }} scores — each 0–100
   * @param {string} source — lead source
   * @param {string} [notes]
   * @returns {object} Assessment result with score and verdict
   */
  assessLead(leadId, scores, source, notes) {
    const state = this.getQualifierState();
    const weights = state.scoringWeights;

    // Calculate weighted score
    const weightedScore = Math.round(
      (scores.companyFit * weights.companyFit +
       scores.needFit * weights.needFit +
       scores.budgetSignal * weights.budgetSignal +
       scores.timeline * weights.timeline +
       scores.decisionAuthority * weights.decisionAuthority) / 100
    );

    // Determine verdict
    let verdict;
    if (weightedScore >= 60) {
      verdict = VERDICT.QUALIFIED;
      state.metrics.qualified++;
    } else if (weightedScore >= 40) {
      verdict = VERDICT.NEEDS_REVIEW;
      state.metrics.needsReview++;
    } else {
      verdict = VERDICT.DISQUALIFIED;
      state.metrics.disqualified++;
    }

    const assessment = {
      id: `ASSESS-${Date.now()}`,
      leadId,
      scores,
      weightedScore,
      verdict,
      source,
      notes: notes || '',
      assessedAt: new Date().toISOString(),
    };

    state.assessments.push(assessment);
    state.metrics.totalAssessed++;
    state.metrics.bySource[source] = (state.metrics.bySource[source] || 0) + 1;

    // Update average score
    const totalScore = state.assessments.reduce((sum, a) => sum + a.weightedScore, 0);
    state.metrics.avgScore = Math.round(totalScore / state.assessments.length);

    memory.set('lead-qualifier:state', state);

    // Report to Sales Lead
    messageBus.send({
      from: AGENT_ID,
      to: 'sales-lead',
      type: MESSAGE_TYPES.REPORT,
      priority: verdict === VERDICT.QUALIFIED ? PRIORITY.HIGH : PRIORITY.MEDIUM,
      payload: {
        event: 'LEAD_ASSESSED',
        leadId,
        weightedScore,
        verdict,
        scores,
        notes: notes || '',
      },
    });

    // Escalate edge cases
    if (verdict === VERDICT.NEEDS_REVIEW) {
      messageBus.send({
        from: AGENT_ID,
        to: 'sales-lead',
        type: MESSAGE_TYPES.ESCALATION,
        priority: PRIORITY.MEDIUM,
        payload: {
          event: 'LEAD_NEEDS_REVIEW',
          leadId,
          weightedScore,
          scores,
          reason: 'Score falls in review range (40-59). Manual assessment recommended.',
          notes: notes || '',
        },
      });
    }

    logger.log(AGENT_ID, 'LEAD_ASSESSED', {
      leadId,
      weightedScore,
      verdict,
    });

    return assessment;
  }

  /**
   * Get qualification metrics summary.
   * @returns {object}
   */
  getMetrics() {
    const state = this.getQualifierState();
    return {
      ...state.metrics,
      qualificationRate: state.metrics.totalAssessed > 0
        ? Math.round((state.metrics.qualified / state.metrics.totalAssessed) * 100)
        : 0,
    };
  }

  /**
   * Process a message with qualifier context.
   * @param {object} message
   * @returns {Promise<object>}
   */
  async processMessage(message) {
    const metrics = this.getMetrics();
    const additionalContext = [
      `Total assessed: ${metrics.totalAssessed}`,
      `Qualification rate: ${metrics.qualificationRate}%`,
      `Average score: ${metrics.avgScore}`,
      `Pending review: ${metrics.needsReview}`,
    ].join('\n');

    return super.processMessage(message, additionalContext);
  }
}

const leadQualifierBrain = new LeadQualifierBrain();

export { leadQualifierBrain, VERDICT };
