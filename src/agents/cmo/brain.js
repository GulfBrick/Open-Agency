/**
 * Priya — CMO Brain
 *
 * Extends the base AgentBrain with marketing domain logic.
 * Manages campaigns, content calendar, SEO, ads, and analytics.
 * Reports marketing performance to Nikita and spend to CFO.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../../core/message-bus.js';
import { taskQueue } from '../../core/task-queue.js';

const AGENT_ID = 'cmo';
const AGENT_DIR = 'cmo';

/** Marketing escalation triggers */
const ESCALATION_TRIGGERS = [
  'brand change', 'rebrand', 'brand guidelines',
  'campaign budget', 'ad spend', 'over budget',
  'partnership', 'sponsorship', 'collaboration',
  'negative press', 'pr crisis', 'public complaint',
  'controversial', 'sensitive topic',
  'reputation', 'legal', 'defamation',
  'competitor attack',
];

/** Campaign status values */
const CAMPAIGN_STATUS = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

class CmoBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initMarketingState();
  }

  /**
   * Initialise or load marketing state from memory.
   */
  _initMarketingState() {
    if (!memory.has('cmo:marketing')) {
      memory.set('cmo:marketing', {
        campaigns: [],
        contentCalendar: [],
        metrics: {
          totalSpend: 0,
          totalImpressions: 0,
          totalClicks: 0,
          totalConversions: 0,
          byChannel: {},
        },
        seo: {
          trackedKeywords: [],
          organicTraffic: 0,
        },
        brandGuidelines: {
          tone: null,
          targetAudience: null,
          channels: [],
        },
      });
    }
  }

  /**
   * Get current marketing state.
   * @returns {object}
   */
  getMarketingState() {
    return memory.get('cmo:marketing');
  }

  /**
   * Create a new campaign.
   * @param {string} name
   * @param {string} channel — 'google', 'meta', 'linkedin', 'organic', 'email'
   * @param {number} budget
   * @param {string} startDate — ISO date
   * @param {string} endDate — ISO date
   * @param {{ target?: string, kpis?: object }} [opts]
   * @returns {object} The created campaign
   */
  createCampaign(name, channel, budget, startDate, endDate, opts = {}) {
    const state = this.getMarketingState();
    const campaign = {
      id: `CAMP-${Date.now()}`,
      name,
      channel,
      budget,
      spent: 0,
      startDate,
      endDate,
      target: opts.target || null,
      kpis: opts.kpis || {},
      status: CAMPAIGN_STATUS.DRAFT,
      metrics: {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        cpc: 0,
        cpa: 0,
        roas: 0,
      },
      createdAt: new Date().toISOString(),
    };

    state.campaigns.push(campaign);
    memory.set('cmo:marketing', state);

    logger.log(AGENT_ID, 'CAMPAIGN_CREATED', { campaignId: campaign.id, name, channel, budget });

    return campaign;
  }

  /**
   * Update campaign metrics.
   * @param {string} campaignId
   * @param {{ impressions?: number, clicks?: number, conversions?: number, spent?: number }} metrics
   * @returns {object|null} Updated campaign
   */
  updateCampaignMetrics(campaignId, metrics) {
    const state = this.getMarketingState();
    const campaign = state.campaigns.find(c => c.id === campaignId);
    if (!campaign) return null;

    if (metrics.impressions) campaign.metrics.impressions += metrics.impressions;
    if (metrics.clicks) campaign.metrics.clicks += metrics.clicks;
    if (metrics.conversions) campaign.metrics.conversions += metrics.conversions;
    if (metrics.spent) {
      campaign.spent += metrics.spent;
      state.metrics.totalSpend += metrics.spent;
      state.metrics.byChannel[campaign.channel] =
        (state.metrics.byChannel[campaign.channel] || 0) + metrics.spent;
    }

    // Recalculate derived metrics
    if (campaign.metrics.clicks > 0) {
      campaign.metrics.cpc = +(campaign.spent / campaign.metrics.clicks).toFixed(2);
    }
    if (campaign.metrics.conversions > 0) {
      campaign.metrics.cpa = +(campaign.spent / campaign.metrics.conversions).toFixed(2);
    }

    // Update global metrics
    state.metrics.totalImpressions += metrics.impressions || 0;
    state.metrics.totalClicks += metrics.clicks || 0;
    state.metrics.totalConversions += metrics.conversions || 0;

    memory.set('cmo:marketing', state);

    // Alert if campaign is overspending
    if (campaign.spent > campaign.budget * 0.9) {
      messageBus.send({
        from: AGENT_ID,
        to: 'nikita',
        type: MESSAGE_TYPES.ALERT,
        priority: PRIORITY.HIGH,
        payload: {
          event: 'CAMPAIGN_NEAR_BUDGET',
          campaignId,
          campaignName: campaign.name,
          budget: campaign.budget,
          spent: campaign.spent,
          percentUsed: Math.round((campaign.spent / campaign.budget) * 100),
        },
      });
    }

    logger.log(AGENT_ID, 'CAMPAIGN_METRICS_UPDATED', { campaignId, metrics });

    return campaign;
  }

  /**
   * Update campaign status.
   * @param {string} campaignId
   * @param {string} status — DRAFT, ACTIVE, PAUSED, COMPLETED, CANCELLED
   * @returns {object|null}
   */
  setCampaignStatus(campaignId, status) {
    const state = this.getMarketingState();
    const campaign = state.campaigns.find(c => c.id === campaignId);
    if (!campaign) return null;

    campaign.status = status;
    campaign.updatedAt = new Date().toISOString();
    memory.set('cmo:marketing', state);

    logger.log(AGENT_ID, 'CAMPAIGN_STATUS_CHANGED', { campaignId, status });

    // Report spend to CFO when campaign completes
    if (status === CAMPAIGN_STATUS.COMPLETED) {
      messageBus.send({
        from: AGENT_ID,
        to: 'cfo',
        type: MESSAGE_TYPES.REPORT,
        priority: PRIORITY.MEDIUM,
        payload: {
          event: 'CAMPAIGN_COMPLETED',
          campaignId,
          campaignName: campaign.name,
          totalSpent: campaign.spent,
          channel: campaign.channel,
          metrics: campaign.metrics,
        },
      });
    }

    return campaign;
  }

  /**
   * Add content to the calendar.
   * @param {string} platform — 'instagram', 'linkedin', 'twitter', 'tiktok', 'blog', 'email'
   * @param {string} title
   * @param {string} scheduledDate — ISO date string
   * @param {string} contentType — 'post', 'story', 'reel', 'article', 'newsletter'
   * @param {string} [clientId]
   * @returns {object} The content entry
   */
  scheduleContent(platform, title, scheduledDate, contentType, clientId) {
    const state = this.getMarketingState();
    const entry = {
      id: `CONTENT-${Date.now()}`,
      platform,
      title,
      scheduledDate,
      contentType,
      clientId: clientId || null,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    };

    state.contentCalendar.push(entry);
    memory.set('cmo:marketing', state);

    logger.log(AGENT_ID, 'CONTENT_SCHEDULED', { contentId: entry.id, platform, scheduledDate });

    return entry;
  }

  /**
   * Track SEO keywords.
   * @param {string} keyword
   * @param {number} currentRank
   * @param {number} [previousRank]
   * @param {string} [clientId]
   */
  trackKeyword(keyword, currentRank, previousRank, clientId) {
    const state = this.getMarketingState();
    const existing = state.seo.trackedKeywords.find(k => k.keyword === keyword);

    if (existing) {
      existing.previousRank = existing.currentRank;
      existing.currentRank = currentRank;
      existing.updatedAt = new Date().toISOString();
    } else {
      state.seo.trackedKeywords.push({
        keyword,
        currentRank,
        previousRank: previousRank || null,
        clientId: clientId || null,
        trackedSince: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    memory.set('cmo:marketing', state);
    logger.log(AGENT_ID, 'KEYWORD_TRACKED', { keyword, currentRank });
  }

  /**
   * Get marketing performance summary.
   * @returns {object}
   */
  getPerformanceSummary() {
    const state = this.getMarketingState();
    const activeCampaigns = state.campaigns.filter(c => c.status === CAMPAIGN_STATUS.ACTIVE);
    const upcomingContent = state.contentCalendar.filter(c => {
      return c.status === 'scheduled' && new Date(c.scheduledDate) > new Date();
    });

    return {
      activeCampaigns: activeCampaigns.length,
      totalCampaigns: state.campaigns.length,
      totalSpend: state.metrics.totalSpend,
      totalImpressions: state.metrics.totalImpressions,
      totalClicks: state.metrics.totalClicks,
      totalConversions: state.metrics.totalConversions,
      overallCTR: state.metrics.totalImpressions > 0
        ? +((state.metrics.totalClicks / state.metrics.totalImpressions) * 100).toFixed(2)
        : 0,
      spendByChannel: state.metrics.byChannel,
      upcomingContent: upcomingContent.length,
      trackedKeywords: state.seo.trackedKeywords.length,
    };
  }

  /**
   * Generate the daily marketing report.
   * @returns {Promise<string>}
   */
  async generateDailyReport() {
    const summary = this.getPerformanceSummary();
    const state = this.getMarketingState();

    const report = await this.generateReport('daily-marketing-report', {
      performance: summary,
      activeCampaigns: state.campaigns
        .filter(c => c.status === CAMPAIGN_STATUS.ACTIVE)
        .map(c => ({
          name: c.name,
          channel: c.channel,
          spent: c.spent,
          budget: c.budget,
          metrics: c.metrics,
        })),
      topKeywords: state.seo.trackedKeywords.slice(0, 10),
    });

    this.sendReportToNikita('daily-marketing-report', report);

    // Report spend to CFO
    messageBus.send({
      from: AGENT_ID,
      to: 'cfo',
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.LOW,
      payload: {
        reportType: 'marketing-spend',
        totalSpend: state.metrics.totalSpend,
        byChannel: state.metrics.byChannel,
      },
    });

    return report;
  }

  /**
   * Process a message with marketing context.
   * @param {object} message
   * @returns {Promise<object>}
   */
  async processMessage(message) {
    const summary = this.getPerformanceSummary();

    const additionalContext = [
      `Active campaigns: ${summary.activeCampaigns}`,
      `Total spend: ${summary.totalSpend}`,
      `Total conversions: ${summary.totalConversions}`,
      `Overall CTR: ${summary.overallCTR}%`,
      `Upcoming content pieces: ${summary.upcomingContent}`,
    ].join('\n');

    return super.processMessage(message, additionalContext);
  }
}

const cmoBrain = new CmoBrain();

export { cmoBrain, CAMPAIGN_STATUS };
