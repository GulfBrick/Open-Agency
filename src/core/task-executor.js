/**
 * Task Executor
 *
 * Polls the task queue for PENDING tasks and executes them via the agent registry.
 * Updates task status, records experience, and notifies Nikita when done.
 */

import { logger } from './logger.js';
import { taskQueue, TASK_STATUS } from './task-queue.js';
import { agentRegistry } from './agent-registry.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from './message-bus.js';
import { telegramNotifier } from './telegram-notifier.js';
import { experience, OUTCOME } from './experience.js';

const POLL_INTERVAL = 30_000; // 30 seconds

class TaskExecutor {
  constructor() {
    this._interval = null;
    this.running = false;
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

    logger.log('task-executor', 'POLL', { pendingCount: pending.length });

    for (const task of pending) {
      try {
        await this.executeTask(task);
      } catch (err) {
        logger.log('task-executor', 'TICK_ERROR', { taskId: task.id, error: err.message });
      }
    }
  }

  /**
   * Execute a single task.
   * @param {object} task — task from the queue
   */
  async executeTask(task) {
    const agent = agentRegistry.get(task.assignedTo);
    if (!agent) {
      logger.log('task-executor', 'AGENT_NOT_FOUND', { agentId: task.assignedTo, taskId: task.id });
      taskQueue.updateStatus(task.id, TASK_STATUS.FAILED);
      telegramNotifier.notifyTaskFailed(task, `Agent '${task.assignedTo}' not found in registry`);
      this._notifyNikita(task, TASK_STATUS.FAILED, null, `Agent not found: ${task.assignedTo}`);
      return;
    }

    // Determine which method to call based on task type
    const method = this._resolveMethod(agent, task.type);
    if (!method) {
      logger.log('task-executor', 'NO_METHOD', { agentId: task.assignedTo, taskType: task.type });
      taskQueue.updateStatus(task.id, TASK_STATUS.FAILED);
      telegramNotifier.notifyTaskFailed(task, `No suitable method for task type '${task.type}'`);
      this._notifyNikita(task, TASK_STATUS.FAILED, null, `No method for type: ${task.type}`);
      return;
    }

    // Mark IN_PROGRESS
    taskQueue.updateStatus(task.id, TASK_STATUS.IN_PROGRESS);
    const startTime = Date.now();

    try {
      const result = await agentRegistry.dispatch(task.assignedTo, method, [task]);
      const duration = Date.now() - startTime;

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

      telegramNotifier.notifyTaskCompleted(task);
      this._notifyNikita(task, TASK_STATUS.COMPLETED, result);

      logger.log('task-executor', 'TASK_COMPLETED', {
        taskId: task.id,
        agentId: task.assignedTo,
        method,
        duration,
      });
    } catch (err) {
      const duration = Date.now() - startTime;

      // Mark FAILED
      taskQueue.updateStatus(task.id, TASK_STATUS.FAILED);

      experience.recordTask(task.assignedTo, {
        taskId: task.id,
        taskType: task.type,
        outcome: OUTCOME.FAIL,
        duration,
        skillsUsed: [method],
        clientId: task.clientId || null,
        notes: `FAILED: ${err.message}`,
      });

      telegramNotifier.notifyTaskFailed(task, err.message);
      this._notifyNikita(task, TASK_STATUS.FAILED, null, err.message);

      logger.log('task-executor', 'TASK_FAILED', {
        taskId: task.id,
        agentId: task.assignedTo,
        method,
        error: err.message,
        duration,
      });
    }
  }

  /**
   * Resolve the best method to call on an agent for a given task type.
   * Tries: processTask, handleTask, processMessage, execute — in that order.
   * @private
   */
  _resolveMethod(agent, taskType) {
    // Prefer a method matching the task type directly (e.g. 'generateReport')
    if (taskType && typeof agent[taskType] === 'function') return taskType;

    // Fall back to common handler methods
    const fallbacks = ['processTask', 'handleTask', 'processMessage', 'execute'];
    for (const method of fallbacks) {
      if (typeof agent[method] === 'function') return method;
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
