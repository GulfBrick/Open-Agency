/**
 * Finn — Video Editor Brain — "The Frame"
 *
 * Extends AgentBrain with video production capabilities.
 * Creates video scripts, editing plans, captions, thumbnails,
 * and platform-specific video strategy.
 *
 * Client brand context injected at runtime via the Brand Vault.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../../core/message-bus.js';
import { brandVault } from '../../core/brand-vault.js';

const AGENT_ID = 'video-editor';
const AGENT_DIR = 'creative/video';
const MODEL = 'claude-sonnet-4-5-20250929';

const ESCALATION_TRIGGERS = [
  'brand voice', 'off-brand', 'brand inconsistency',
  'music licensing', 'copyright', 'rights',
  'sensitive content', 'controversial', 'offensive',
  'cross-platform format', 'platform conflict',
];

/** Platform video specs for reference */
const PLATFORM_SPECS = {
  'youtube': { aspectRatio: '16:9', maxDuration: '12 hours', recommended: '8-12 min' },
  'youtube-shorts': { aspectRatio: '9:16', maxDuration: '60s', recommended: '30-60s' },
  'tiktok': { aspectRatio: '9:16', maxDuration: '10 min', recommended: '15-60s' },
  'instagram-reels': { aspectRatio: '9:16', maxDuration: '90s', recommended: '15-30s' },
  'instagram-feed': { aspectRatio: '1:1 or 4:5', maxDuration: '60s', recommended: '15-30s' },
  'linkedin': { aspectRatio: '16:9 or 1:1', maxDuration: '10 min', recommended: '30-90s' },
};

class VideoBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      model: MODEL,
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initVideoState();
  }

  _initVideoState() {
    if (!memory.has('video-editor:state')) {
      memory.set('video-editor:state', {
        scripts: [],
        editingPlans: [],
        captions: [],
        thumbnails: [],
      });
    }
  }

  getVideoState() {
    return memory.get('video-editor:state');
  }

  /**
   * Create a full video script with scene descriptions.
   * @param {string} clientId
   * @param {{ objective: string, audience: string, tone: string, platform: string, duration?: string }} brief
   * @returns {object} The script record
   */
  createVideoScript(clientId, brief) {
    const brand = brandVault.getBrand(clientId);
    const state = this.getVideoState();
    const specs = PLATFORM_SPECS[brief.platform] || {};

    const script = {
      id: `SCRIPT-${Date.now()}`,
      clientId,
      objective: brief.objective,
      audience: brief.audience,
      tone: brief.tone || (brand ? brand.tone : null),
      platform: brief.platform,
      targetDuration: brief.duration || specs.recommended || null,
      aspectRatio: specs.aspectRatio || null,
      brandVoice: brand ? brand.voice : null,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };

    state.scripts.push(script);
    memory.set('video-editor:state', state);

    logger.log(AGENT_ID, 'SCRIPT_CREATED', {
      scriptId: script.id,
      clientId,
      platform: brief.platform,
    });

    return script;
  }

  /**
   * Create an editing plan with shot list and pacing guide.
   * @param {{ id: string, scenes?: object[] }} script — the video script
   * @param {string} duration — target duration
   * @param {string} platform — target platform
   * @returns {object} The editing plan
   */
  editingPlan(script, duration, platform) {
    const state = this.getVideoState();
    const specs = PLATFORM_SPECS[platform] || {};

    const plan = {
      id: `EDIT-${Date.now()}`,
      scriptId: script.id,
      duration,
      platform,
      aspectRatio: specs.aspectRatio || null,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };

    state.editingPlans.push(plan);
    memory.set('video-editor:state', state);

    logger.log(AGENT_ID, 'EDITING_PLAN_CREATED', {
      planId: plan.id,
      scriptId: script.id,
      platform,
    });

    return plan;
  }

  /**
   * Generate caption/subtitle text for a video.
   * @param {{ title: string, content: string, platform: string }} videoContent
   * @returns {object} The caption record
   */
  captionScript(videoContent) {
    const state = this.getVideoState();

    const caption = {
      id: `CAPTION-${Date.now()}`,
      videoTitle: videoContent.title,
      platform: videoContent.platform,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };

    state.captions.push(caption);
    memory.set('video-editor:state', state);

    logger.log(AGENT_ID, 'CAPTION_CREATED', {
      captionId: caption.id,
      videoTitle: videoContent.title,
    });

    return caption;
  }

  /**
   * Create a thumbnail concept for a video.
   * @param {string} videoTitle
   * @param {{ colors?: object, typography?: object }} brand
   * @returns {object} The thumbnail concept
   */
  thumbnailConcept(videoTitle, brand) {
    const state = this.getVideoState();

    const thumbnail = {
      id: `THUMB-${Date.now()}`,
      videoTitle,
      brandColors: brand.colors || {},
      brandTypography: brand.typography || {},
      status: 'concept',
      createdAt: new Date().toISOString(),
    };

    state.thumbnails.push(thumbnail);
    memory.set('video-editor:state', state);

    logger.log(AGENT_ID, 'THUMBNAIL_CONCEPT_CREATED', {
      thumbnailId: thumbnail.id,
      videoTitle,
    });

    return thumbnail;
  }

  /**
   * Develop a platform-specific video content strategy.
   * @param {string} clientId
   * @param {{ awareness?: boolean, engagement?: boolean, conversion?: boolean, education?: boolean }} goals
   * @returns {object} The strategy record
   */
  videoStrategy(clientId, goals) {
    const brand = brandVault.getBrand(clientId);

    const strategy = {
      id: `VSTRAT-${Date.now()}`,
      clientId,
      goals,
      brandVoice: brand ? brand.voice : null,
      platformSpecs: PLATFORM_SPECS,
      createdAt: new Date().toISOString(),
    };

    logger.log(AGENT_ID, 'VIDEO_STRATEGY_CREATED', { strategyId: strategy.id, clientId });

    return strategy;
  }

  async processMessage(message) {
    const state = this.getVideoState();
    const additionalContext = [
      `Scripts created: ${state.scripts.length}`,
      `Editing plans: ${state.editingPlans.length}`,
      `Captions generated: ${state.captions.length}`,
      `Thumbnails designed: ${state.thumbnails.length}`,
    ].join('\n');

    return super.processMessage(message, additionalContext);
  }
}

const videoBrain = new VideoBrain();

export { videoBrain, PLATFORM_SPECS };
