/**
 * Sales Lead Brain
 *
 * Extends the base AgentBrain with sales domain logic.
 * Manages the full pipeline — leads, qualification, proposals, deals, revenue.
 * Coordinates Closer, Lead Qualifier, Follow-Up, and Proposal worker bots.
 *
 * This is a GENERIC sales team — client context (ICP, pricing, offering)
 * is injected at runtime via business knowledge.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../../core/message-bus.js';
import { taskQueue } from '../../core/task-queue.js';
import { businessKnowledge } from '../../core/business-knowledge.js';

const AGENT_ID = 'sales-lead';
const AGENT_DIR = 'sales/lead';
const WORKER_MODEL = 'claude-sonnet-4-5-20250929';

/** Sales escalation triggers */
const ESCALATION_TRIGGERS = [
  'revenue threshold', 'large deal', 'enterprise',
  'custom pricing', 'discount', 'non-standard terms',
  'partnership', 'strategic account',
  'unhappy prospect', 'churn risk', 'complaint',
  'competitor', 'lost deal', 'deal at risk',
  'capability gap', 'can\'t deliver',
  'contract dispute', 'payment issue',
  'pricing change', 'rate increase',
];

/** Pipeline stage definitions */
const PIPELINE_STAGE = {
  LEAD: 'LEAD',
  QUALIFIED: 'QUALIFIED',
  DISCOVERY: 'DISCOVERY',
  PROPOSAL: 'PROPOSAL',
  NEGOTIATION: 'NEGOTIATION',
  CLOSED_WON: 'CLOSED_WON',
  CLOSED_LOST: 'CLOSED_LOST',
  DISQUALIFIED: 'DISQUALIFIED',
};

/** Default stage win probabilities for forecasting */
const STAGE_PROBABILITY = {
  [PIPELINE_STAGE.LEAD]: 0.10,
  [PIPELINE_STAGE.QUALIFIED]: 0.20,
  [PIPELINE_STAGE.DISCOVERY]: 0.40,
  [PIPELINE_STAGE.PROPOSAL]: 0.60,
  [PIPELINE_STAGE.NEGOTIATION]: 0.80,
  [PIPELINE_STAGE.CLOSED_WON]: 1.00,
  [PIPELINE_STAGE.CLOSED_LOST]: 0,
  [PIPELINE_STAGE.DISQUALIFIED]: 0,
};

/** Lead source types */
const LEAD_SOURCE = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
  REFERRAL: 'REFERRAL',
  MARKETING: 'MARKETING',
  PARTNER: 'PARTNER',
};

/** Worker bot IDs and their specialities */
const SALES_BOTS = {
  'closer': { name: 'Closer Bot', speciality: 'closing', dir: 'sales/closer' },
  'lead-qualifier': { name: 'Lead Qualifier Bot', speciality: 'qualification', dir: 'sales/lead-qualifier' },
  'follow-up': { name: 'Follow-Up Bot', speciality: 'nurture', dir: 'sales/follow-up' },
  'proposal': { name: 'Proposal Bot', speciality: 'proposals', dir: 'sales/proposal' },
};

class SalesLeadBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      model: WORKER_MODEL,
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initSalesState();
  }

  // ─── State Management ───────────────────────────────────────

  /**
   * Initialise or load sales state from memory.
   */
  _initSalesState() {
    if (!memory.has('sales-lead:state')) {
      memory.set('sales-lead:state', {
        pipeline: [],
        leads: [],
        closedDeals: [],
        lostDeals: [],
        teamWorkload: this._initWorkload(),
        metrics: {
          totalLeads: 0,
          totalQualified: 0,
          totalProposals: 0,
          totalClosedWon: 0,
          totalClosedLost: 0,
          totalRevenue: 0,
          bySource: {},
          byClient: {},
        },
        forecast: {
          committed: 0,
          bestCase: 0,
          pipeline: 0,
        },
        qualificationCriteria: {
          minCompanySize: null,
          targetIndustries: [],
          minBudget: null,
          requiredSignals: [],
        },
      });
    }
  }

  /**
   * Build initial workload tracking for all sales bots.
   * @returns {Record<string, object>}
   */
  _initWorkload() {
    const workload = {};
    for (const [botId, bot] of Object.entries(SALES_BOTS)) {
      workload[botId] = {
        name: bot.name,
        speciality: bot.speciality,
        activeTasks: 0,
        completedTotal: 0,
      };
    }
    return workload;
  }

  /**
   * Get current sales state.
   * @returns {object}
   */
  getSalesState() {
    return memory.get('sales-lead:state');
  }

  // ─── Lead Management ────────────────────────────────────────

  /**
   * Add a new lead to the pipeline.
   * @param {string} prospectName — company or individual name
   * @param {string} contactEmail
   * @param {string} source — INBOUND, OUTBOUND, REFERRAL, MARKETING, PARTNER
   * @param {{ description?: string, estimatedValue?: number, clientId?: string, industry?: string, companySize?: string }} [opts]
   * @returns {object} The created lead
   */
  addLead(prospectName, contactEmail, source, opts = {}) {
    const state = this.getSalesState();

    const lead = {
      id: `LEAD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      prospectName,
      contactEmail,
      source: source || LEAD_SOURCE.INBOUND,
      description: opts.description || '',
      estimatedValue: opts.estimatedValue || 0,
      clientId: opts.clientId || null,
      industry: opts.industry || null,
      companySize: opts.companySize || null,
      stage: PIPELINE_STAGE.LEAD,
      qualificationScore: null,
      assignedTo: null,
      activities: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stageHistory: [{ stage: PIPELINE_STAGE.LEAD, enteredAt: new Date().toISOString() }],
    };

    state.pipeline.push(lead);
    state.leads.push(lead.id);
    state.metrics.totalLeads++;
    state.metrics.bySource[source] = (state.metrics.bySource[source] || 0) + 1;

    memory.set('sales-lead:state', state);

    // Dispatch to Lead Qualifier
    taskQueue.enqueue({
      assignedTo: 'lead-qualifier',
      createdBy: AGENT_ID,
      type: MESSAGE_TYPES.TASK,
      priority: 'HIGH',
      description: `Qualify lead [${lead.id}] ${prospectName} — ${source}. ${opts.description || ''}`,
    });

    if (state.teamWorkload['lead-qualifier']) {
      state.teamWorkload['lead-qualifier'].activeTasks++;
      memory.set('sales-lead:state', state);
    }

    logger.log(AGENT_ID, 'LEAD_ADDED', {
      leadId: lead.id,
      prospectName,
      source,
      estimatedValue: lead.estimatedValue,
    });

    return lead;
  }

  /**
   * Qualify a lead (called after Lead Qualifier evaluates it).
   * @param {string} leadId
   * @param {number} score — 0–100
   * @param {boolean} qualified
   * @param {string} [notes]
   * @returns {object|null} Updated lead
   */
  qualifyLead(leadId, score, qualified, notes) {
    const state = this.getSalesState();
    const lead = state.pipeline.find(l => l.id === leadId);
    if (!lead) return null;

    lead.qualificationScore = score;
    lead.updatedAt = new Date().toISOString();

    if (qualified) {
      lead.stage = PIPELINE_STAGE.QUALIFIED;
      lead.stageHistory.push({ stage: PIPELINE_STAGE.QUALIFIED, enteredAt: new Date().toISOString() });
      state.metrics.totalQualified++;

      // Assign to Closer for discovery
      lead.assignedTo = 'closer';
      taskQueue.enqueue({
        assignedTo: 'closer',
        createdBy: AGENT_ID,
        type: MESSAGE_TYPES.TASK,
        priority: 'HIGH',
        description: `Begin discovery for [${leadId}] ${lead.prospectName}. Score: ${score}. ${notes || ''}`,
      });

      if (state.teamWorkload['closer']) {
        state.teamWorkload['closer'].activeTasks++;
      }
    } else {
      lead.stage = PIPELINE_STAGE.DISQUALIFIED;
      lead.stageHistory.push({ stage: PIPELINE_STAGE.DISQUALIFIED, enteredAt: new Date().toISOString() });

      // Put on nurture sequence
      taskQueue.enqueue({
        assignedTo: 'follow-up',
        createdBy: AGENT_ID,
        type: MESSAGE_TYPES.TASK,
        priority: 'LOW',
        description: `Add [${leadId}] ${lead.prospectName} to cold nurture sequence. Disqualified: ${notes || 'did not meet criteria'}`,
      });
    }

    lead.activities.push({
      type: 'QUALIFICATION',
      outcome: qualified ? 'QUALIFIED' : 'DISQUALIFIED',
      score,
      notes: notes || null,
      at: new Date().toISOString(),
    });

    // Update lead qualifier workload
    if (state.teamWorkload['lead-qualifier']) {
      state.teamWorkload['lead-qualifier'].activeTasks--;
      state.teamWorkload['lead-qualifier'].completedTotal++;
    }

    memory.set('sales-lead:state', state);

    logger.log(AGENT_ID, 'LEAD_QUALIFIED', {
      leadId,
      score,
      qualified,
      nextStage: lead.stage,
    });

    return lead;
  }

  // ─── Deal Progression ──────────────────────────────────────

  /**
   * Advance a deal to the next pipeline stage.
   * @param {string} leadId
   * @param {string} newStage — PIPELINE_STAGE value
   * @param {{ notes?: string, estimatedValue?: number }} [opts]
   * @returns {object|null} Updated lead
   */
  advanceDeal(leadId, newStage, opts = {}) {
    const state = this.getSalesState();
    const lead = state.pipeline.find(l => l.id === leadId);
    if (!lead) return null;

    const previousStage = lead.stage;
    lead.stage = newStage;
    lead.updatedAt = new Date().toISOString();
    lead.stageHistory.push({ stage: newStage, enteredAt: new Date().toISOString() });

    if (opts.estimatedValue !== undefined) {
      lead.estimatedValue = opts.estimatedValue;
    }

    lead.activities.push({
      type: 'STAGE_CHANGE',
      from: previousStage,
      to: newStage,
      notes: opts.notes || null,
      at: new Date().toISOString(),
    });

    // Trigger actions based on stage
    if (newStage === PIPELINE_STAGE.PROPOSAL) {
      state.metrics.totalProposals++;
      taskQueue.enqueue({
        assignedTo: 'proposal',
        createdBy: AGENT_ID,
        type: MESSAGE_TYPES.TASK,
        priority: 'HIGH',
        description: `Generate proposal for [${leadId}] ${lead.prospectName}. Value: ${lead.estimatedValue}. ${opts.notes || ''}`,
      });

      if (state.teamWorkload['proposal']) {
        state.teamWorkload['proposal'].activeTasks++;
      }
    }

    if (newStage === PIPELINE_STAGE.CLOSED_WON) {
      this._closeDealWon(lead, state);
    }

    if (newStage === PIPELINE_STAGE.CLOSED_LOST) {
      this._closeDealLost(lead, state, opts.notes);
    }

    this._updateForecast(state);
    memory.set('sales-lead:state', state);

    logger.log(AGENT_ID, 'DEAL_ADVANCED', {
      leadId,
      from: previousStage,
      to: newStage,
      estimatedValue: lead.estimatedValue,
    });

    return lead;
  }

  /**
   * Handle a won deal.
   * @private
   */
  _closeDealWon(lead, state) {
    state.metrics.totalClosedWon++;
    state.metrics.totalRevenue += lead.estimatedValue;
    state.metrics.byClient[lead.clientId || 'unassigned'] =
      (state.metrics.byClient[lead.clientId || 'unassigned'] || 0) + lead.estimatedValue;

    state.closedDeals.push({
      leadId: lead.id,
      prospectName: lead.prospectName,
      value: lead.estimatedValue,
      source: lead.source,
      closedAt: new Date().toISOString(),
      cycleTime: this._calculateCycleTime(lead),
    });

    // Remove from active pipeline
    state.pipeline = state.pipeline.filter(l => l.id !== lead.id);

    // Notify CFO
    messageBus.send({
      from: AGENT_ID,
      to: 'cfo',
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.HIGH,
      payload: {
        event: 'DEAL_CLOSED_WON',
        prospectName: lead.prospectName,
        value: lead.estimatedValue,
        source: lead.source,
      },
    });

    // Notify Nikita
    messageBus.send({
      from: AGENT_ID,
      to: 'nikita',
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.HIGH,
      payload: {
        event: 'DEAL_CLOSED_WON',
        prospectName: lead.prospectName,
        value: lead.estimatedValue,
        source: lead.source,
        totalRevenue: state.metrics.totalRevenue,
      },
    });

    // Assign follow-up for client onboarding check-in
    taskQueue.enqueue({
      assignedTo: 'follow-up',
      createdBy: AGENT_ID,
      type: MESSAGE_TYPES.TASK,
      priority: 'MEDIUM',
      description: `Schedule onboarding check-in cadence for new client ${lead.prospectName}`,
    });

    logger.log(AGENT_ID, 'DEAL_WON', {
      leadId: lead.id,
      value: lead.estimatedValue,
    });
  }

  /**
   * Handle a lost deal.
   * @private
   */
  _closeDealLost(lead, state, reason) {
    state.metrics.totalClosedLost++;

    state.lostDeals.push({
      leadId: lead.id,
      prospectName: lead.prospectName,
      value: lead.estimatedValue,
      source: lead.source,
      reason: reason || 'unknown',
      lostAt: new Date().toISOString(),
      cycleTime: this._calculateCycleTime(lead),
    });

    // Remove from active pipeline
    state.pipeline = state.pipeline.filter(l => l.id !== lead.id);

    // Notify Nikita
    messageBus.send({
      from: AGENT_ID,
      to: 'nikita',
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.MEDIUM,
      payload: {
        event: 'DEAL_CLOSED_LOST',
        prospectName: lead.prospectName,
        value: lead.estimatedValue,
        reason: reason || 'unknown',
      },
    });

    // Add to re-engagement nurture
    taskQueue.enqueue({
      assignedTo: 'follow-up',
      createdBy: AGENT_ID,
      type: MESSAGE_TYPES.TASK,
      priority: 'LOW',
      description: `Add [${lead.id}] ${lead.prospectName} to lost deal re-engagement sequence. Reason: ${reason || 'unknown'}`,
    });

    logger.log(AGENT_ID, 'DEAL_LOST', {
      leadId: lead.id,
      value: lead.estimatedValue,
      reason,
    });
  }

  /**
   * Calculate deal cycle time in days.
   * @private
   */
  _calculateCycleTime(lead) {
    const created = new Date(lead.createdAt);
    const now = new Date();
    return Math.round((now - created) / (1000 * 60 * 60 * 24));
  }

  // ─── Activity Logging ──────────────────────────────────────

  /**
   * Log an activity on a deal (call, email, meeting, etc.).
   * @param {string} leadId
   * @param {string} activityType — 'call', 'email', 'meeting', 'demo', 'note'
   * @param {string} summary
   * @param {string} [performedBy] — bot or person who did it
   * @returns {object|null} Updated lead
   */
  logActivity(leadId, activityType, summary, performedBy) {
    const state = this.getSalesState();
    const lead = state.pipeline.find(l => l.id === leadId);
    if (!lead) return null;

    lead.activities.push({
      type: activityType.toUpperCase(),
      summary,
      performedBy: performedBy || AGENT_ID,
      at: new Date().toISOString(),
    });

    lead.updatedAt = new Date().toISOString();
    memory.set('sales-lead:state', state);

    logger.log(AGENT_ID, 'ACTIVITY_LOGGED', {
      leadId,
      activityType,
      performedBy: performedBy || AGENT_ID,
    });

    return lead;
  }

  // ─── Forecasting ───────────────────────────────────────────

  /**
   * Recalculate the revenue forecast based on current pipeline.
   * @private
   */
  _updateForecast(state) {
    let committed = 0;
    let bestCase = 0;
    let totalPipeline = 0;

    for (const deal of state.pipeline) {
      const probability = STAGE_PROBABILITY[deal.stage] || 0;
      const weighted = deal.estimatedValue * probability;

      totalPipeline += deal.estimatedValue;

      if (deal.stage === PIPELINE_STAGE.NEGOTIATION) {
        committed += weighted;
      }
      bestCase += weighted;
    }

    // Add already closed revenue
    committed += state.metrics.totalRevenue;
    bestCase += state.metrics.totalRevenue;

    state.forecast = {
      committed: Math.round(committed),
      bestCase: Math.round(bestCase),
      pipeline: Math.round(totalPipeline),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get the current revenue forecast.
   * @returns {object}
   */
  getForecast() {
    const state = this.getSalesState();
    this._updateForecast(state);
    memory.set('sales-lead:state', state);
    return state.forecast;
  }

  // ─── Pipeline Analytics ────────────────────────────────────

  /**
   * Get pipeline summary by stage.
   * @returns {object}
   */
  getPipelineSummary() {
    const state = this.getSalesState();
    const byStage = {};

    for (const stage of Object.values(PIPELINE_STAGE)) {
      const deals = state.pipeline.filter(d => d.stage === stage);
      byStage[stage] = {
        count: deals.length,
        value: deals.reduce((sum, d) => sum + d.estimatedValue, 0),
      };
    }

    const activePipeline = state.pipeline.filter(d =>
      d.stage !== PIPELINE_STAGE.CLOSED_WON &&
      d.stage !== PIPELINE_STAGE.CLOSED_LOST &&
      d.stage !== PIPELINE_STAGE.DISQUALIFIED
    );

    return {
      totalDeals: activePipeline.length,
      totalPipelineValue: activePipeline.reduce((sum, d) => sum + d.estimatedValue, 0),
      byStage,
      closedWon: state.metrics.totalClosedWon,
      closedLost: state.metrics.totalClosedLost,
      winRate: (state.metrics.totalClosedWon + state.metrics.totalClosedLost) > 0
        ? Math.round((state.metrics.totalClosedWon / (state.metrics.totalClosedWon + state.metrics.totalClosedLost)) * 100)
        : 0,
      totalRevenue: state.metrics.totalRevenue,
      avgDealSize: state.metrics.totalClosedWon > 0
        ? Math.round(state.metrics.totalRevenue / state.metrics.totalClosedWon)
        : 0,
      bySource: state.metrics.bySource,
    };
  }

  /**
   * Find stalled deals (no activity in the last N days).
   * @param {number} [staleDays=7] — days without activity to consider stalled
   * @returns {object[]}
   */
  findStalledDeals(staleDays = 7) {
    const state = this.getSalesState();
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - staleDays);

    return state.pipeline.filter(deal => {
      if (deal.stage === PIPELINE_STAGE.CLOSED_WON ||
          deal.stage === PIPELINE_STAGE.CLOSED_LOST ||
          deal.stage === PIPELINE_STAGE.DISQUALIFIED) {
        return false;
      }
      return new Date(deal.updatedAt) < threshold;
    });
  }

  // ─── Team & Workload ──────────────────────────────────────

  /**
   * Get the current workload distribution across the sales team.
   * @returns {Record<string, object>}
   */
  getTeamWorkload() {
    return this.getSalesState().teamWorkload;
  }

  // ─── Reporting ─────────────────────────────────────────────

  /**
   * Generate the daily pipeline report.
   * @returns {Promise<string>}
   */
  async generateDailyReport() {
    const summary = this.getPipelineSummary();
    const forecast = this.getForecast();
    const stalled = this.findStalledDeals();
    const state = this.getSalesState();

    const report = await this.generateReport('daily-pipeline-report', {
      pipeline: summary,
      forecast,
      stalledDeals: stalled.map(d => ({
        id: d.id,
        name: d.prospectName,
        stage: d.stage,
        value: d.estimatedValue,
        lastActivity: d.updatedAt,
      })),
      teamWorkload: state.teamWorkload,
      recentWins: state.closedDeals.slice(-5),
      recentLosses: state.lostDeals.slice(-5),
    });

    this.sendReportToNikita('daily-pipeline-report', report);

    // Send revenue forecast to CFO
    messageBus.send({
      from: AGENT_ID,
      to: 'cfo',
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.LOW,
      payload: {
        reportType: 'revenue-forecast',
        forecast,
        totalRevenue: state.metrics.totalRevenue,
        pipelineValue: summary.totalPipelineValue,
      },
    });

    return report;
  }

  /**
   * Process a message with sales context.
   * @param {object} message
   * @returns {Promise<object>}
   */
  async processMessage(message) {
    const summary = this.getPipelineSummary();
    const forecast = this.getForecast();

    const contextParts = [
      `Active deals: ${summary.totalDeals}`,
      `Pipeline value: ${summary.totalPipelineValue}`,
      `Win rate: ${summary.winRate}%`,
      `Total revenue closed: ${summary.totalRevenue}`,
      `Forecast — committed: ${forecast.committed}, best case: ${forecast.bestCase}`,
    ];

    return super.processMessage(message, contextParts.join('\n'));
  }
}

const salesLeadBrain = new SalesLeadBrain();

export { salesLeadBrain, PIPELINE_STAGE, LEAD_SOURCE, SALES_BOTS };
