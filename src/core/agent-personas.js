/**
 * Agent Personas
 *
 * Loads each agent's SOUL.md file and builds a system prompt for them.
 * This is what makes each agent respond IN CHARACTER — their own personality,
 * communication style, and decision-making framework.
 *
 * Singleton export. Call getSystemPrompt(agentId) to get the full persona.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const AGENTS_DIR = join(PROJECT_ROOT, 'agents');

/**
 * Map of agentId → { name, soulPath (relative to AGENTS_DIR) }
 */
const AGENT_MAP = {
  'nikita':            { name: 'Nikita',  path: 'nikita' },
  'cfo':               { name: 'Marcus',  path: 'cfo' },
  'cto':               { name: 'Zara',    path: 'cto' },
  'cmo':               { name: 'Priya',   path: 'cmo' },
  'dev-lead':          { name: 'Kai',     path: join('dev-team', 'lead') },
  'architect':         { name: 'Sage',    path: join('dev-team', 'architect') },
  'frontend':          { name: 'Luna',    path: join('dev-team', 'frontend') },
  'backend':           { name: 'Rex',     path: join('dev-team', 'backend') },
  'fullstack':         { name: 'Avery',   path: join('dev-team', 'fullstack') },
  'qa':                { name: 'Quinn',   path: join('dev-team', 'qa') },
  'code-review':       { name: 'Atlas',   path: join('dev-team', 'code-review') },
  'sales-lead':        { name: 'Jordan',  path: join('sales', 'lead') },
  'closer':            { name: 'Zoe',     path: join('sales', 'closer') },
  'lead-qualifier':    { name: 'Sam',     path: join('sales', 'lead-qualifier') },
  'follow-up':         { name: 'Maya',    path: join('sales', 'follow-up') },
  'proposal':          { name: 'Leo',     path: join('sales', 'proposal') },
  'creative-director': { name: 'Nova',    path: join('creative', 'director') },
  'designer':          { name: 'Iris',    path: join('creative', 'designer') },
  'video-editor':      { name: 'Finn',    path: join('creative', 'video') },
  'social-media':      { name: 'Jade',    path: join('creative', 'social') },
  'copywriter':        { name: 'Ash',     path: join('creative', 'copywriter') },
};

/** Cache: agentId → compiled system prompt */
const promptCache = new Map();

/**
 * Load raw SOUL.md content for an agent.
 * @param {string} agentId
 * @returns {string|null}
 */
function loadSoul(agentId) {
  const entry = AGENT_MAP[agentId];
  if (!entry) return null;

  const soulPath = join(AGENTS_DIR, entry.path, 'SOUL.md');
  if (!existsSync(soulPath)) {
    logger.log('personas', 'SOUL_NOT_FOUND', { agentId, soulPath });
    return null;
  }

  return readFileSync(soulPath, 'utf-8');
}

/**
 * Build the full system prompt for an agent from their SOUL.md.
 * Includes their name and role context so they know who they are in conversation.
 *
 * @param {string} agentId
 * @returns {string}
 */
function getSystemPrompt(agentId) {
  if (promptCache.has(agentId)) return promptCache.get(agentId);

  const entry = AGENT_MAP[agentId];
  if (!entry) {
    throw new Error(`Unknown agent ID: ${agentId}`);
  }

  const soul = loadSoul(agentId);
  if (!soul) {
    throw new Error(`No SOUL.md found for agent: ${agentId} (${entry.name})`);
  }

  const prompt = [
    `You are ${entry.name}, an agent at Open Agency.`,
    `Your agent ID is "${agentId}". When you speak, you speak as ${entry.name} — in your own voice, your own personality, your own perspective.`,
    `You are part of a multi-agent team. When another agent talks to you, respond in character. Be yourself.`,
    '',
    '---',
    '',
    soul,
  ].join('\n');

  promptCache.set(agentId, prompt);
  logger.log('personas', 'PROMPT_LOADED', { agentId, name: entry.name });

  return prompt;
}

/**
 * Get the human-readable name for an agent.
 * @param {string} agentId
 * @returns {string}
 */
function getAgentName(agentId) {
  const entry = AGENT_MAP[agentId];
  if (!entry) return agentId;
  return entry.name;
}

/**
 * List all known agent IDs.
 * @returns {string[]}
 */
function listAgentIds() {
  return Object.keys(AGENT_MAP);
}

/**
 * Check if an agent ID is known.
 * @param {string} agentId
 * @returns {boolean}
 */
function isKnownAgent(agentId) {
  return agentId in AGENT_MAP;
}

/**
 * Clear the prompt cache (useful for hot-reloading SOUL.md changes).
 */
function clearCache() {
  promptCache.clear();
}

const agentPersonas = {
  getSystemPrompt,
  getAgentName,
  listAgentIds,
  isKnownAgent,
  clearCache,
  AGENT_MAP,
};

export { agentPersonas };
