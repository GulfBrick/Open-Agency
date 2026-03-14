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
