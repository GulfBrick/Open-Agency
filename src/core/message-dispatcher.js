/**
 * Message Dispatcher
 *
 * Analyses incoming messages for intent and dispatches real work
 * to the appropriate agents via the task queue.
 *
 * Intent detection uses keyword matching against agent domains.
 * Each matched intent creates a HIGH-priority task assigned to
 * the responsible agent.
 */

import { taskQueue, PRIORITY } from './task-queue.js';
import { logger } from './logger.js';

// ─── Intent → Agent Mapping ──────────────────────────────────
//
// Each entry: { agentId, agentName, keywords[] }
// Keywords are matched case-insensitively against the message.

const INTENT_MAP = [
  {
    agentId: 'cfo',
    agentName: 'Marcus (CFO)',
    keywords: ['financial', 'money', 'revenue', 'profit', 'expenses', 'budget', 'p&l', 'invoice', 'cash flow', 'forecast'],
  },
  {
    agentId: 'cto',
    agentName: 'Zara (CTO)',
    keywords: ['tech', 'infrastructure', 'server', 'code', 'bug', 'deploy', 'security', 'database', 'api', 'uptime'],
  },
  {
    agentId: 'cmo',
    agentName: 'Priya (CMO)',
    keywords: ['marketing', 'content', 'social', 'brand', 'campaign', 'seo', 'analytics', 'engagement', 'audience'],
  },
  {
    agentId: 'dev-lead',
    agentName: 'Kai (Dev Lead)',
    keywords: ['sprint', 'task', 'build', 'feature', 'develop', 'frontend', 'backend', 'release', 'roadmap'],
  },
  {
    agentId: 'sales-lead',
    agentName: 'Jordan (Sales)',
    keywords: ['lead', 'sales', 'prospect', 'pipeline', 'deal', 'close', 'proposal', 'client acquisition'],
  },
  {
    agentId: 'creative-director',
    agentName: 'Nova (Creative)',
    keywords: ['design', 'creative', 'logo', 'visual', 'copy', 'video', 'branding', 'graphics'],
  },
  {
    agentId: 'client-onboarding',
    agentName: 'Client Onboarding',
    keywords: ['onboard', 'new client', 'intake', 'welcome pack', 'client setup'],
  },
];

class MessageDispatcher {
  /**
   * Analyse a message and dispatch tasks to matched agents.
   *
   * @param {string} message - The user's message
   * @param {string} [clientId='general'] - Client context
   * @returns {{ dispatched: boolean, agents: string[], taskIds: string[], summary: string }}
   */
  dispatch(message, clientId = 'general') {
    const lower = message.toLowerCase();
    const matched = [];

    for (const intent of INTENT_MAP) {
      const hit = intent.keywords.some(kw => lower.includes(kw));
      if (hit) {
        matched.push(intent);
      }
    }

    if (matched.length === 0) {
      return {
        dispatched: false,
        agents: [],
        taskIds: [],
        summary: 'No specific agent task needed',
      };
    }

    const agents = [];
    const taskIds = [];

    for (const intent of matched) {
      const task = taskQueue.enqueue({
        assignedTo: intent.agentId,
        createdBy: 'nikita',
        type: 'MESSAGE_DISPATCH',
        priority: PRIORITY.HIGH,
        description: message,
      });

      agents.push(intent.agentName);
      taskIds.push(task.id);

      logger.log('dispatcher', 'TASK_DISPATCHED', {
        agentId: intent.agentId,
        agentName: intent.agentName,
        taskId: task.id,
        clientId,
        messagePreview: message.substring(0, 100),
      });
    }

    const agentList = agents.join(', ');
    const summary = agents.length === 1
      ? `Dispatched to ${agents[0]}`
      : `Dispatched to ${agents.length} agents: ${agentList}`;

    return {
      dispatched: true,
      agents,
      taskIds,
      summary,
    };
  }
}

const messageDispatcher = new MessageDispatcher();

export { messageDispatcher };
