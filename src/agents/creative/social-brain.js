/**
 * Jade — Social Media Manager Brain — "The Feed"
 *
 * Extends AgentBrain with social media management capabilities.
 * Creates platform-native posts, manages content calendars,
 * analyses engagement, monitors trends, and handles community response.
 *
 * Client brand context injected at runtime via the Brand Vault.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../../core/message-bus.js';
import { brandVault } from '../../core/brand-vault.js';
import { contentCalendar } from '../../core/content-calendar.js';

const AGENT_ID = 'social-media';
const AGENT_DIR = 'creative/social';
const MODEL = 'claude-sonnet-4-5-20250929';

const ESCALATION_TRIGGERS = [
  'brand voice', 'off-brand', 'tone mismatch',
  'controversial', 'sensitive', 'political',
  'negative viral', 'pr crisis', 'public complaint',
  'community crisis', 'backlash',
  'influencer', 'partnership', 'sponsored',
];

/** Supported social platforms */
const PLATFORMS = ['linkedin', 'instagram', 'twitter', 'tiktok', 'facebook'];

class SocialBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      model: MODEL,
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initSocialState();
  }

  _initSocialState() {
    if (!memory.has('social-media:state')) {
      memory.set('social-media:state', {
        postsWritten: [],
        engagementMetrics: {},
        trends: [],
        communityResponses: [],
      });
    }
  }

  getSocialState() {
    return memory.get('social-media:state');
  }

  /**
   * Write a platform-native social media post.
   * @param {string} clientId
   * @param {string} platform — 'linkedin', 'instagram', 'twitter', 'tiktok', 'facebook'
   * @param {{ topic: string, objective: string, cta?: string }} brief
   * @param {object} [brand] — override brand; otherwise loaded from vault
   * @returns {object} The post record
   */
  writePost(clientId, platform, brief, brand) {
    const brandData = brand || brandVault.getBrand(clientId);
    const state = this.getSocialState();

    const post = {
      id: `SOCIAL-${Date.now()}`,
      clientId,
      platform,
      topic: brief.topic,
      objective: brief.objective,
      cta: brief.cta || null,
      brandVoice: brandData ? brandData.voice : null,
      brandTone: brandData ? brandData.tone : null,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };

    state.postsWritten.push(post);
    memory.set('social-media:state', state);

    // Add to content calendar
    contentCalendar.addPost(clientId, {
      platform,
      postType: 'social-post',
      content: `[${platform}] ${brief.topic}`,
      createdBy: AGENT_ID,
    });

    logger.log(AGENT_ID, 'POST_WRITTEN', {
      postId: post.id,
      clientId,
      platform,
      topic: brief.topic,
    });

    return post;
  }

  /**
   * Create a full content calendar for a time period.
   * @param {string} clientId
   * @param {{ startDate: string, endDate: string }} period
   * @param {string[]} themes — content themes for the period
   * @returns {object} The calendar summary
   */
  createContentCalendar(clientId, period, themes) {
    const calendar = {
      id: `CAL-${Date.now()}`,
      clientId,
      startDate: period.startDate,
      endDate: period.endDate,
      themes,
      platforms: PLATFORMS,
      createdAt: new Date().toISOString(),
    };

    logger.log(AGENT_ID, 'CONTENT_CALENDAR_CREATED', {
      calendarId: calendar.id,
      clientId,
      themeCount: themes.length,
    });

    return calendar;
  }

  /**
   * Analyse engagement metrics and provide recommendations.
   * @param {string} clientId
   * @param {{ impressions: number, clicks: number, comments: number, shares: number, saves: number, followers: number }} metrics
   * @returns {object} Analysis results
   */
  analyzeEngagement(clientId, metrics) {
    const state = this.getSocialState();

    const engagementRate = metrics.followers > 0
      ? +(((metrics.comments + metrics.shares + metrics.saves) / metrics.followers) * 100).toFixed(2)
      : 0;

    const ctr = metrics.impressions > 0
      ? +((metrics.clicks / metrics.impressions) * 100).toFixed(2)
      : 0;

    const analysis = {
      clientId,
      engagementRate,
      ctr,
      metrics,
      analyzedAt: new Date().toISOString(),
    };

    state.engagementMetrics[clientId] = analysis;
    memory.set('social-media:state', state);

    logger.log(AGENT_ID, 'ENGAGEMENT_ANALYZED', {
      clientId,
      engagementRate,
      ctr,
    });

    // Alert if engagement drops significantly
    if (engagementRate < 1.0) {
      messageBus.send({
        from: AGENT_ID,
        to: 'creative-director',
        type: MESSAGE_TYPES.ALERT,
        priority: PRIORITY.MEDIUM,
        payload: {
          event: 'LOW_ENGAGEMENT',
          clientId,
          engagementRate,
          recommendation: 'Review content strategy and posting times',
        },
      });
    }

    return analysis;
  }

  /**
   * Generate a trend report for an industry.
   * @param {string} industry
   * @returns {object} The trend report
   */
  trendReport(industry) {
    const state = this.getSocialState();

    const report = {
      id: `TREND-${Date.now()}`,
      industry,
      platforms: PLATFORMS,
      createdAt: new Date().toISOString(),
    };

    state.trends.push(report);
    memory.set('social-media:state', state);

    logger.log(AGENT_ID, 'TREND_REPORT_CREATED', { reportId: report.id, industry });

    return report;
  }

  /**
   * Generate a response to a community comment.
   * @param {string} comment — the comment to respond to
   * @param {{ voice?: string, tone?: string }} brand
   * @param {{ platform: string, sentiment: string, clientId: string }} context
   * @returns {object} The response record
   */
  communityResponse(comment, brand, context) {
    const state = this.getSocialState();

    const response = {
      id: `RESP-${Date.now()}`,
      comment: comment.slice(0, 200),
      platform: context.platform,
      sentiment: context.sentiment,
      clientId: context.clientId,
      brandVoice: brand.voice || null,
      createdAt: new Date().toISOString(),
    };

    state.communityResponses.push(response);
    memory.set('social-media:state', state);

    logger.log(AGENT_ID, 'COMMUNITY_RESPONSE_CREATED', {
      responseId: response.id,
      platform: context.platform,
      sentiment: context.sentiment,
    });

    // Escalate negative sentiment to Creative Director
    if (context.sentiment === 'negative' || context.sentiment === 'hostile') {
      messageBus.send({
        from: AGENT_ID,
        to: 'creative-director',
        type: MESSAGE_TYPES.ESCALATION,
        priority: PRIORITY.HIGH,
        payload: {
          event: 'NEGATIVE_COMMUNITY_FEEDBACK',
          comment: comment.slice(0, 200),
          platform: context.platform,
          clientId: context.clientId,
        },
      });
    }

    return response;
  }

  /**
   * Generate hashtag recommendations for a platform and niche.
   * @param {string} clientId
   * @param {string} platform
   * @param {string} niche
   * @returns {object} Hashtag strategy
   */
  hashtagStrategy(clientId, platform, niche) {
    const strategy = {
      id: `HASH-${Date.now()}`,
      clientId,
      platform,
      niche,
      createdAt: new Date().toISOString(),
    };

    logger.log(AGENT_ID, 'HASHTAG_STRATEGY_CREATED', {
      strategyId: strategy.id,
      clientId,
      platform,
    });

    return strategy;
  }

  async processMessage(message) {
    const state = this.getSocialState();
    const additionalContext = [
      `Posts written: ${state.postsWritten.length}`,
      `Trends tracked: ${state.trends.length}`,
      `Community responses: ${state.communityResponses.length}`,
      `Clients with engagement data: ${Object.keys(state.engagementMetrics).length}`,
    ].join('\n');

    return super.processMessage(message, additionalContext);
  }
}

const socialBrain = new SocialBrain();

export { socialBrain, PLATFORMS };
