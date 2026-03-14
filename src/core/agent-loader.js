/**
 * Agent Loader
 *
 * Dynamically loads and registers C-Suite agents on the message bus.
 * Each agent gets subscribed to its own channel and starts processing messages.
 * Handles graceful loading — if an agent's brain fails to load, it logs the error
 * and continues with other agents.
 */

import { logger } from './logger.js';
import { messageBus } from './message-bus.js';
import { agentProfile, AGENT_STATUS } from './agent-profile.js';

/**
 * Register an agent brain on the message bus.
 * @param {string} agentId
 * @param {object} brain — an AgentBrain instance (or subclass)
 */
function registerAgent(agentId, brain) {
  messageBus.subscribe(agentId, async (message) => {
    logger.log(agentId, 'MESSAGE_RECEIVED', {
      from: message.from,
      type: message.type,
      messageId: message.id,
    });

    try {
      const decision = await brain.processMessage(message);

      if (decision.response && message.from !== agentId) {
        messageBus.send({
          from: agentId,
          to: message.from,
          type: 'REPORT',
          priority: message.priority,
          payload: { response: decision.response },
        });
      }
    } catch (err) {
      logger.log(agentId, 'ERROR', {
        error: err.message,
        messageId: message.id,
      });
    }
  });

  logger.log(agentId, 'ONLINE', { status: 'subscribed' });
}

/**
 * Load all C-Suite agents. Returns an object mapping agentId to brain instance.
 * @returns {Promise<Record<string, object>>}
 */
async function loadCSuiteAgents() {
  const loaded = {};

  const agents = [
    { id: 'cfo', name: 'Marcus (CFO)', module: '../agents/cfo/brain.js', exportName: 'cfoBrain', profile: { name: 'Marcus', role: 'CFO', department: 'Finance' } },
    { id: 'cto', name: 'Zara (CTO)', module: '../agents/cto/brain.js', exportName: 'ctoBrain', profile: { name: 'Zara', role: 'CTO', department: 'Technology' } },
    { id: 'cmo', name: 'Priya (CMO)', module: '../agents/cmo/brain.js', exportName: 'cmoBrain', profile: { name: 'Priya', role: 'CMO', department: 'Marketing' } },
  ];

  for (const agent of agents) {
    try {
      const mod = await import(agent.module);
      const brain = mod[agent.exportName];

      if (!brain) {
        throw new Error(`Export '${agent.exportName}' not found in ${agent.module}`);
      }

      registerAgent(agent.id, brain);
      loaded[agent.id] = brain;

      // Ensure agent profile exists
      const existing = agentProfile.getProfile(agent.id);
      if (!existing) {
        agentProfile.createAgent(agent.id, agent.profile.name, agent.profile.role, agent.profile.department);
      }

      logger.log('system', 'CSUITE_AGENT_LOADED', { agentId: agent.id, name: agent.name });
    } catch (err) {
      logger.log('system', 'CSUITE_AGENT_LOAD_FAILED', {
        agentId: agent.id,
        error: err.message,
      });
      console.error(`  Failed to load ${agent.name}: ${err.message}`);
    }
  }

  return loaded;
}

export { registerAgent, loadCSuiteAgents };
