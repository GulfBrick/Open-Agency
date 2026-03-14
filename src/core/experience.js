/**
 * Agent Experience Tracker
 *
 * Tracks every task an agent completes — successes, failures, escalations.
 * Persists to data/agent-experience/[agentId]/task-history.jsonl
 * This is the foundation for the promotion system.
 */

import { readFileSync, appendFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(PROJECT_ROOT, 'data', 'agent-experience');

/** Valid task outcomes */
const OUTCOME = {
  SUCCESS: 'SUCCESS',
  FAIL: 'FAIL',
  ESCALATED: 'ESCALATED',
};

class ExperienceTracker {
  constructor() {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  /**
   * Ensure the agent's data directory exists.
   * @param {string} agentId
   * @returns {string} Path to the agent's experience directory
   */
  _agentDir(agentId) {
    const dir = join(DATA_DIR, agentId);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Path to an agent's task history file.
   * @param {string} agentId
   * @returns {string}
   */
  _historyPath(agentId) {
    return join(this._agentDir(agentId), 'task-history.jsonl');
  }

  /**
   * Record a completed task for an agent.
   * @param {string} agentId
   * @param {{ taskId: string, taskType: string, outcome: string, duration: number, skillsUsed: string[], clientId?: string, notes?: string }} taskData
   * @returns {object} The recorded entry
   */
  recordTask(agentId, taskData) {
    const entry = {
      taskId: taskData.taskId,
      agentId,
      taskType: taskData.taskType,
      outcome: taskData.outcome,
      duration: taskData.duration,
      skillsUsed: taskData.skillsUsed || [],
      clientId: taskData.clientId || null,
      timestamp: new Date().toISOString(),
      notes: taskData.notes || null,
    };

    const filePath = this._historyPath(agentId);
    appendFileSync(filePath, JSON.stringify(entry) + '\n');

    logger.log('system', 'EXPERIENCE_RECORDED', {
      agentId,
      taskId: entry.taskId,
      outcome: entry.outcome,
    });

    return entry;
  }

  /**
   * Get performance stats for an agent.
   * @param {string} agentId
   * @returns {{ totalTasks: number, successRate: number, avgDuration: number, escalationRate: number, skillBreakdown: Record<string, number> }}
   */
  getStats(agentId) {
    const history = this.getHistory(agentId);

    if (history.length === 0) {
      return {
        totalTasks: 0,
        successRate: 0,
        avgDuration: 0,
        escalationRate: 0,
        skillBreakdown: {},
      };
    }

    const successes = history.filter(t => t.outcome === OUTCOME.SUCCESS).length;
    const escalations = history.filter(t => t.outcome === OUTCOME.ESCALATED).length;
    const totalDuration = history.reduce((sum, t) => sum + (t.duration || 0), 0);

    // Count how many times each skill has been used
    const skillBreakdown = {};
    for (const task of history) {
      for (const skill of task.skillsUsed || []) {
        skillBreakdown[skill] = (skillBreakdown[skill] || 0) + 1;
      }
    }

    return {
      totalTasks: history.length,
      successRate: Math.round((successes / history.length) * 100),
      avgDuration: Math.round(totalDuration / history.length),
      escalationRate: Math.round((escalations / history.length) * 100),
      skillBreakdown,
    };
  }

  /**
   * Get recent task history for an agent.
   * @param {string} agentId
   * @param {number} [limit=0] — 0 means all
   * @returns {object[]}
   */
  getHistory(agentId, limit = 0) {
    const filePath = this._historyPath(agentId);
    if (!existsSync(filePath)) return [];

    try {
      const content = readFileSync(filePath, 'utf-8').trim();
      if (!content) return [];
      const lines = content.split('\n').map(line => JSON.parse(line));
      return limit > 0 ? lines.slice(-limit) : lines;
    } catch (err) {
      logger.log('system', 'EXPERIENCE_READ_ERROR', { agentId, error: err.message });
      return [];
    }
  }

  /**
   * Rank agents by success rate. Only includes agents with at least one recorded task.
   * @param {number} [limit=10]
   * @returns {{ agentId: string, totalTasks: number, successRate: number }[]}
   */
  getTopPerformers(limit = 10) {
    if (!existsSync(DATA_DIR)) return [];

    const agentDirs = readdirSync(DATA_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const performers = agentDirs
      .map(agentId => {
        const stats = this.getStats(agentId);
        return { agentId, totalTasks: stats.totalTasks, successRate: stats.successRate };
      })
      .filter(p => p.totalTasks > 0)
      .sort((a, b) => b.successRate - a.successRate || b.totalTasks - a.totalTasks);

    return performers.slice(0, limit);
  }
}

const experience = new ExperienceTracker();

export { experience, OUTCOME };
