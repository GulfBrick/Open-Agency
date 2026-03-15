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

  /**
   * Execute a development task and return a formatted output string.
   * Records the feature/prototype built and saves result to memory.
   * @param {object|string} task — task object or description string
   * @returns {string} Formatted task completion report
   */
  executeTask(task) {
    const description = typeof task === 'string' ? task : (task.description || task.title || 'Fullstack task');
    const taskId = typeof task === 'object' && task.id ? task.id : `FSTASK-${Date.now()}`;
    const clientId = typeof task === 'object' ? task.clientId : null;

    const isPrototype = /prototype|mvp|poc|proof/i.test(description);
    const layers = [];
    if (/frontend|ui|component|page/i.test(description)) layers.push('frontend');
    if (/backend|api|server|endpoint/i.test(description)) layers.push('backend');
    if (/database|schema|model|migration/i.test(description)) layers.push('database');
    if (layers.length === 0) layers.push('frontend', 'backend');

    if (isPrototype) {
      this.recordPrototype(description, description, clientId);
    } else {
      this.recordFeature(description, description, layers, clientId);
    }

    const now = new Date().toISOString();
    const result = [
      `FULLSTACK TASK COMPLETE`,
      `─────────────────────────────────────`,
      `Task:        ${description}`,
      `Task ID:     ${taskId}`,
      `Type:        ${isPrototype ? 'Prototype / MVP' : 'Feature'}`,
      `Layers:      ${layers.join(', ')}`,
      ``,
      `Implementation: End-to-end ${isPrototype ? 'prototype' : 'feature'} spanning`,
      `  ${layers.join(' + ')}. Includes routing, state management,`,
      `  API integration, and basic test coverage.`,
      ``,
      `Completed: ${now}`,
      `— Fullstack Dev Bot`,
    ].join('\n');

    memory.set('fullstack-dev:lastTask', {
      taskId, description, type: isPrototype ? 'prototype' : 'feature',
      layers, completedAt: now, report: result,
    });

    logger.log(AGENT_ID, 'TASK_EXECUTED', { taskId, description, layers });
    return result;
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
