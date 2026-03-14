/**
 * Agent Registry
 *
 * Central registry for all live agent instances.
 * Allows lookup, listing, and dispatching method calls by agent ID.
 */

import { logger } from './logger.js';

class AgentRegistry {
  constructor() {
    /** @type {Map<string, object>} */
    this._agents = new Map();
  }

  /**
   * Register an agent instance.
   * @param {string} agentId
   * @param {object} instance — any agent object
   */
  register(agentId, instance) {
    this._agents.set(agentId, instance);
    logger.log('registry', 'AGENT_REGISTERED', { agentId });
  }

  /**
   * Get an agent by ID.
   * @param {string} agentId
   * @returns {object|undefined}
   */
  get(agentId) {
    return this._agents.get(agentId);
  }

  /**
   * List all registered agent IDs.
   * @returns {string[]}
   */
  list() {
    return [...this._agents.keys()];
  }

  /**
   * Get agents whose instance has a matching `department` property.
   * @param {string} department
   * @returns {object[]}
   */
  getByDepartment(department) {
    const results = [];
    for (const instance of this._agents.values()) {
      if (instance.department === department) {
        results.push(instance);
      }
    }
    return results;
  }

  /**
   * Dispatch a method call on a registered agent.
   * @param {string} agentId
   * @param {string} method — method name on the agent instance
   * @param {any[]} args — arguments to pass
   * @returns {Promise<any>}
   */
  async dispatch(agentId, method, args = []) {
    const agent = this._agents.get(agentId);
    if (!agent) throw new Error(`Agent '${agentId}' not found in registry`);
    if (typeof agent[method] !== 'function') {
      throw new Error(`Agent '${agentId}' has no method '${method}'`);
    }
    return agent[method](...args);
  }
}

const agentRegistry = new AgentRegistry();

export { agentRegistry };
