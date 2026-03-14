/**
 * Zara — CTO Brain
 *
 * Extends the base AgentBrain with technical domain logic.
 * Monitors system health, manages infrastructure, enforces security,
 * and coordinates with the Dev Team.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../../core/message-bus.js';
import { taskQueue } from '../../core/task-queue.js';

const AGENT_ID = 'cto';
const AGENT_DIR = 'cto';

/** Technical escalation triggers */
const ESCALATION_TRIGGERS = [
  'security breach', 'data breach', 'unauthorised access',
  'vulnerability', 'exploit', 'injection',
  'downtime', 'outage', 'service down', 'system failure',
  'data loss', 'backup failure', 'corruption',
  'vendor lock-in', 'major migration',
  'infrastructure cost', 'cloud spend',
  'architecture change', 'breaking change',
  'compliance', 'audit failure',
];

/** System health status levels */
const HEALTH_STATUS = {
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  DOWN: 'DOWN',
  UNKNOWN: 'UNKNOWN',
};

class CtoBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initTechnicalState();
  }

  /**
   * Initialise or load technical state from memory.
   */
  _initTechnicalState() {
    if (!memory.has('cto:techState')) {
      memory.set('cto:techState', {
        services: {},
        infrastructure: {
          provider: null,
          monthlyCost: 0,
          resources: [],
        },
        security: {
          lastScan: null,
          openVulnerabilities: 0,
          incidentHistory: [],
        },
        adrs: [],
        techDebt: [],
        standards: {
          minTestCoverage: 80,
          requiredReviews: 1,
          branchingStrategy: 'gitflow',
        },
      });
    }
  }

  /**
   * Get current technical state.
   * @returns {object}
   */
  getTechState() {
    return memory.get('cto:techState');
  }

  /**
   * Register a service for monitoring.
   * @param {string} serviceId — unique service identifier
   * @param {string} name — human-readable name
   * @param {string} type — 'api', 'database', 'queue', 'frontend', 'worker'
   * @returns {object} The registered service
   */
  registerService(serviceId, name, type) {
    const state = this.getTechState();
    state.services[serviceId] = {
      name,
      type,
      status: HEALTH_STATUS.UNKNOWN,
      lastCheck: null,
      uptime: 100,
      errorRate: 0,
      registeredAt: new Date().toISOString(),
    };
    memory.set('cto:techState', state);

    logger.log(AGENT_ID, 'SERVICE_REGISTERED', { serviceId, name, type });

    return state.services[serviceId];
  }

  /**
   * Update service health status.
   * @param {string} serviceId
   * @param {string} status — HEALTHY, DEGRADED, DOWN, UNKNOWN
   * @param {{ errorRate?: number, responseTime?: number }} [metrics]
   * @returns {object|null} Updated service, or null if not found
   */
  updateServiceHealth(serviceId, status, metrics = {}) {
    const state = this.getTechState();
    const service = state.services[serviceId];
    if (!service) return null;

    const previousStatus = service.status;
    service.status = status;
    service.lastCheck = new Date().toISOString();

    if (metrics.errorRate !== undefined) service.errorRate = metrics.errorRate;
    if (metrics.responseTime !== undefined) service.responseTime = metrics.responseTime;

    memory.set('cto:techState', state);

    // Escalate if service went down
    if (status === HEALTH_STATUS.DOWN && previousStatus !== HEALTH_STATUS.DOWN) {
      messageBus.send({
        from: AGENT_ID,
        to: 'nikita',
        type: MESSAGE_TYPES.ALERT,
        priority: PRIORITY.HIGH,
        payload: {
          event: 'SERVICE_DOWN',
          serviceId,
          serviceName: service.name,
          previousStatus,
          errorRate: service.errorRate,
        },
      });
      logger.log(AGENT_ID, 'SERVICE_DOWN_ALERT', { serviceId });
    }

    logger.log(AGENT_ID, 'SERVICE_HEALTH_UPDATED', { serviceId, status });

    return service;
  }

  /**
   * Record a security incident.
   * @param {string} severity — 'critical', 'high', 'medium', 'low'
   * @param {string} description
   * @param {string} affectedService
   * @returns {object} The incident record
   */
  recordSecurityIncident(severity, description, affectedService) {
    const state = this.getTechState();
    const incident = {
      id: `SEC-${Date.now()}`,
      severity,
      description,
      affectedService,
      status: 'open',
      reportedAt: new Date().toISOString(),
      resolvedAt: null,
    };

    state.security.incidentHistory.push(incident);
    memory.set('cto:techState', state);

    // Always escalate security incidents to Nikita
    messageBus.send({
      from: AGENT_ID,
      to: 'nikita',
      type: MESSAGE_TYPES.ESCALATION,
      priority: PRIORITY.HIGH,
      payload: {
        event: 'SECURITY_INCIDENT',
        incident,
      },
    });

    logger.log(AGENT_ID, 'SECURITY_INCIDENT_RECORDED', {
      incidentId: incident.id,
      severity,
      affectedService,
    });

    return incident;
  }

  /**
   * Create an Architecture Decision Record (ADR).
   * @param {string} title
   * @param {string} context — why this decision is needed
   * @param {string} decision — what was decided
   * @param {string[]} consequences — positive and negative outcomes
   * @returns {object} The ADR
   */
  createADR(title, context, decision, consequences) {
    const state = this.getTechState();
    const adr = {
      id: `ADR-${String(state.adrs.length + 1).padStart(3, '0')}`,
      title,
      context,
      decision,
      consequences,
      status: 'proposed',
      createdAt: new Date().toISOString(),
      approvedBy: null,
    };

    state.adrs.push(adr);
    memory.set('cto:techState', state);

    logger.log(AGENT_ID, 'ADR_CREATED', { adrId: adr.id, title });

    // Send to Nikita for review if it affects business operations
    messageBus.send({
      from: AGENT_ID,
      to: 'nikita',
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.MEDIUM,
      payload: {
        event: 'ADR_PROPOSED',
        adr,
      },
    });

    return adr;
  }

  /**
   * Track technical debt.
   * @param {string} area — where the debt lives (e.g. 'api', 'database', 'frontend')
   * @param {string} description
   * @param {string} impact — 'high', 'medium', 'low'
   * @returns {object} The tech debt item
   */
  addTechDebt(area, description, impact) {
    const state = this.getTechState();
    const item = {
      id: `TD-${Date.now()}`,
      area,
      description,
      impact,
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    state.techDebt.push(item);
    memory.set('cto:techState', state);

    logger.log(AGENT_ID, 'TECH_DEBT_ADDED', { id: item.id, area, impact });

    return item;
  }

  /**
   * Update infrastructure cost tracking.
   * @param {string} provider — 'aws', 'azure', 'gcp', 'other'
   * @param {number} monthlyCost
   * @param {object[]} resources — [{ name, type, cost }]
   */
  updateInfrastructureCost(provider, monthlyCost, resources) {
    const state = this.getTechState();
    const previousCost = state.infrastructure.monthlyCost;

    state.infrastructure.provider = provider;
    state.infrastructure.monthlyCost = monthlyCost;
    state.infrastructure.resources = resources;
    state.infrastructure.lastUpdated = new Date().toISOString();

    memory.set('cto:techState', state);

    // Alert CFO about infrastructure cost changes
    if (previousCost > 0 && monthlyCost > previousCost * 1.2) {
      messageBus.send({
        from: AGENT_ID,
        to: 'cfo',
        type: MESSAGE_TYPES.ALERT,
        priority: PRIORITY.HIGH,
        payload: {
          event: 'INFRA_COST_INCREASE',
          previousCost,
          newCost: monthlyCost,
          increasePercent: Math.round(((monthlyCost - previousCost) / previousCost) * 100),
        },
      });
    }

    logger.log(AGENT_ID, 'INFRA_COST_UPDATED', { provider, monthlyCost });
  }

  /**
   * Get overall system health summary.
   * @returns {object}
   */
  getSystemHealth() {
    const state = this.getTechState();
    const services = Object.values(state.services);

    return {
      totalServices: services.length,
      healthy: services.filter(s => s.status === HEALTH_STATUS.HEALTHY).length,
      degraded: services.filter(s => s.status === HEALTH_STATUS.DEGRADED).length,
      down: services.filter(s => s.status === HEALTH_STATUS.DOWN).length,
      unknown: services.filter(s => s.status === HEALTH_STATUS.UNKNOWN).length,
      openVulnerabilities: state.security.openVulnerabilities,
      openTechDebt: state.techDebt.filter(td => td.status === 'open').length,
      infraMonthlyCost: state.infrastructure.monthlyCost,
    };
  }

  /**
   * Generate the daily systems report.
   * @returns {Promise<string>}
   */
  async generateDailyReport() {
    const health = this.getSystemHealth();
    const state = this.getTechState();

    const report = await this.generateReport('daily-systems-report', {
      systemHealth: health,
      recentIncidents: state.security.incidentHistory.slice(-5),
      infraCost: state.infrastructure.monthlyCost,
      openTechDebt: state.techDebt.filter(td => td.status === 'open'),
      pendingADRs: state.adrs.filter(a => a.status === 'proposed'),
    });

    this.sendReportToNikita('daily-systems-report', report);

    // Also send infra spend to CFO
    messageBus.send({
      from: AGENT_ID,
      to: 'cfo',
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.LOW,
      payload: {
        reportType: 'infra-spend',
        monthlyCost: state.infrastructure.monthlyCost,
        resources: state.infrastructure.resources,
      },
    });

    return report;
  }

  /**
   * Process a message with technical context.
   * @param {object} message
   * @returns {Promise<object>}
   */
  async processMessage(message) {
    const health = this.getSystemHealth();
    const state = this.getTechState();

    const additionalContext = [
      `System health: ${health.healthy}/${health.totalServices} healthy`,
      `Down services: ${health.down}`,
      `Open vulnerabilities: ${health.openVulnerabilities}`,
      `Open tech debt: ${health.openTechDebt}`,
      `Infra monthly cost: ${state.infrastructure.monthlyCost}`,
    ].join('\n');

    return super.processMessage(message, additionalContext);
  }
}

const ctoBrain = new CtoBrain();

export { ctoBrain, HEALTH_STATUS };
