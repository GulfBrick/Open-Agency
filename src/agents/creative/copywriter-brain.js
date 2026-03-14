/**
 * Ash — Copywriter Brain — "The Word"
 *
 * Extends AgentBrain with copywriting capabilities.
 * Writes headlines, long-form copy, CTAs, email sequences,
 * and ad copy. Reviews copy against briefs and brand voice.
 *
 * Client brand context injected at runtime via the Brand Vault.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../../core/message-bus.js';
import { brandVault } from '../../core/brand-vault.js';

const AGENT_ID = 'copywriter';
const AGENT_DIR = 'creative/copywriter';
const MODEL = 'claude-sonnet-4-5-20250929';

const ESCALATION_TRIGGERS = [
  'brand voice', 'off-brand', 'tone mismatch',
  'legal claim', 'compliance', 'financial promise',
  'guarantee', 'warranty', 'disclaimer',
  'sensitive', 'controversial', 'political',
  'competitor mention', 'defamation',
];

/** Copy format types */
const COPY_FORMATS = {
  AD: 'ad',
  EMAIL: 'email',
  LANDING_PAGE: 'landing-page',
  SOCIAL: 'social',
  BLOG: 'blog',
  PRESENTATION: 'presentation',
  VIDEO_SCRIPT: 'video-script',
  HEADLINE: 'headline',
};

class CopywriterBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      model: MODEL,
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initCopyState();
  }

  _initCopyState() {
    if (!memory.has('copywriter:state')) {
      memory.set('copywriter:state', {
        headlines: [],
        copyPieces: [],
        ctas: [],
        emailSequences: [],
        adCopy: [],
        reviews: [],
      });
    }
  }

  getCopyState() {
    return memory.get('copywriter:state');
  }

  /**
   * Generate headline variants.
   * @param {{ objective: string, audience: string, tone: string, keywords?: string[] }} brief
   * @param {number} [count=3] — number of variants to generate
   * @returns {object} The headline record
   */
  writeHeadline(brief, count = 3) {
    const state = this.getCopyState();

    const record = {
      id: `HEADLINE-${Date.now()}`,
      brief: brief.objective,
      audience: brief.audience,
      tone: brief.tone,
      keywords: brief.keywords || [],
      variantCount: count,
      createdAt: new Date().toISOString(),
    };

    state.headlines.push(record);
    memory.set('copywriter:state', state);

    logger.log(AGENT_ID, 'HEADLINES_WRITTEN', {
      recordId: record.id,
      variantCount: count,
    });

    return record;
  }

  /**
   * Write copy for any format.
   * @param {string} clientId
   * @param {{ objective: string, audience: string, tone: string }} brief
   * @param {string} format — one of COPY_FORMATS values
   * @param {number} [wordCount] — target word count
   * @returns {object} The copy record
   */
  writeCopy(clientId, brief, format, wordCount) {
    const brand = brandVault.getBrand(clientId);
    const voiceGuidelines = brandVault.getVoiceGuidelines(clientId);
    const state = this.getCopyState();

    const record = {
      id: `COPY-${Date.now()}`,
      clientId,
      format,
      objective: brief.objective,
      audience: brief.audience,
      tone: brief.tone || (brand ? brand.tone : null),
      brandVoice: voiceGuidelines.voice,
      doNots: voiceGuidelines.doNots,
      wordCount: wordCount || null,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };

    state.copyPieces.push(record);
    memory.set('copywriter:state', state);

    logger.log(AGENT_ID, 'COPY_WRITTEN', {
      copyId: record.id,
      clientId,
      format,
      wordCount,
    });

    return record;
  }

  /**
   * Write call-to-action variants.
   * @param {string} objective — what the CTA should drive (signup, purchase, download, etc.)
   * @param {string} audience
   * @param {string} platform — where the CTA will appear
   * @returns {object} The CTA record
   */
  writeCTA(objective, audience, platform) {
    const state = this.getCopyState();

    const record = {
      id: `CTA-${Date.now()}`,
      objective,
      audience,
      platform,
      createdAt: new Date().toISOString(),
    };

    state.ctas.push(record);
    memory.set('copywriter:state', state);

    logger.log(AGENT_ID, 'CTA_WRITTEN', { ctaId: record.id, objective, platform });

    return record;
  }

  /**
   * Review copy against a brief and brand voice.
   * @param {{ text: string, format: string }} copy
   * @param {{ objective: string, audience: string }} brief
   * @param {{ voice?: string, tone?: string, doNots?: string[] }} brand
   * @returns {{ onBrief: boolean, onBrand: boolean, issues: string[] }}
   */
  reviewCopy(copy, brief, brand) {
    const state = this.getCopyState();
    const issues = [];

    // Check for brand doNots
    if (brand.doNots) {
      for (const doNot of brand.doNots) {
        if (copy.text.toLowerCase().includes(doNot.toLowerCase())) {
          issues.push(`Copy contains brand "do not": "${doNot}"`);
        }
      }
    }

    const review = {
      id: `COPYREVIEW-${Date.now()}`,
      format: copy.format,
      issueCount: issues.length,
      onBrand: issues.length === 0,
      reviewedAt: new Date().toISOString(),
    };

    state.reviews.push(review);
    memory.set('copywriter:state', state);

    logger.log(AGENT_ID, 'COPY_REVIEWED', {
      reviewId: review.id,
      onBrand: review.onBrand,
      issueCount: issues.length,
    });

    return { onBrief: true, onBrand: review.onBrand, issues };
  }

  /**
   * Write a multi-email nurture sequence.
   * @param {string} clientId
   * @param {string} goal — 'onboarding', 'nurture', 'reactivation', 'upsell', 'launch'
   * @param {number} steps — number of emails in the sequence
   * @returns {object} The sequence record
   */
  writeEmailSequence(clientId, goal, steps) {
    const brand = brandVault.getBrand(clientId);
    const state = this.getCopyState();

    const record = {
      id: `EMAILSEQ-${Date.now()}`,
      clientId,
      goal,
      steps,
      brandVoice: brand ? brand.voice : null,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };

    state.emailSequences.push(record);
    memory.set('copywriter:state', state);

    logger.log(AGENT_ID, 'EMAIL_SEQUENCE_WRITTEN', {
      sequenceId: record.id,
      clientId,
      goal,
      steps,
    });

    return record;
  }

  /**
   * Write platform-specific ad copy.
   * @param {string} clientId
   * @param {string} platform — 'google', 'meta', 'linkedin', 'tiktok'
   * @param {{ objective: string, audience: string, offer?: string }} brief
   * @returns {object} The ad copy record
   */
  writeAdCopy(clientId, platform, brief) {
    const brand = brandVault.getBrand(clientId);
    const state = this.getCopyState();

    const record = {
      id: `ADCOPY-${Date.now()}`,
      clientId,
      platform,
      objective: brief.objective,
      audience: brief.audience,
      offer: brief.offer || null,
      brandVoice: brand ? brand.voice : null,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };

    state.adCopy.push(record);
    memory.set('copywriter:state', state);

    logger.log(AGENT_ID, 'AD_COPY_WRITTEN', {
      adCopyId: record.id,
      clientId,
      platform,
    });

    return record;
  }

  async processMessage(message) {
    const state = this.getCopyState();
    const additionalContext = [
      `Headlines written: ${state.headlines.length}`,
      `Copy pieces: ${state.copyPieces.length}`,
      `CTAs created: ${state.ctas.length}`,
      `Email sequences: ${state.emailSequences.length}`,
      `Ad copy: ${state.adCopy.length}`,
      `Reviews completed: ${state.reviews.length}`,
    ].join('\n');

    return super.processMessage(message, additionalContext);
  }
}

const copywriterBrain = new CopywriterBrain();

export { copywriterBrain, COPY_FORMATS };
