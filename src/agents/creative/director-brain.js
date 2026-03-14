/**
 * Nova — Creative Director Brain — "The Eye"
 *
 * Extends AgentBrain with creative direction and brand management logic.
 * Writes briefs, reviews creative output, manages brand guidelines,
 * and coordinates the creative team (Iris, Finn, Jade, Ash).
 *
 * This is a GENERIC creative director — client brand context and
 * guidelines are injected at runtime via the Brand Vault.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../../core/message-bus.js';
import { taskQueue } from '../../core/task-queue.js';
import { brandVault } from '../../core/brand-vault.js';

const AGENT_ID = 'creative-director';
const AGENT_DIR = 'creative/director';
const MODEL = 'claude-sonnet-4-5-20250929';

/** Creative escalation triggers */
const ESCALATION_TRIGGERS = [
  'brand change', 'rebrand', 'logo change', 'identity change',
  'off-brand', 'brand violation', 'inconsistent',
  'legal', 'compliance', 'trademark', 'copyright',
  'controversial', 'sensitive', 'offensive',
  'client complaint', 'creative dispute',
  'reputation', 'public-facing risk',
];

/** Creative brief status values */
const BRIEF_STATUS = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  ARCHIVED: 'ARCHIVED',
};

/** Creative worker bot IDs */
const CREATIVE_BOTS = {
  'designer': { name: 'Iris', speciality: 'design', dir: 'creative/designer' },
  'video-editor': { name: 'Finn', speciality: 'video', dir: 'creative/video' },
  'social-media': { name: 'Jade', speciality: 'social', dir: 'creative/social' },
  'copywriter': { name: 'Ash', speciality: 'copy', dir: 'creative/copywriter' },
};

class CreativeDirectorBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      model: MODEL,
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initCreativeState();
  }

  // ─── State Management ───────────────────────────────────────

  /**
   * Initialise or load creative team state from memory.
   */
  _initCreativeState() {
    if (!memory.has('creative-director:state')) {
      memory.set('creative-director:state', {
        briefs: [],
        reviews: [],
        campaigns: [],
        teamWorkload: this._initWorkload(),
        qualityMetrics: {
          totalReviews: 0,
          approvedFirstPass: 0,
          revisionRequests: 0,
          averageRevisionCycles: 0,
        },
      });
    }
  }

  /**
   * Build initial workload tracking for all creative bots.
   * @returns {Record<string, { name: string, speciality: string, activeTasks: number, completedThisPeriod: number }>}
   */
  _initWorkload() {
    const workload = {};
    for (const [botId, bot] of Object.entries(CREATIVE_BOTS)) {
      workload[botId] = {
        name: bot.name,
        speciality: bot.speciality,
        activeTasks: 0,
        completedThisPeriod: 0,
      };
    }
    return workload;
  }

  /**
   * Get current creative state.
   * @returns {object}
   */
  getCreativeState() {
    return memory.get('creative-director:state');
  }

  // ─── Brief Management ──────────────────────────────────────

  /**
   * Create a creative brief from a campaign or project request.
   * @param {string} clientId
   * @param {{ name: string, objective: string, audience: string, tone?: string, deliverables: string[], deadline?: string }} project
   * @returns {object} The created brief
   */
  createBrief(clientId, project) {
    const state = this.getCreativeState();
    const brand = brandVault.getBrand(clientId);

    const brief = {
      id: `BRIEF-${Date.now()}`,
      clientId,
      name: project.name,
      objective: project.objective,
      audience: project.audience,
      tone: project.tone || (brand ? brand.tone : null),
      deliverables: project.deliverables,
      deadline: project.deadline || null,
      brandGuidelines: brand ? { colors: brand.colors, typography: brand.typography, voice: brand.voice } : null,
      status: BRIEF_STATUS.ACTIVE,
      assignedTo: [],
      createdAt: new Date().toISOString(),
    };

    state.briefs.push(brief);
    memory.set('creative-director:state', state);

    logger.log(AGENT_ID, 'BRIEF_CREATED', {
      briefId: brief.id,
      clientId,
      name: brief.name,
      deliverableCount: brief.deliverables.length,
    });

    return brief;
  }

  /**
   * Review a creative asset against the brief and brand guidelines.
   * Records the review and provides structured feedback.
   * @param {string} clientId
   * @param {{ assetId: string, type: string, description: string, createdBy: string }} asset
   * @param {{ approved: boolean, feedback: string, revisions?: string[] }} feedback
   * @returns {object} The review record
   */
  reviewCreative(clientId, asset, feedback) {
    const state = this.getCreativeState();

    const review = {
      id: `REVIEW-${Date.now()}`,
      clientId,
      assetId: asset.assetId,
      assetType: asset.type,
      createdBy: asset.createdBy,
      approved: feedback.approved,
      feedback: feedback.feedback,
      revisions: feedback.revisions || [],
      reviewedAt: new Date().toISOString(),
    };

    state.reviews.push(review);
    state.qualityMetrics.totalReviews++;

    if (feedback.approved) {
      state.qualityMetrics.approvedFirstPass++;
    } else {
      state.qualityMetrics.revisionRequests++;
    }

    // Update average revision cycles
    const total = state.qualityMetrics.totalReviews;
    const revisions = state.qualityMetrics.revisionRequests;
    state.qualityMetrics.averageRevisionCycles = total > 0
      ? +(revisions / total).toFixed(2)
      : 0;

    memory.set('creative-director:state', state);

    logger.log(AGENT_ID, 'CREATIVE_REVIEWED', {
      reviewId: review.id,
      assetId: asset.assetId,
      approved: feedback.approved,
      createdBy: asset.createdBy,
    });

    // If revisions needed, send feedback to the creator
    if (!feedback.approved && asset.createdBy) {
      messageBus.send({
        from: AGENT_ID,
        to: asset.createdBy,
        type: MESSAGE_TYPES.TASK,
        priority: PRIORITY.MEDIUM,
        payload: {
          event: 'REVISION_REQUESTED',
          reviewId: review.id,
          assetId: asset.assetId,
          feedback: feedback.feedback,
          revisions: feedback.revisions,
        },
      });
    }

    return review;
  }

  /**
   * Approve a campaign's creative and log the approval.
   * @param {string} clientId
   * @param {string} campaignId
   * @returns {object} The approval record
   */
  approveCampaign(clientId, campaignId) {
    const state = this.getCreativeState();

    const approval = {
      campaignId,
      clientId,
      approvedBy: AGENT_ID,
      approvedAt: new Date().toISOString(),
    };

    state.campaigns.push(approval);
    memory.set('creative-director:state', state);

    logger.log(AGENT_ID, 'CAMPAIGN_APPROVED', { campaignId, clientId });

    // Notify Priya (CMO) that creative is approved
    messageBus.send({
      from: AGENT_ID,
      to: 'cmo',
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.MEDIUM,
      payload: {
        event: 'CAMPAIGN_CREATIVE_APPROVED',
        campaignId,
        clientId,
        approvedAt: approval.approvedAt,
      },
    });

    return approval;
  }

  /**
   * Store or update brand guidelines for a client.
   * @param {string} clientId
   * @param {object} guidelines — brand data to store
   * @returns {object} The stored brand data
   */
  manageBrandGuidelines(clientId, guidelines) {
    const existing = brandVault.getBrand(clientId);

    if (existing) {
      return brandVault.updateBrand(clientId, guidelines);
    }

    return brandVault.setBrand(clientId, guidelines);
  }

  /**
   * Assign a creative task to a specific bot.
   * @param {{ title: string, description: string, type: string, priority: string, briefId?: string, clientId?: string }} task
   * @param {string} agentId — target creative bot ID
   * @returns {object} The created task
   */
  assignCreativeTask(task, agentId) {
    const state = this.getCreativeState();

    // Update workload tracking
    if (state.teamWorkload[agentId]) {
      state.teamWorkload[agentId].activeTasks++;
      memory.set('creative-director:state', state);
    }

    // Dispatch via task queue
    taskQueue.enqueue({
      assignedTo: agentId,
      createdBy: AGENT_ID,
      type: MESSAGE_TYPES.TASK,
      priority: task.priority || 'MEDIUM',
      description: `[${task.briefId || 'AD-HOC'}] ${task.title}: ${task.description}`,
    });

    logger.log(AGENT_ID, 'CREATIVE_TASK_ASSIGNED', {
      title: task.title,
      assignedTo: agentId,
      type: task.type,
      priority: task.priority,
    });

    return { ...task, assignedTo: agentId, assignedAt: new Date().toISOString() };
  }

  /**
   * Send creative performance summary to Priya (CMO).
   * @param {string} clientId
   * @returns {void}
   */
  reportToPriya(clientId) {
    const state = this.getCreativeState();
    const clientBriefs = state.briefs.filter(b => b.clientId === clientId);
    const clientReviews = state.reviews.filter(r => r.clientId === clientId);

    const report = {
      clientId,
      activeBriefs: clientBriefs.filter(b => b.status === BRIEF_STATUS.ACTIVE).length,
      totalReviews: clientReviews.length,
      approvalRate: clientReviews.length > 0
        ? Math.round((clientReviews.filter(r => r.approved).length / clientReviews.length) * 100)
        : 0,
      teamWorkload: state.teamWorkload,
      qualityMetrics: state.qualityMetrics,
    };

    messageBus.send({
      from: AGENT_ID,
      to: 'cmo',
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.LOW,
      payload: {
        reportType: 'creative-performance',
        ...report,
      },
    });

    logger.log(AGENT_ID, 'REPORT_SENT_TO_CMO', { clientId });
  }

  // ─── Reporting ──────────────────────────────────────────────

  /**
   * Generate the daily creative report.
   * @returns {Promise<string>}
   */
  async generateDailyReport() {
    const state = this.getCreativeState();
    const activeBriefs = state.briefs.filter(b => b.status === BRIEF_STATUS.ACTIVE);
    const recentReviews = state.reviews.slice(-10);

    const report = await this.generateReport('daily-creative-report', {
      activeBriefs: activeBriefs.length,
      recentReviews: recentReviews.map(r => ({
        assetType: r.assetType,
        approved: r.approved,
        createdBy: r.createdBy,
      })),
      teamWorkload: state.teamWorkload,
      qualityMetrics: state.qualityMetrics,
    });

    this.sendReportToNikita('daily-creative-report', report);

    // Also send to CMO
    messageBus.send({
      from: AGENT_ID,
      to: 'cmo',
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.LOW,
      payload: {
        reportType: 'daily-creative-report',
        content: report,
      },
    });

    return report;
  }

  /**
   * Process a message with creative team context.
   * @param {object} message
   * @returns {Promise<object>}
   */
  async processMessage(message) {
    const state = this.getCreativeState();
    const activeBriefs = state.briefs.filter(b => b.status === BRIEF_STATUS.ACTIVE);

    const additionalContext = [
      `Active briefs: ${activeBriefs.length}`,
      `Total reviews: ${state.qualityMetrics.totalReviews}`,
      `Approval rate: ${state.qualityMetrics.totalReviews > 0 ? Math.round((state.qualityMetrics.approvedFirstPass / state.qualityMetrics.totalReviews) * 100) : 0}%`,
      `Revision rate: ${state.qualityMetrics.averageRevisionCycles}`,
    ].join('\n');

    return super.processMessage(message, additionalContext);
  }
}

const creativeDirectorBrain = new CreativeDirectorBrain();

export { creativeDirectorBrain, BRIEF_STATUS, CREATIVE_BOTS };
