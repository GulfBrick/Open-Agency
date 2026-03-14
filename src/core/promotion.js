/**
 * Promotion Engine
 *
 * Evaluates agents for promotion based on performance metrics.
 * Promotions follow the rank ladder: Junior → Mid → Senior → Lead → Head of [Department]
 * Nikita reviews, Harry approves.
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { experience } from './experience.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from './message-bus.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(PROJECT_ROOT, 'data', 'agent-experience');

/**
 * Rank ladder — each role progresses through these tiers.
 * The final rank replaces the role name with "Head of [Department]".
 */
const RANKS = ['Junior', 'Mid', 'Senior', 'Lead', 'Head'];

/** Minimum tasks completed to be eligible for the next rank */
const TASK_THRESHOLDS = {
  Junior: 10,   // Junior → Mid requires 10 tasks
  Mid: 30,      // Mid → Senior requires 30 tasks
  Senior: 75,   // Senior → Lead requires 75 tasks
  Lead: 150,    // Lead → Head requires 150 tasks
};

/** Minimum success rate to be eligible for the next rank */
const SUCCESS_THRESHOLDS = {
  Junior: 70,   // Junior → Mid: 70%
  Mid: 80,      // Mid → Senior: 80%
  Senior: 85,   // Senior → Lead: 85%
  Lead: 90,     // Lead → Head: 90%
};

/** Maximum escalation rate allowed (applies to all promotions) */
const MAX_ESCALATION_RATE = 20;

class PromotionEngine {
  constructor() {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  /**
   * Path to an agent's promotions history file.
   * @param {string} agentId
   * @returns {string}
   */
  _promotionsPath(agentId) {
    const dir = join(DATA_DIR, agentId);
    mkdirSync(dir, { recursive: true });
    return join(dir, 'promotions.jsonl');
  }

  /**
   * Read an agent's profile to get their current rank.
   * @param {string} agentId
   * @returns {object|null}
   */
  _readProfile(agentId) {
    const profilePath = join(DATA_DIR, agentId, 'profile.json');
    if (!existsSync(profilePath)) return null;
    try {
      return JSON.parse(readFileSync(profilePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Extract the rank tier (Junior, Mid, Senior, Lead, Head) from a full rank string.
   * e.g. "Junior CFO" → "Junior", "Head of Finance" → "Head"
   * @param {string} rankString
   * @returns {string}
   */
  _extractRankTier(rankString) {
    if (rankString.startsWith('Head of')) return 'Head';
    for (const rank of RANKS) {
      if (rankString.startsWith(rank)) return rank;
    }
    return 'Junior';
  }

  /**
   * Build the full rank title for a given tier and role.
   * @param {string} tier — Junior, Mid, Senior, Lead, Head
   * @param {string} role — e.g. "CFO", "Developer"
   * @param {string} department — e.g. "Finance", "Engineering"
   * @returns {string}
   */
  _buildRankTitle(tier, role, department) {
    if (tier === 'Head') return `Head of ${department}`;
    return `${tier} ${role}`;
  }

  /**
   * Get the next rank tier in the ladder.
   * @param {string} currentTier
   * @returns {string|null} — null if already at Head
   */
  _nextRankTier(currentTier) {
    const idx = RANKS.indexOf(currentTier);
    if (idx === -1 || idx >= RANKS.length - 1) return null;
    return RANKS[idx + 1];
  }

  /**
   * Check how many unique skills an agent has acquired since their last promotion.
   * @param {string} agentId
   * @returns {number}
   */
  _newSkillsSinceLastPromotion(agentId) {
    const stats = experience.getStats(agentId);
    const currentSkills = Object.keys(stats.skillBreakdown);
    const promotions = this.getPromotionHistory(agentId);

    if (promotions.length === 0) {
      // Never promoted — all skills count as new
      return currentSkills.length;
    }

    const lastPromotion = promotions[promotions.length - 1];
    const previousSkills = lastPromotion.skillsAtPromotion || [];
    return currentSkills.filter(s => !previousSkills.includes(s)).length;
  }

  /**
   * Evaluate whether an agent is eligible for promotion.
   * @param {string} agentId
   * @returns {{ eligible: boolean, reason: string, currentRank: string, nextRank: string|null, stats: object }}
   */
  evaluateAgent(agentId) {
    const profile = this._readProfile(agentId);
    if (!profile) {
      return { eligible: false, reason: 'No agent profile found', currentRank: 'Unknown', nextRank: null, stats: {} };
    }

    const currentRank = profile.rank || `Junior ${profile.role}`;
    const currentTier = this._extractRankTier(currentRank);
    const nextTier = this._nextRankTier(currentTier);

    if (!nextTier) {
      return { eligible: false, reason: 'Already at maximum rank', currentRank, nextRank: null, stats: {} };
    }

    const nextRank = this._buildRankTitle(nextTier, profile.role, profile.department);
    const stats = experience.getStats(agentId);
    const reasons = [];

    // Check minimum tasks
    const requiredTasks = TASK_THRESHOLDS[currentTier];
    if (stats.totalTasks < requiredTasks) {
      reasons.push(`Needs ${requiredTasks} tasks (has ${stats.totalTasks})`);
    }

    // Check success rate
    const requiredRate = SUCCESS_THRESHOLDS[currentTier];
    if (stats.successRate < requiredRate) {
      reasons.push(`Needs ${requiredRate}% success rate (has ${stats.successRate}%)`);
    }

    // Check escalation rate
    if (stats.escalationRate > MAX_ESCALATION_RATE) {
      reasons.push(`Escalation rate too high: ${stats.escalationRate}% (max ${MAX_ESCALATION_RATE}%)`);
    }

    // Check new skills since last promotion
    const newSkills = this._newSkillsSinceLastPromotion(agentId);
    if (newSkills < 1) {
      reasons.push('No new skills acquired since last promotion');
    }

    const eligible = reasons.length === 0;

    return {
      eligible,
      reason: eligible ? 'Meets all promotion criteria' : reasons.join('; '),
      currentRank,
      nextRank,
      stats,
    };
  }

  /**
   * Execute a promotion. Writes to promotions.jsonl and updates the profile.
   * @param {string} agentId
   * @param {string} approvedBy — who approved (e.g. "harry")
   * @returns {object} The promotion record
   */
  promoteAgent(agentId, approvedBy) {
    const evaluation = this.evaluateAgent(agentId);
    if (!evaluation.eligible) {
      throw new Error(`Agent ${agentId} is not eligible for promotion: ${evaluation.reason}`);
    }

    const stats = experience.getStats(agentId);

    const record = {
      agentId,
      previousRank: evaluation.currentRank,
      newRank: evaluation.nextRank,
      promotedAt: new Date().toISOString(),
      promotedBy: 'nikita',
      approvedBy,
      reason: evaluation.reason,
      tasksCompleted: stats.totalTasks,
      successRate: stats.successRate,
      skillsAtPromotion: Object.keys(stats.skillBreakdown),
    };

    // Append to promotions history
    appendFileSync(this._promotionsPath(agentId), JSON.stringify(record) + '\n');

    // Update the agent's profile with the new rank
    const profilePath = join(DATA_DIR, agentId, 'profile.json');
    if (existsSync(profilePath)) {
      const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
      profile.rank = evaluation.nextRank;
      writeFileSync(profilePath, JSON.stringify(profile, null, 2));
    }

    logger.log('nikita', 'AGENT_PROMOTED', {
      agentId,
      from: record.previousRank,
      to: record.newRank,
      approvedBy,
    });

    return record;
  }

  /**
   * Get an agent's full promotion history.
   * @param {string} agentId
   * @returns {object[]}
   */
  getPromotionHistory(agentId) {
    const filePath = this._promotionsPath(agentId);
    if (!existsSync(filePath)) return [];

    try {
      const content = readFileSync(filePath, 'utf-8').trim();
      if (!content) return [];
      return content.split('\n').map(line => JSON.parse(line));
    } catch (err) {
      logger.log('system', 'PROMOTION_READ_ERROR', { agentId, error: err.message });
      return [];
    }
  }

  /**
   * Find all agents currently eligible for promotion.
   * Scans every agent directory with a profile.
   * @returns {{ agentId: string, currentRank: string, nextRank: string, reason: string, stats: object }[]}
   */
  getPendingPromotions() {
    if (!existsSync(DATA_DIR)) return [];

    const agentDirs = readdirSync(DATA_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const pending = [];
    for (const agentId of agentDirs) {
      const evaluation = this.evaluateAgent(agentId);
      if (evaluation.eligible) {
        pending.push({
          agentId,
          currentRank: evaluation.currentRank,
          nextRank: evaluation.nextRank,
          reason: evaluation.reason,
          stats: evaluation.stats,
        });
      }
    }

    return pending;
  }

  /**
   * Fire an ESCALATION message when an agent becomes promotion-eligible.
   * Nikita reviews → Harry approves.
   * @param {string} agentId
   */
  notifyPromotionEligible(agentId) {
    const evaluation = this.evaluateAgent(agentId);
    if (!evaluation.eligible) return;

    messageBus.send({
      from: 'system',
      to: 'nikita',
      type: MESSAGE_TYPES.ESCALATION,
      priority: PRIORITY.MEDIUM,
      payload: {
        event: 'PROMOTION_ELIGIBLE',
        agentId,
        currentRank: evaluation.currentRank,
        nextRank: evaluation.nextRank,
        stats: evaluation.stats,
      },
    });

    logger.log('system', 'PROMOTION_NOTIFICATION_SENT', { agentId, nextRank: evaluation.nextRank });
  }
}

const promotion = new PromotionEngine();

export { promotion, RANKS, TASK_THRESHOLDS, SUCCESS_THRESHOLDS, MAX_ESCALATION_RATE };
