/**
 * Business Knowledge Base
 *
 * Per-client knowledge that accumulates over time.
 * Stores preferences, decisions, lessons learned — everything agents need
 * to understand a client's business deeply.
 *
 * Persists to data/business-knowledge/[clientId]/
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(PROJECT_ROOT, 'data', 'business-knowledge');

class BusinessKnowledge {
  constructor() {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  /**
   * Get the directory path for a client.
   * @param {string} clientId
   * @returns {string}
   */
  _clientDir(clientId) {
    return join(DATA_DIR, clientId);
  }

  /**
   * Initialise a new client's knowledge directory.
   * Creates the folder structure and writes the overview.
   * @param {string} clientId — unique slug (e.g. "clearline-markets")
   * @param {{ name: string, description: string, industry?: string, contacts?: string[] }} overview
   * @returns {object} The created overview
   */
  initClient(clientId, overview) {
    const dir = this._clientDir(clientId);
    mkdirSync(dir, { recursive: true });

    const overviewData = {
      clientId,
      name: overview.name,
      description: overview.description,
      industry: overview.industry || null,
      contacts: overview.contacts || [],
      createdAt: new Date().toISOString(),
      status: 'active',
    };

    writeFileSync(join(dir, 'overview.json'), JSON.stringify(overviewData, null, 2));
    writeFileSync(join(dir, 'preferences.json'), JSON.stringify({}, null, 2));

    // Initialise empty files
    if (!existsSync(join(dir, 'decisions.jsonl'))) {
      writeFileSync(join(dir, 'decisions.jsonl'), '');
    }
    if (!existsSync(join(dir, 'lessons-learned.md'))) {
      writeFileSync(join(dir, 'lessons-learned.md'), `# Lessons Learned — ${overview.name}\n\n`);
    }

    logger.log('system', 'CLIENT_INITIALISED', { clientId, name: overview.name });
    return overviewData;
  }

  /**
   * Record a business decision and its outcome.
   * @param {string} clientId
   * @param {string} decision — what was decided
   * @param {string} outcome — what happened as a result
   * @param {string} madeBy — who made the decision (agentId or "harry")
   * @returns {object} The recorded entry
   */
  recordDecision(clientId, decision, outcome, madeBy) {
    const entry = {
      decision,
      outcome,
      madeBy,
      timestamp: new Date().toISOString(),
    };

    const filePath = join(this._clientDir(clientId), 'decisions.jsonl');
    appendFileSync(filePath, JSON.stringify(entry) + '\n');

    logger.log('system', 'DECISION_RECORDED', { clientId, madeBy, decision: decision.slice(0, 80) });
    return entry;
  }

  /**
   * Update client preferences. Merges new values into the existing preferences.
   * @param {string} clientId
   * @param {object} preferences — key-value pairs to merge
   * @returns {object} The full updated preferences
   */
  updatePreferences(clientId, preferences) {
    const filePath = join(this._clientDir(clientId), 'preferences.json');
    let existing = {};

    if (existsSync(filePath)) {
      try {
        existing = JSON.parse(readFileSync(filePath, 'utf-8'));
      } catch {
        existing = {};
      }
    }

    const merged = { ...existing, ...preferences, updatedAt: new Date().toISOString() };
    writeFileSync(filePath, JSON.stringify(merged, null, 2));

    logger.log('system', 'PREFERENCES_UPDATED', { clientId, keys: Object.keys(preferences) });
    return merged;
  }

  /**
   * Add a lesson learned for a client.
   * @param {string} clientId
   * @param {string} lesson — the lesson
   * @param {string} context — what happened that taught us this
   * @returns {void}
   */
  addLesson(clientId, lesson, context) {
    const filePath = join(this._clientDir(clientId), 'lessons-learned.md');
    const date = new Date().toISOString().split('T')[0];
    const entry = `\n## ${date}\n**Lesson:** ${lesson}\n**Context:** ${context}\n`;

    appendFileSync(filePath, entry);

    logger.log('system', 'LESSON_ADDED', { clientId, lesson: lesson.slice(0, 80) });
  }

  /**
   * Get the full client knowledge summary — overview, preferences, recent decisions, lessons.
   * This is the context package injected into agent prompts when working on a client.
   * @param {string} clientId
   * @returns {{ overview: object, preferences: object, recentDecisions: object[], lessonsLearned: string }}
   */
  getClientContext(clientId) {
    const dir = this._clientDir(clientId);
    if (!existsSync(dir)) {
      return { overview: null, preferences: {}, recentDecisions: [], lessonsLearned: '' };
    }

    // Overview
    let overview = null;
    const overviewPath = join(dir, 'overview.json');
    if (existsSync(overviewPath)) {
      try { overview = JSON.parse(readFileSync(overviewPath, 'utf-8')); } catch { /* skip */ }
    }

    // Preferences
    let preferences = {};
    const prefsPath = join(dir, 'preferences.json');
    if (existsSync(prefsPath)) {
      try { preferences = JSON.parse(readFileSync(prefsPath, 'utf-8')); } catch { /* skip */ }
    }

    // Recent decisions (last 20)
    let recentDecisions = [];
    const decisionsPath = join(dir, 'decisions.jsonl');
    if (existsSync(decisionsPath)) {
      try {
        const content = readFileSync(decisionsPath, 'utf-8').trim();
        if (content) {
          recentDecisions = content.split('\n').map(line => JSON.parse(line)).slice(-20);
        }
      } catch { /* skip */ }
    }

    // Lessons learned
    let lessonsLearned = '';
    const lessonsPath = join(dir, 'lessons-learned.md');
    if (existsSync(lessonsPath)) {
      try { lessonsLearned = readFileSync(lessonsPath, 'utf-8'); } catch { /* skip */ }
    }

    return { overview, preferences, recentDecisions, lessonsLearned };
  }

  /**
   * List all active clients.
   * @returns {{ clientId: string, name: string, status: string }[]}
   */
  listClients() {
    if (!existsSync(DATA_DIR)) return [];

    const clientDirs = readdirSync(DATA_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const clients = [];
    for (const clientId of clientDirs) {
      const overviewPath = join(DATA_DIR, clientId, 'overview.json');
      if (existsSync(overviewPath)) {
        try {
          const overview = JSON.parse(readFileSync(overviewPath, 'utf-8'));
          clients.push({
            clientId,
            name: overview.name,
            status: overview.status || 'active',
          });
        } catch { /* skip broken entries */ }
      }
    }

    return clients;
  }
}

const businessKnowledge = new BusinessKnowledge();

export { businessKnowledge };
