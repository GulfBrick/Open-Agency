/**
 * Task Executor
 *
 * Polls the task queue for PENDING tasks and executes them via the agent registry.
 * Updates task status, records experience, and notifies Nikita when done.
 * Includes retry logic — tasks get 3 attempts with exponential backoff.
 */

import { logger } from './logger.js';
import { taskQueue, TASK_STATUS } from './task-queue.js';
import { agentRegistry } from './agent-registry.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from './message-bus.js';
import { experience, OUTCOME } from './experience.js';
import { memory } from './memory.js';

const POLL_INTERVAL = 15_000; // 15 seconds (was 30s — too slow for a live agency)
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 5_000; // 5s, 10s, 20s

/**
 * Maps description patterns to specific agent methods.
 * The task executor uses these to call the right domain method
 * instead of falling back to generic processMessage.
 *
 * ORDER MATTERS — first match wins. More specific patterns go first.
 */
const DESCRIPTION_METHOD_MAP = [
  // ─── Onboarding tasks (highest priority — these are the ones that were stuck) ───
  { pattern: /financial\s+health|financial\s+assessment|financial\s+plan|spending\s+threshold/i, method: 'generateDailySnapshot', argBuilder: () => [] },
  { pattern: /tech\s+stack\s+audit|technical\s+infrastructure|tech\s+audit/i, method: 'generateDailyReport', argBuilder: () => [] },
  { pattern: /brand.*assessment|market.*assessment|brand\s+positioning|market\s+landscape/i, method: 'generateDailyReport', argBuilder: () => [] },
  { pattern: /development\s+kickoff|plan\s+initial\s+sprint|priority\s+deliverables/i, method: 'createSprint', argBuilder: (task) => [_extractClientId(task), [task.description]] },
  { pattern: /sales\s+strategy|outreach\s+plan|pipeline|growth\s+opportunities/i, method: 'generateDailyReport', argBuilder: () => [] },
  { pattern: /creative\s+kickoff|brand\s+guidelines|visual\s+identity|content\s+calendar/i, method: 'generateDailyReport', argBuilder: () => [] },

  // ─── Sales team ───
  { pattern: /qualify\s+lead/i, method: 'qualifyLeadFromTask', argBuilder: (task) => [{ description: task.description }] },
  { pattern: /generate\s+proposal|create\s+proposal/i, method: 'createProposal', argBuilder: (task) => [_extractClientId(task), { scope: task.description }] },
  { pattern: /follow.?up\s+sequence|nurture\s+sequence/i, method: 'followUpSequence', argBuilder: (task) => [task.description.match(/\[(LEAD-[^\]]+)\]/)?.[1] || task.description] },

  // ─── Dev team ───
  { pattern: /create\s+sprint|sprint\s+plan/i, method: 'createSprint', argBuilder: (task) => [_extractClientId(task), [task.description]] },
  { pattern: /assign\s+task/i, method: 'assignTask', argBuilder: (task) => [task.assignedTo, task.description] },
  { pattern: /sprint\s+status|sprint\s+progress/i, method: 'getSprintStatus', argBuilder: (task) => [_extractClientId(task)] },
  { pattern: /\[TASK-/i, method: 'executeTask', argBuilder: (task) => [task] },

  // ─── Catch-all for [ONBOARDING] tags — these MUST be handled ───
  { pattern: /\[ONBOARDING\]/i, method: 'processMessage', argBuilder: (task) => [_taskToMessage(task)] },
];

/** Extract clientId from task description (looks for "Client ID: xxx") */
function _extractClientId(task) {
  const match = task.description?.match(/Client ID:\s*(\S+)/i);
  return match?.[1] || task.clientId || 'unknown';
}

/** Convert a task object into a message bus message shape for processMessage fallback */
function _taskToMessage(task) {
  return {
    id: task.id,
    from: task.createdBy || 'task-executor',
    to: task.assignedTo,
    type: task.type,
    priority: task.priority,
    payload: { description: task.description, taskId: task.id },
  };
}

class TaskExecutor {
  constructor() {
    this._interval = null;
    this.running = false;
    /** @type {Map<string, number>} taskId → retry count */
    this._retries = new Map();
    /** @type {Map<string, number>} taskId → timestamp of next retry */
    this._retryAfter = new Map();
  }

  /**
   * Begin the polling loop.
   */
  start() {
    if (this.running) return;
    this.running = true;

    // Run once immediately, then poll
    this._tick();
    this._interval = setInterval(() => this._tick(), POLL_INTERVAL);

    logger.log('task-executor', 'STARTED', { pollInterval: POLL_INTERVAL });
  }

  /**
   * Stop the polling loop.
   */
  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this.running = false;
    logger.log('task-executor', 'STOPPED', {});
  }

  /**
   * Single poll tick — grab all pending tasks and execute them.
   * @private
   */
  async _tick() {
    const pending = taskQueue.getAll(TASK_STATUS.PENDING);
    if (pending.length === 0) return;

    const now = Date.now();
    // Filter out tasks that are waiting for a retry backoff
    const ready = pending.filter(task => {
      const retryAfter = this._retryAfter.get(task.id);
      return !retryAfter || now >= retryAfter;
    });

    if (ready.length === 0) return;

    logger.log('task-executor', 'POLL', { pendingCount: pending.length, readyCount: ready.length });

    for (const task of ready) {
      try {
        await this.executeTask(task);
      } catch (err) {
        logger.log('task-executor', 'TICK_ERROR', { taskId: task.id, error: err.message });
      }
    }
  }

  /**
   * Execute a single task with retry support.
   * @param {object} task — task from the queue
   */
  async executeTask(task) {
    // Pre-dispatch validation: reject tasks for unregistered agents immediately
    const registeredIds = new Set(agentRegistry.list());
    if (!registeredIds.has(task.assignedTo)) {
      const reason = `Agent not registered: ${task.assignedTo}`;
      logger.log('task-executor', 'AGENT_NOT_REGISTERED', { agentId: task.assignedTo, taskId: task.id, reason });
      taskQueue.updateStatus(task.id, TASK_STATUS.FAILED);
      this._notifyNikita(task, TASK_STATUS.FAILED, null, reason);
      // Clean up any retry state — no point retrying an unregistered agent
      this._retries.delete(task.id);
      this._retryAfter.delete(task.id);
      return;
    }

    const agent = agentRegistry.get(task.assignedTo);
    if (!agent) {
      logger.log('task-executor', 'AGENT_NOT_FOUND', { agentId: task.assignedTo, taskId: task.id });
      taskQueue.updateStatus(task.id, TASK_STATUS.FAILED);
      this._notifyNikita(task, TASK_STATUS.FAILED, null, `Agent not found: ${task.assignedTo}`);
      return;
    }

    // Resolve the best method and arguments for this task
    let resolved = this._resolveMethod(agent, task);
    if (!resolved) {
      // Last resort: wrap as a processMessage call if agent has it
      if (typeof agent.processMessage === 'function') {
        logger.log('task-executor', 'FALLBACK_TO_PROCESS_MESSAGE', { agentId: task.assignedTo, taskId: task.id });
        resolved = { method: 'processMessage', args: [_taskToMessage(task)] };
      } else {
        logger.log('task-executor', 'NO_METHOD', { agentId: task.assignedTo, taskType: task.type, taskId: task.id });
        taskQueue.updateStatus(task.id, TASK_STATUS.FAILED);
        // Task failures go to memory + dashboard, not Telegram
        this._notifyNikita(task, TASK_STATUS.FAILED, null, `No method for type: ${task.type}`);
        return;
      }
    }

    const { method, args } = resolved;

    // Mark IN_PROGRESS
    taskQueue.updateStatus(task.id, TASK_STATUS.IN_PROGRESS);
    const startTime = Date.now();

    try {
      const result = await agentRegistry.dispatch(task.assignedTo, method, args);
      const duration = Date.now() - startTime;

      // Save the result to memory so the dashboard can see it
      memory.set(`task-result:${task.id}`, {
        taskId: task.id,
        agentId: task.assignedTo,
        method,
        result: typeof result === 'string' ? result : JSON.stringify(result),
        completedAt: new Date().toISOString(),
        duration,
      });

      // Mark DONE
      taskQueue.updateStatus(task.id, TASK_STATUS.COMPLETED);

      experience.recordTask(task.assignedTo, {
        taskId: task.id,
        taskType: task.type,
        outcome: OUTCOME.SUCCESS,
        duration,
        skillsUsed: [method],
        clientId: task.clientId || null,
        notes: task.description,
      });

      // Task results saved to memory above — dashboard shows them, no Telegram spam
      this._notifyNikita(task, TASK_STATUS.COMPLETED, result);

      // Clean up retry state
      this._retries.delete(task.id);
      this._retryAfter.delete(task.id);

      logger.log('task-executor', 'TASK_COMPLETED', {
        taskId: task.id,
        agentId: task.assignedTo,
        method,
        duration,
      });
    } catch (err) {
      const duration = Date.now() - startTime;
      const attempt = (this._retries.get(task.id) || 0) + 1;

      if (attempt < MAX_RETRIES) {
        // Retry with exponential backoff
        const delay = BASE_RETRY_DELAY * Math.pow(2, attempt - 1);
        this._retries.set(task.id, attempt);
        this._retryAfter.set(task.id, Date.now() + delay);

        // Put back to PENDING for retry
        taskQueue.updateStatus(task.id, TASK_STATUS.PENDING);

        logger.log('task-executor', 'TASK_RETRY_SCHEDULED', {
          taskId: task.id,
          agentId: task.assignedTo,
          attempt,
          maxRetries: MAX_RETRIES,
          retryInMs: delay,
          error: err.message,
        });
      } else {
        // All retries exhausted — mark FAILED permanently
        taskQueue.updateStatus(task.id, TASK_STATUS.FAILED);

        // Save failure to memory so the dashboard can display it
        memory.set(`task-result:${task.id}`, {
          taskId: task.id,
          agentId: task.assignedTo,
          method,
          result: null,
          error: `Failed after ${MAX_RETRIES} attempts: ${err.message}`,
          completedAt: new Date().toISOString(),
          duration,
          status: 'FAILED',
        });

        experience.recordTask(task.assignedTo, {
          taskId: task.id,
          taskType: task.type,
          outcome: OUTCOME.FAIL,
          duration,
          skillsUsed: [method],
          clientId: task.clientId || null,
          notes: `FAILED after ${MAX_RETRIES} attempts: ${err.message}`,
        });

        // Task failures go to memory + dashboard, not Telegram
        this._notifyNikita(task, TASK_STATUS.FAILED, null, err.message);

        // Clean up retry state
        this._retries.delete(task.id);
        this._retryAfter.delete(task.id);

        logger.log('task-executor', 'TASK_FAILED', {
          taskId: task.id,
          agentId: task.assignedTo,
          method,
          error: err.message,
          duration,
          attempts: MAX_RETRIES,
        });
      }
    }
  }

  /**
   * Resolve the best method to call on an agent for a given task.
   *
   * Resolution order:
   *   1. Match task description against DESCRIPTION_METHOD_MAP patterns
   *   2. Match task type as a direct method name (e.g. 'generateReport')
   *   3. Try domain-specific methods: executeTask, processTask, handleTask
   *   4. Fall back to processMessage
   *
   * @private
   * @param {object} agent — the agent instance
   * @param {object} task — the full task object
   * @returns {{ method: string, args: any[] }|null}
   */
  _resolveMethod(agent, task) {
    const description = task.description || '';

    // 1. Match description patterns to specific methods
    for (const mapping of DESCRIPTION_METHOD_MAP) {
      if (mapping.pattern.test(description) && typeof agent[mapping.method] === 'function') {
        return { method: mapping.method, args: mapping.argBuilder(task) };
      }
    }

    // 2. Match task type as a direct method name
    if (task.type && typeof agent[task.type] === 'function') {
      return { method: task.type, args: [task] };
    }

    // 3. Try domain-specific handler methods
    const domainMethods = ['executeTask', 'processTask', 'handleTask'];
    for (const method of domainMethods) {
      if (typeof agent[method] === 'function') {
        return { method, args: [task] };
      }
    }

    // 4. Fall back to processMessage (wraps the task as a message)
    if (typeof agent.processMessage === 'function') {
      const message = {
        id: task.id,
        from: task.createdBy || 'task-executor',
        to: task.assignedTo,
        type: task.type,
        priority: task.priority,
        payload: { description: task.description, taskId: task.id },
      };
      return { method: 'processMessage', args: [message] };
    }

    return null;
  }

  /**
   * Notify Nikita via the message bus that a task has completed or failed.
   * @private
   */
  _notifyNikita(task, status, result = null, error = null) {
    messageBus.send({
      from: 'task-executor',
      to: 'nikita',
      type: MESSAGE_TYPES.REPORT,
      priority: status === TASK_STATUS.FAILED ? PRIORITY.HIGH : PRIORITY.MEDIUM,
      payload: {
        event: 'TASK_RESULT',
        taskId: task.id,
        agentId: task.assignedTo,
        status,
        result: result ?? undefined,
        error: error ?? undefined,
      },
    });
  }
}

const taskExecutor = new TaskExecutor();

export { taskExecutor };
