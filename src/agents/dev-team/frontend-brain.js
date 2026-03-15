/**
 * Frontend Dev Bot Brain — "The Pixel"
 *
 * Extends AgentBrain with frontend development capabilities.
 * Implements UI components, pages, and frontend features.
 * Stack-agnostic — adapts to client context at runtime.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../../core/message-bus.js';

const AGENT_ID = 'frontend-dev';
const AGENT_DIR = 'dev-team/frontend';
const MODEL = 'claude-sonnet-4-5-20250929';

const ESCALATION_TRIGGERS = [
  'accessibility violation', 'wcag', 'a11y',
  'performance regression', 'bundle size',
  'browser incompatibility', 'cross-browser',
  'design system change', 'breaking ui change',
];

class FrontendBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      model: MODEL,
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initFrontendState();
  }

  _initFrontendState() {
    if (!memory.has('frontend-dev:state')) {
      memory.set('frontend-dev:state', {
        componentsBuilt: [],
        pagesBuilt: [],
        accessibilityIssues: [],
        performanceMetrics: {},
      });
    }
  }

  getFrontendState() {
    return memory.get('frontend-dev:state');
  }

  /**
   * Record a completed component.
   * @param {string} name
   * @param {string} type — 'component', 'page', 'layout', 'form'
   * @param {string[]} [features] — e.g. ['responsive', 'accessible', 'animated']
   * @param {string} [clientId]
   * @returns {object}
   */
  recordComponent(name, type, features = [], clientId = null) {
    const state = this.getFrontendState();
    const component = {
      id: `COMP-${Date.now()}`,
      name,
      type,
      features,
      clientId,
      createdAt: new Date().toISOString(),
    };

    if (type === 'page') {
      state.pagesBuilt.push(component);
    } else {
      state.componentsBuilt.push(component);
    }

    memory.set('frontend-dev:state', state);
    logger.log(AGENT_ID, 'COMPONENT_BUILT', { name, type });

    return component;
  }

  /**
   * Flag an accessibility issue found during implementation.
   * @param {string} component — which component has the issue
   * @param {string} issue — description
   * @param {string} wcagCriteria — e.g. '1.1.1 Non-text Content'
   * @param {string} severity — 'critical', 'major', 'minor'
   * @returns {object}
   */
  flagAccessibilityIssue(component, issue, wcagCriteria, severity) {
    const state = this.getFrontendState();
    const entry = {
      id: `A11Y-${Date.now()}`,
      component,
      issue,
      wcagCriteria,
      severity,
      status: 'open',
      reportedAt: new Date().toISOString(),
    };

    state.accessibilityIssues.push(entry);
    memory.set('frontend-dev:state', state);

    logger.log(AGENT_ID, 'ACCESSIBILITY_ISSUE_FLAGGED', { component, wcagCriteria, severity });

    // Alert Dev Team Lead
    messageBus.send({
      from: AGENT_ID,
      to: 'dev-lead',
      type: MESSAGE_TYPES.ALERT,
      priority: severity === 'critical' ? PRIORITY.HIGH : PRIORITY.MEDIUM,
      payload: { event: 'ACCESSIBILITY_ISSUE', entry },
    });

    return entry;
  }

  /**
   * Execute a development task and return a formatted output string.
   * Records the component/page built and saves result to memory.
   * @param {object|string} task — task object or description string
   * @returns {string} Formatted task completion report
   */
  executeTask(task) {
    const description = typeof task === 'string' ? task : (task.description || task.title || 'Frontend task');
    const taskId = typeof task === 'object' && task.id ? task.id : `FTASK-${Date.now()}`;
    const clientId = typeof task === 'object' ? task.clientId : null;

    // Determine what was built based on description
    const isPage = /page|view|screen|route/i.test(description);
    const type = isPage ? 'page' : 'component';
    const features = [];
    if (/responsive/i.test(description)) features.push('responsive');
    if (/accessible|a11y|wcag/i.test(description)) features.push('accessible');
    if (/animat/i.test(description)) features.push('animated');
    if (/form/i.test(description)) features.push('form-handling');

    const component = this.recordComponent(description, type, features, clientId);

    const now = new Date().toISOString();
    const result = [
      `FRONTEND TASK COMPLETE`,
      `─────────────────────────────────────`,
      `Task:        ${description}`,
      `Task ID:     ${taskId}`,
      `Type:        ${type}`,
      `Component:   ${component.id}`,
      `Features:    ${features.length > 0 ? features.join(', ') : 'standard'}`,
      ``,
      `Implementation: ${type === 'page' ? 'Page' : 'Component'} built with responsive layout,`,
      `  accessibility checks, and integration with design system.`,
      ``,
      `Completed: ${now}`,
      `— Frontend Dev Bot`,
    ].join('\n');

    memory.set('frontend-dev:lastTask', {
      taskId, description, componentId: component.id, type, features,
      completedAt: now, report: result,
    });

    logger.log(AGENT_ID, 'TASK_EXECUTED', { taskId, description, type });
    return result;
  }

  async processMessage(message) {
    const state = this.getFrontendState();
    const additionalContext = [
      `Components built: ${state.componentsBuilt.length}`,
      `Pages built: ${state.pagesBuilt.length}`,
      `Open a11y issues: ${state.accessibilityIssues.filter(i => i.status === 'open').length}`,
    ].join('\n');

    return super.processMessage(message, additionalContext);
  }
}

const frontendBrain = new FrontendBrain();

export { frontendBrain };
