/**
 * Agent Reporter
 *
 * Monitors completed tasks and formats their output into clean
 * reports for the dashboard. Reads task results from the memory
 * store (keyed as `task-result:<taskId>`) and returns formatted
 * summaries.
 */

import { taskQueue, TASK_STATUS } from './task-queue.js';
import { memory } from './memory.js';

// Agent display names for reports
const AGENT_NAMES = {
  'cfo': 'Marcus (CFO)',
  'cto': 'Zara (CTO)',
  'cmo': 'Priya (CMO)',
  'dev-lead': 'Kai (Dev Lead)',
  'sales-lead': 'Jordan (Sales)',
  'creative-director': 'Nova (Creative)',
  'client-onboarding': 'Client Onboarding',
  'frontend': 'Frontend Dev',
  'backend': 'Backend Dev',
  'fullstack': 'Fullstack Dev',
  'qa': 'QA Engineer',
  'code-review': 'Code Reviewer',
  'nikita': 'Nikita',
};

class AgentReporter {
  /**
   * Format a single completed task into a report.
   *
   * @param {string} taskId
   * @returns {{ taskId, agent, description, result, completedAt, status } | null}
   */
  reportTaskResult(taskId) {
    const task = taskQueue.getById(taskId);
    if (!task) return null;

    const result = memory.get(`task-result:${taskId}`);

    return {
      taskId: task.id,
      agent: AGENT_NAMES[task.assignedTo] || task.assignedTo,
      agentId: task.assignedTo,
      description: task.description,
      result: result?.summary || result?.output || result || null,
      status: task.status,
      priority: task.priority,
      createdAt: task.createdAt,
      completedAt: task.updatedAt,
    };
  }

  /**
   * Get the most recent completed/failed task results, formatted for display.
   *
   * @param {number} [limit=10]
   * @returns {Array<{ taskId, agent, description, result, completedAt, status }>}
   */
  getRecentResults(limit = 10) {
    const all = taskQueue.getAll();

    // Get completed + failed tasks, sorted by most recent first
    const finished = all
      .filter(t => t.status === TASK_STATUS.COMPLETED || t.status === TASK_STATUS.FAILED)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, limit);

    return finished.map(task => {
      const result = memory.get(`task-result:${task.id}`);
      return {
        taskId: task.id,
        agent: AGENT_NAMES[task.assignedTo] || task.assignedTo,
        agentId: task.assignedTo,
        description: task.description,
        result: result?.summary || result?.output || result || null,
        status: task.status,
        priority: task.priority,
        createdAt: task.createdAt,
        completedAt: task.updatedAt,
      };
    });
  }
}

const agentReporter = new AgentReporter();

export { agentReporter };
