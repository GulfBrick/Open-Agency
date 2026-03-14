/**
 * Backend Dev Bot Brain — "The Engine"
 *
 * Extends AgentBrain with backend development capabilities.
 * Implements APIs, business logic, database operations, and integrations.
 * Stack-agnostic — adapts to client context at runtime.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../../core/message-bus.js';

const AGENT_ID = 'backend-dev';
const AGENT_DIR = 'dev-team/backend';
const MODEL = 'claude-sonnet-4-5-20250929';

const ESCALATION_TRIGGERS = [
  'security vulnerability', 'injection', 'auth bypass',
  'data breach', 'sensitive data',
  'performance degradation', 'query timeout',
  'migration failure', 'data loss',
  'breaking api change',
];

class BackendBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      model: MODEL,
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initBackendState();
  }

  _initBackendState() {
    if (!memory.has('backend-dev:state')) {
      memory.set('backend-dev:state', {
        endpointsBuilt: [],
        migrationsRun: [],
        integrationsBuilt: [],
        securityIssues: [],
      });
    }
  }

  getBackendState() {
    return memory.get('backend-dev:state');
  }

  /**
   * Record a completed API endpoint.
   * @param {string} method — 'GET', 'POST', 'PUT', 'DELETE', etc.
   * @param {string} path — e.g. '/api/users/:id'
   * @param {string} description
   * @param {boolean} [authRequired]
   * @param {string} [clientId]
   * @returns {object}
   */
  recordEndpoint(method, path, description, authRequired = true, clientId = null) {
    const state = this.getBackendState();
    const endpoint = {
      id: `EP-${Date.now()}`,
      method,
      path,
      description,
      authRequired,
      clientId,
      createdAt: new Date().toISOString(),
    };

    state.endpointsBuilt.push(endpoint);
    memory.set('backend-dev:state', state);
    logger.log(AGENT_ID, 'ENDPOINT_BUILT', { method, path });

    return endpoint;
  }

  /**
   * Record a database migration.
   * @param {string} name — migration name
   * @param {string} direction — 'up' or 'down'
   * @param {string} description
   * @param {boolean} [hasRollback]
   * @returns {object}
   */
  recordMigration(name, direction, description, hasRollback = true) {
    const state = this.getBackendState();
    const migration = {
      id: `MIG-${Date.now()}`,
      name,
      direction,
      description,
      hasRollback,
      executedAt: new Date().toISOString(),
    };

    state.migrationsRun.push(migration);
    memory.set('backend-dev:state', state);
    logger.log(AGENT_ID, 'MIGRATION_RECORDED', { name, direction });

    return migration;
  }

  /**
   * Flag a security issue found during implementation.
   * @param {string} endpoint — affected endpoint
   * @param {string} issue — description
   * @param {string} severity — 'critical', 'high', 'medium', 'low'
   * @returns {object}
   */
  flagSecurityIssue(endpoint, issue, severity) {
    const state = this.getBackendState();
    const entry = {
      id: `SECISSUE-${Date.now()}`,
      endpoint,
      issue,
      severity,
      status: 'open',
      reportedAt: new Date().toISOString(),
    };

    state.securityIssues.push(entry);
    memory.set('backend-dev:state', state);

    logger.log(AGENT_ID, 'SECURITY_ISSUE_FLAGGED', { endpoint, severity });

    // Always escalate security issues
    messageBus.send({
      from: AGENT_ID,
      to: 'dev-lead',
      type: MESSAGE_TYPES.ESCALATION,
      priority: PRIORITY.HIGH,
      payload: { event: 'SECURITY_ISSUE', entry },
    });

    return entry;
  }

  async processMessage(message) {
    const state = this.getBackendState();
    const additionalContext = [
      `Endpoints built: ${state.endpointsBuilt.length}`,
      `Migrations run: ${state.migrationsRun.length}`,
      `Integrations: ${state.integrationsBuilt.length}`,
      `Open security issues: ${state.securityIssues.filter(i => i.status === 'open').length}`,
    ].join('\n');

    return super.processMessage(message, additionalContext);
  }
}

const backendBrain = new BackendBrain();

export { backendBrain };
