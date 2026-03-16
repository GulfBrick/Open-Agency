/**
 * Nikita Gateway
 *
 * Connects Nikita's brain to every core system:
 *   - Message bus (subscribes to ESCALATION and REPORT messages)
 *   - Agent registry (dispatches tasks to any agent)
 *   - Telegram notifier (sends Harry messages)
 *   - Task queue (creates and monitors tasks)
 *
 * This is the nerve centre — Nikita receives, decides, and acts.
 */

import { logger } from './logger.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from './message-bus.js';
import { taskQueue, TASK_STATUS } from './task-queue.js';
import { agentRegistry } from './agent-registry.js';
import { telegramNotifier } from './telegram-notifier.js';
import { experience, OUTCOME } from './experience.js';
import { nikitaBrain } from '../nikita/brain.js';
import { workflowEngine, WORKFLOW_TEMPLATES } from './workflow-engine.js';

const AGENT_ID = 'nikita';

class NikitaGateway {
  constructor() {
    this.running = false;
  }

  /**
   * Subscribe Nikita to the message bus and start listening.
   * She receives all ESCALATION and REPORT messages, plus anything addressed to her.
   */
  start() {
    if (this.running) return;

    // Subscribe Nikita to her own agent channel
    messageBus.subscribe(AGENT_ID, (message) => this.handleIncomingMessage(message));

    // Listen to ALL messages on the bus — intercept ESCALATION and REPORT types
    messageBus.onAny((message) => {
      if (message.to === AGENT_ID) return; // already handled above
      if (message.type === MESSAGE_TYPES.ESCALATION || message.type === MESSAGE_TYPES.REPORT) {
        this.handleIncomingMessage(message);
      }
    });

    this.running = true;
    logger.log(AGENT_ID, 'GATEWAY_STARTED', { listening: ['ESCALATION', 'REPORT', 'direct'] });
  }

  /**
   * Route an incoming message through Nikita's brain and act on the decision.
   * @param {object} message — message bus message
   */
  async handleIncomingMessage(message) {
    logger.log(AGENT_ID, 'GATEWAY_MESSAGE', {
      from: message.from,
      type: message.type,
      messageId: message.id,
    });

    try {
      const decision = await nikitaBrain.processMessage(message);

      // If the decision is to delegate AND involves multiple agents, start a workflow
      if (decision.action === 'delegate' && decision.tasks?.length > 0) {
        const taskDescription = typeof message.payload === 'string'
          ? message.payload
          : message.payload?.text || decision.tasks.map(t => t.description).join('; ');

        const clientId = message.payload?.clientId || 'clearline-markets';

        try {
          const { workflow } = await this.startWorkflow(taskDescription, clientId);
          logger.log(AGENT_ID, 'WORKFLOW_STARTED_FOR_DELEGATION', {
            workflowId: workflow.workflowId,
            taskCount: decision.tasks.length,
          });
        } catch (workflowErr) {
          // Workflow routing failed — fall back to direct task dispatch
          logger.log(AGENT_ID, 'WORKFLOW_FALLBACK', { error: workflowErr.message });
          this._dispatchTasks(decision.tasks, message);
        }
      } else if (decision.tasks?.length > 0) {
        // Simple task dispatch (respond/acknowledge with tasks)
        this._dispatchTasks(decision.tasks, message);
      }

      // Escalate to Harry
      if (decision.escalate) {
        telegramNotifier.notifyEscalation(
          decision.escalationReason || 'Nikita flagged this for your review',
          { from: message.from, messageId: message.id },
        );
        logger.log(AGENT_ID, 'ESCALATION_SENT', {
          reason: decision.escalationReason,
          messageId: message.id,
        });
      }

      // Response goes to dashboard chat, not Telegram
      // (Telegram is reserved for boot, daily briefing, and escalations)

      // Send response back on the bus if the message came from another agent
      if (decision.response && message.from !== AGENT_ID) {
        messageBus.send({
          from: AGENT_ID,
          to: message.from,
          type: MESSAGE_TYPES.REPORT,
          priority: message.priority,
          payload: { response: decision.response },
        });
      }
    } catch (err) {
      logger.log(AGENT_ID, 'GATEWAY_ERROR', { error: err.message, messageId: message.id });
    }
  }

  /**
   * Process a message FROM Harry (called when Harry DMs the backend).
   * @param {string} text — raw text from Harry
   * @returns {object} Nikita's decision
   */
  async receiveFromHarry(text) {
    logger.log(AGENT_ID, 'HARRY_MESSAGE_RECEIVED', { length: text.length });

    const message = {
      id: `harry-${Date.now()}`,
      from: 'harry',
      to: AGENT_ID,
      type: MESSAGE_TYPES.TASK,
      priority: PRIORITY.HIGH,
      payload: { text },
      timestamp: new Date().toISOString(),
    };

    return this.handleIncomingMessage(message);
  }

  /**
   * Dispatch a task to a specific agent via the registry and record the outcome.
   * @param {string} agentId
   * @param {string} method — method name on the agent
   * @param {any[]} args
   * @param {string} [clientId]
   * @returns {Promise<any>} Result from the agent
   */
  async dispatchToAgent(agentId, method, args = [], clientId = null) {
    const startTime = Date.now();
    logger.log(AGENT_ID, 'DISPATCH_TO_AGENT', { agentId, method });

    try {
      const result = await agentRegistry.dispatch(agentId, method, args);
      const duration = Date.now() - startTime;

      experience.recordTask(agentId, {
        taskId: `dispatch-${Date.now()}`,
        taskType: method,
        outcome: OUTCOME.SUCCESS,
        duration,
        skillsUsed: [method],
        clientId,
        notes: `Dispatched by Nikita via gateway`,
      });

      logger.log(AGENT_ID, 'DISPATCH_SUCCESS', { agentId, method, duration });
      return result;
    } catch (err) {
      const duration = Date.now() - startTime;

      experience.recordTask(agentId, {
        taskId: `dispatch-${Date.now()}`,
        taskType: method,
        outcome: OUTCOME.FAIL,
        duration,
        skillsUsed: [method],
        clientId,
        notes: `Failed: ${err.message}`,
      });

      logger.log(AGENT_ID, 'DISPATCH_FAILED', { agentId, method, error: err.message });
      throw err;
    }
  }

  /**
   * Determine which workflow template to use, create it, start it, and notify Harry.
   *
   * @param {string} taskDescription — what needs to happen
   * @param {string} [clientId='clearline-markets'] — which client this is for
   * @returns {Promise<object>} The running workflow
   */
  async startWorkflow(taskDescription, clientId = 'clearline-markets') {
    logger.log(AGENT_ID, 'WORKFLOW_ROUTING', { taskDescription, clientId });

    // Determine which template to use based on the task description
    const templateName = await this._resolveWorkflowTemplate(taskDescription);

    logger.log(AGENT_ID, 'WORKFLOW_TEMPLATE_SELECTED', { templateName, taskDescription });

    // Create the workflow
    const workflow = workflowEngine.createWorkflow(templateName, clientId, taskDescription);

    // Notify Harry
    const templateNames = {
      DASHBOARD_REDESIGN: 'Dashboard Redesign',
      CLIENT_ONBOARDING: 'Client Onboarding',
      CONTENT_CAMPAIGN: 'Content Campaign',
    };

    // Workflow status saved to memory for dashboard display (not Telegram)
    logger.log(AGENT_ID, 'WORKFLOW_STARTED', {
      workflowId: workflow.workflowId,
      template: templateName,
      clientId,
      steps: workflow.steps.length,
    });

    // Run the workflow (async — doesn't block)
    const result = workflowEngine.runWorkflow(workflow.workflowId);

    return { workflow, execution: result };
  }

  /**
   * Use Nikita's brain to figure out which workflow template fits the task.
   * Falls back to keyword matching if the API is unavailable.
   * @private
   */
  async _resolveWorkflowTemplate(taskDescription) {
    const lower = taskDescription.toLowerCase();

    // Keyword-based fast path
    if (lower.includes('dashboard') || lower.includes('redesign') || lower.includes('ui') || lower.includes('frontend') || lower.includes('interface')) {
      return 'DASHBOARD_REDESIGN';
    }
    if (lower.includes('onboard') || lower.includes('new client') || lower.includes('lead') || lower.includes('prospect')) {
      return 'CLIENT_ONBOARDING';
    }
    if (lower.includes('content') || lower.includes('campaign') || lower.includes('social') || lower.includes('marketing') || lower.includes('blog')) {
      return 'CONTENT_CAMPAIGN';
    }

    // Default to dashboard redesign for now
    return 'DASHBOARD_REDESIGN';
  }

  /**
   * Dispatch tasks directly to agents (fallback when workflow isn't appropriate).
   * @private
   */
  _dispatchTasks(tasks, message) {
    for (const task of tasks) {
      const created = taskQueue.enqueue({
        assignedTo: task.assignTo,
        createdBy: AGENT_ID,
        type: message.type,
        priority: task.priority || 'MEDIUM',
        description: task.description,
      });

      // Task creation goes to dashboard, not Telegram

      const agent = agentRegistry.get(task.assignTo);
      if (agent) {
        logger.log(AGENT_ID, 'TASK_DISPATCHED', {
          taskId: created.id,
          agentId: task.assignTo,
        });
      }
    }
  }

  /**
   * Save agency status to memory for dashboard display.
   */
  async broadcastStatus() {
    const pending = taskQueue.getAll(TASK_STATUS.PENDING);
    const inProgress = taskQueue.getAll(TASK_STATUS.IN_PROGRESS);
    const completed = taskQueue.getAll(TASK_STATUS.COMPLETED);
    const failed = taskQueue.getAll(TASK_STATUS.FAILED);
    const agents = agentRegistry.list();

    // Status goes to dashboard via memory, not Telegram
    logger.log(AGENT_ID, 'STATUS_BROADCAST', {
      agents: agents.length,
      pending: pending.length,
      inProgress: inProgress.length,
      completed: completed.length,
      failed: failed.length,
    });
  }
}

const nikitaGateway = new NikitaGateway();

export { nikitaGateway };
