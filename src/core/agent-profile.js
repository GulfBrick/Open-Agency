/**
 * Agent Profile Manager
 *
 * Manages agent profiles — identity, role, department, rank, and client assignments.
 * Persists to data/agent-experience/[agentId]/profile.json
 * Used by the promotion engine and context injection system.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { experience } from './experience.js';
import { businessKnowledge } from './business-knowledge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(PROJECT_ROOT, 'data', 'agent-experience');

/** Valid agent statuses */
const AGENT_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
};

class AgentProfileManager {
  constructor() {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  /**
   * Ensure the agent's data directory exists and return its path.
   * @param {string} agentId
   * @returns {string}
   */
  _agentDir(agentId) {
    const dir = join(DATA_DIR, agentId);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Path to an agent's profile file.
   * @param {string} agentId
   * @returns {string}
   */
  _profilePath(agentId) {
    return join(this._agentDir(agentId), 'profile.json');
  }

  /**
   * Create a new agent profile. Sets rank to Junior by default.
   * @param {string} agentId — unique identifier (e.g. "cfo-001")
   * @param {string} name — display name (e.g. "Chief Financial Officer")
   * @param {string} role — role title (e.g. "CFO")
   * @param {string} department — department name (e.g. "Finance")
   * @returns {object} The created profile
   */
  createAgent(agentId, name, role, department) {
    const profile = {
      agentId,
      name,
      role,
      department,
      rank: `Junior ${role}`,
      hireDate: new Date().toISOString(),
      clientAssignments: [],
      status: AGENT_STATUS.ACTIVE,
    };

    writeFileSync(this._profilePath(agentId), JSON.stringify(profile, null, 2));

    logger.log('system', 'AGENT_CREATED', { agentId, name, role, department });
    return profile;
  }

  /**
   * Get an agent's profile.
   * @param {string} agentId
   * @returns {object|null} The profile, or null if not found
   */
  getProfile(agentId) {
    const filePath = this._profilePath(agentId);
    if (!existsSync(filePath)) return null;

    try {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Update an agent's profile with partial data. Merges into existing profile.
   * @param {string} agentId
   * @param {object} updates — fields to update (e.g. { status: 'INACTIVE' })
   * @returns {object|null} The updated profile, or null if agent not found
   */
  updateProfile(agentId, updates) {
    const profile = this.getProfile(agentId);
    if (!profile) return null;

    // Merge updates, preserving agentId
    const updated = { ...profile, ...updates, agentId };
    writeFileSync(this._profilePath(agentId), JSON.stringify(updated, null, 2));

    logger.log('system', 'AGENT_UPDATED', { agentId, fields: Object.keys(updates) });
    return updated;
  }

  /**
   * Assign an agent to a client. Adds the clientId to clientAssignments if not already present.
   * @param {string} agentId
   * @param {string} clientId
   * @returns {object|null} The updated profile, or null if agent not found
   */
  assignToClient(agentId, clientId) {
    const profile = this.getProfile(agentId);
    if (!profile) return null;

    if (!profile.clientAssignments.includes(clientId)) {
      profile.clientAssignments.push(clientId);
      writeFileSync(this._profilePath(agentId), JSON.stringify(profile, null, 2));

      logger.log('system', 'AGENT_ASSIGNED_TO_CLIENT', { agentId, clientId });
    }

    return profile;
  }

  /**
   * List all agents, optionally filtered by a predicate.
   * @param {function} [filter] — optional filter function receiving (profile) => boolean
   * @returns {object[]} Array of matching profiles
   */
  listAgents(filter) {
    if (!existsSync(DATA_DIR)) return [];

    const agentDirs = readdirSync(DATA_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const agents = [];
    for (const agentId of agentDirs) {
      const profile = this.getProfile(agentId);
      if (profile) {
        if (!filter || filter(profile)) {
          agents.push(profile);
        }
      }
    }

    return agents;
  }

  /**
   * Assemble full agent context for prompt injection.
   * Combines profile, experience stats, and client knowledge into a single object.
   * @param {string} agentId
   * @param {string} [clientId] — optional client context to include
   * @returns {{ profile: object, experienceStats: object, clientContext: object|null }}
   */
  getAgentContext(agentId, clientId) {
    const profile = this.getProfile(agentId);
    const experienceStats = experience.getStats(agentId);

    let clientContext = null;
    if (clientId) {
      clientContext = businessKnowledge.getClientContext(clientId);
    }

    return {
      profile,
      experienceStats,
      clientContext,
    };
  }
}

const agentProfile = new AgentProfileManager();

export { agentProfile, AGENT_STATUS };
