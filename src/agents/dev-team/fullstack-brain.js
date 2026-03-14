/**
 * Fullstack Dev Bot Brain — "The Bridge"
 *
 * Extends AgentBrain with end-to-end development capabilities.
 * Handles features spanning frontend, backend, and database.
 * Also serves as rapid prototyper and capacity overflow.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';

const AGENT_ID = 'fullstack-dev';
const AGENT_DIR = 'dev-team/fullstack';
const MODEL = 'claude-sonnet-4-5-20250929';

const ESCALATION_TRIGGERS = [
  'integration failure', 'data mismatch',
  'breaking change', 'api contract violation',
  'scope change', 'requirement change',
];

class FullstackBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      model: MODEL,
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initFullstackState();
  }

  _initFullstackState() {
    if (!memory.has('fullstack-dev:state')) {
      memory.set('fullstack-dev:state', {
        featuresDelivered: [],
        prototypesBuilt: [],
      });
    }
  }

  getFullstackState() {
    return memory.get('fullstack-dev:state');
  }

  /**
   * Record a completed end-to-end feature.
   * @param {string} name
   * @param {string} description
   * @param {string[]} layers — e.g. ['frontend', 'backend', 'database']
   * @param {string} [clientId]
   * @returns {object}
   */
  recordFeature(name, description, layers, clientId = null) {
    const state = this.getFullstackState();
    const feature = {
      id: `FEAT-${Date.now()}`,
      name,
      description,
      layers,
      clientId,
      createdAt: new Date().toISOString(),
    };

    state.featuresDelivered.push(feature);
    memory.set('fullstack-dev:state', state);
    logger.log(AGENT_ID, 'FEATURE_DELIVERED', { name, layers });

    return feature;
  }

  /**
   * Record a prototype or MVP built.
   * @param {string} name
   * @param {string} description
   * @param {string} [clientId]
   * @returns {object}
   */
  recordPrototype(name, description, clientId = null) {
    const state = this.getFullstackState();
    const prototype = {
      id: `PROTO-${Date.now()}`,
      name,
      description,
      clientId,
      createdAt: new Date().toISOString(),
    };

    state.prototypesBuilt.push(prototype);
    memory.set('fullstack-dev:state', state);
    logger.log(AGENT_ID, 'PROTOTYPE_BUILT', { name });

    return prototype;
  }

  async processMessage(message) {
    const state = this.getFullstackState();
    const additionalContext = [
      `Features delivered: ${state.featuresDelivered.length}`,
      `Prototypes built: ${state.prototypesBuilt.length}`,
    ].join('\n');

    return super.processMessage(message, additionalContext);
  }
}

const fullstackBrain = new FullstackBrain();

export { fullstackBrain };
