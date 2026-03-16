import { randomUUID } from 'crypto';
import { logger } from './logger.js';

const PRIORITY = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
};

const PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const TASK_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
};

class TaskQueue {
  constructor() {
    this.tasks = new Map();
  }

  /**
   * Add a task to the queue.
   * @param {{ assignedTo: string, createdBy: string, type: string, priority?: string, description: string }} opts
   * @returns {object} The created task
   */
  enqueue({ assignedTo, createdBy, type, priority = PRIORITY.MEDIUM, description }) {
    const task = {
      id: randomUUID(),
      assignedTo,
      createdBy,
      type,
      priority,
      description,
      status: TASK_STATUS.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.tasks.set(task.id, task);
    logger.log(createdBy, 'TASK_CREATED', {
      taskId: task.id,
      assignedTo,
      type,
      priority,
      description,
    });

    return task;
  }

  /**
   * Dequeue the highest-priority pending task.
   * @param {string} [agentId] - Optionally dequeue only tasks for a specific agent
   * @returns {object|null} The task, or null if none available
   */
  dequeue(agentId) {
    const pending = this._getPendingSorted(agentId);
    if (pending.length === 0) return null;

    const task = pending[0];
    task.status = TASK_STATUS.IN_PROGRESS;
    task.updatedAt = new Date().toISOString();

    logger.log(task.assignedTo, 'TASK_DEQUEUED', { taskId: task.id });
    return task;
  }

  /**
   * Peek at the highest-priority pending task without removing it.
   * @param {string} [agentId]
   * @returns {object|null}
   */
  peek(agentId) {
    const pending = this._getPendingSorted(agentId);
    return pending.length > 0 ? pending[0] : null;
  }

  /**
   * Get all tasks for a specific agent.
   * @param {string} agentId
   * @returns {object[]}
   */
  getByAgent(agentId) {
    return Array.from(this.tasks.values()).filter(t => t.assignedTo === agentId);
  }

  /**
   * Update the status of a task.
   * @param {string} taskId
   * @param {string} status
   * @returns {object|null} The updated task
   */
  updateStatus(taskId, status) {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    task.status = status;
    task.updatedAt = new Date().toISOString();

    logger.log(task.assignedTo, 'TASK_STATUS_UPDATED', { taskId, status });
    return task;
  }

  /**
   * Get a task by ID.
   * @param {string} taskId
   * @returns {object|null}
   */
  getById(taskId) {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Get all tasks, optionally filtered by status.
   * @param {string} [status]
   * @returns {object[]}
   */
  getAll(status) {
    const all = Array.from(this.tasks.values());
    if (status) return all.filter(t => t.status === status);
    return all;
  }

  /**
   * Remove all FAILED tasks from the queue.
   * @returns {number} Number of tasks removed
   */
  clearFailed() {
    let removed = 0;
    for (const [id, task] of this.tasks) {
      if (task.status === TASK_STATUS.FAILED) {
        this.tasks.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      logger.log('task-queue', 'CLEARED_FAILED', { removed });
    }
    return removed;
  }

  /**
   * Get pending tasks sorted by priority.
   * @private
   */
  _getPendingSorted(agentId) {
    let pending = Array.from(this.tasks.values()).filter(
      t => t.status === TASK_STATUS.PENDING,
    );
    if (agentId) {
      pending = pending.filter(t => t.assignedTo === agentId);
    }
    pending.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    return pending;
  }
}

const taskQueue = new TaskQueue();

export { taskQueue, PRIORITY, TASK_STATUS };
