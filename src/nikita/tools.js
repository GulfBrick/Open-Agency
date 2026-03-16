/**
 * Nikita's Tools — The things she can actually DO.
 *
 * Each tool wraps a real system in the agency. When Nikita decides to use
 * a tool, the agentic loop executes it and feeds the result back so she
 * can chain decisions.
 *
 * This is what makes her Jarvis, not a chatbot.
 */

import { taskQueue, TASK_STATUS } from '../core/task-queue.js';
import { agentRegistry } from '../core/agent-registry.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../core/message-bus.js';
import { memory } from '../core/memory.js';
import { experience } from '../core/experience.js';
import { businessKnowledge } from '../core/business-knowledge.js';
import { workflowEngine } from '../core/workflow-engine.js';
import { telegramNotifier } from '../core/telegram-notifier.js';
import { scheduler } from '../core/scheduler.js';
import { logger } from '../core/logger.js';

// ─── Tool Definitions (JSON Schema for Claude API) ──────────────

export const TOOL_DEFINITIONS = [
  {
    name: 'delegate_to_agent',
    description: 'Assign a task to a specific agent. The task goes into the queue and the agent will execute it. Use this whenever work needs to be done — you never do the work yourself.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'Agent ID: cfo, cto, cmo, dev-lead, architect, frontend, backend, fullstack, qa, code-review, sales-lead, closer, lead-qualifier, follow-up, proposal, creative-director, designer, video-editor, social-media, copywriter',
        },
        task_description: {
          type: 'string',
          description: 'Clear description of what the agent should do',
        },
        priority: {
          type: 'string',
          enum: ['HIGH', 'MEDIUM', 'LOW'],
          description: 'Task priority',
        },
      },
      required: ['agent_id', 'task_description'],
    },
  },
  {
    name: 'get_task_status',
    description: 'Check the status of tasks in the queue. Can filter by agent, status, or get all.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Filter by agent ID (optional)' },
        status: { type: 'string', enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'], description: 'Filter by status (optional)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
    },
  },
  {
    name: 'get_task_result',
    description: 'Get the result of a completed task by task ID.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The task ID' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'get_financials',
    description: 'Get the current financial state — revenue, expenses, cash position, invoices, budgets.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_system_health',
    description: 'Get the technical infrastructure status — services, uptime, security, tech debt.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_marketing_status',
    description: 'Get marketing metrics — campaigns, content calendar, SEO rankings, spend.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_client_info',
    description: 'Get information about a specific client or list all clients.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client ID (omit to list all clients)' },
      },
    },
  },
  {
    name: 'get_agent_performance',
    description: 'Check an agent\'s performance stats — tasks completed, success rate, skills.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent ID to check' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'start_workflow',
    description: 'Launch a multi-step workflow involving multiple agents. Templates: DASHBOARD_REDESIGN, CLIENT_ONBOARDING, CONTENT_CAMPAIGN.',
    input_schema: {
      type: 'object',
      properties: {
        template: { type: 'string', enum: ['DASHBOARD_REDESIGN', 'CLIENT_ONBOARDING', 'CONTENT_CAMPAIGN'], description: 'Workflow template name' },
        client_id: { type: 'string', description: 'Client this workflow is for' },
        brief: { type: 'string', description: 'Project brief / description' },
      },
      required: ['template', 'client_id', 'brief'],
    },
  },
  {
    name: 'get_workflow_status',
    description: 'Check the status of active workflows.',
    input_schema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string', description: 'Specific workflow ID (omit to list all)' },
      },
    },
  },
  {
    name: 'notify_harry',
    description: 'Send a Telegram message to Harry (the human controller). Use for important updates, escalations, or proactive alerts.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message to send to Harry' },
      },
      required: ['message'],
    },
  },
  {
    name: 'onboard_client',
    description: 'Run the full client onboarding pipeline — collect brief, assign team, create tasks, generate welcome report.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Unique client slug (e.g. acme-corp)' },
        company_name: { type: 'string', description: 'Company name' },
        industry: { type: 'string', description: 'Industry sector' },
        main_challenges: { type: 'array', items: { type: 'string' }, description: 'Key challenges' },
        goals: { type: 'array', items: { type: 'string' }, description: 'Business goals' },
        budget_monthly: { type: 'number', description: 'Monthly budget in GBP' },
      },
      required: ['client_id', 'company_name'],
    },
  },
  {
    name: 'get_agency_overview',
    description: 'Get a full snapshot of the agency — all agents, tasks, clients, financials, workflows in one view.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'record_revenue',
    description: 'Record revenue from a client payment.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        amount: { type: 'number', description: 'Amount in GBP' },
        description: { type: 'string' },
      },
      required: ['client_id', 'amount', 'description'],
    },
  },
  {
    name: 'record_expense',
    description: 'Record a business expense.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'e.g. infrastructure, marketing, salary, tools' },
        department: { type: 'string' },
        amount: { type: 'number', description: 'Amount in GBP' },
        description: { type: 'string' },
      },
      required: ['category', 'amount', 'description'],
    },
  },
];

// ─── Tool Executors ─────────────────────────────────────────────

const executors = {
  async delegate_to_agent({ agent_id, task_description, priority = 'MEDIUM' }) {
    const agent = agentRegistry.get(agent_id);
    if (!agent) return { error: `Agent '${agent_id}' not found in registry` };

    const task = taskQueue.enqueue({
      assignedTo: agent_id,
      createdBy: 'nikita',
      type: MESSAGE_TYPES.TASK,
      priority,
      description: task_description,
    });

    logger.log('nikita', 'TOOL_DELEGATE', { agentId: agent_id, taskId: task.id, priority });

    return {
      success: true,
      task_id: task.id,
      assigned_to: agent_id,
      priority,
      status: task.status,
      message: `Task created and assigned to ${agent_id}. It will be picked up by the task executor.`,
    };
  },

  async get_task_status({ agent_id, status, limit = 10 }) {
    let tasks = taskQueue.getAll();
    if (agent_id) tasks = tasks.filter(t => t.assignedTo === agent_id);
    if (status) tasks = tasks.filter(t => t.status === status);

    const results = tasks.slice(-limit).map(t => ({
      id: t.id,
      assignedTo: t.assignedTo,
      status: t.status,
      priority: t.priority,
      description: t.description?.substring(0, 120),
      createdAt: t.createdAt,
    }));

    const summary = {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'PENDING').length,
      inProgress: tasks.filter(t => t.status === 'IN_PROGRESS').length,
      completed: tasks.filter(t => t.status === 'COMPLETED').length,
      failed: tasks.filter(t => t.status === 'FAILED').length,
    };

    return { summary, tasks: results };
  },

  async get_task_result({ task_id }) {
    const task = taskQueue.getById(task_id);
    if (!task) return { error: `Task '${task_id}' not found` };

    const result = memory.get(`task-result:${task_id}`);
    return {
      task_id,
      status: task.status,
      assignedTo: task.assignedTo,
      description: task.description,
      result: result || null,
    };
  },

  async get_financials() {
    const fin = memory.get('cfo:financials');
    if (!fin) return { message: 'No financial data yet. Delegate a financial assessment to the CFO.' };

    return {
      revenue: fin.revenue,
      expenses: fin.expenses,
      cashPosition: fin.cashPosition,
      invoices: {
        pending: fin.invoices?.pending?.length || 0,
        overdue: fin.invoices?.overdue?.length || 0,
        paid: fin.invoices?.paid?.length || 0,
      },
      budgets: fin.budgets || {},
    };
  },

  async get_system_health() {
    const state = memory.get('cto:techState');
    if (!state) return { message: 'No tech state data. Delegate a tech audit to the CTO.' };

    const services = Object.values(state.services || {});
    return {
      services: {
        total: services.length,
        healthy: services.filter(s => s.status === 'HEALTHY').length,
        down: services.filter(s => s.status === 'DOWN').length,
      },
      infrastructure: state.infrastructure,
      security: {
        openVulnerabilities: state.security?.openVulnerabilities || 0,
        openIncidents: state.security?.incidentHistory?.filter(i => i.status === 'open').length || 0,
      },
      techDebt: state.techDebt?.filter(t => t.status === 'open').length || 0,
    };
  },

  async get_marketing_status() {
    const mkt = memory.get('cmo:marketing');
    if (!mkt) return { message: 'No marketing data. Delegate a brand assessment to the CMO.' };

    return {
      campaigns: {
        total: mkt.campaigns?.length || 0,
        active: mkt.campaigns?.filter(c => c.status === 'ACTIVE').length || 0,
      },
      metrics: mkt.metrics,
      upcomingContent: mkt.contentCalendar?.filter(c => c.status === 'scheduled').length || 0,
      trackedKeywords: mkt.seo?.trackedKeywords?.length || 0,
    };
  },

  async get_client_info({ client_id }) {
    if (!client_id) {
      const clients = businessKnowledge.listClients();
      return { clients: clients.map(c => ({ id: c.clientId, name: c.name, status: c.status })) };
    }

    const context = businessKnowledge.getClientContext(client_id);
    const team = memory.get(`client:${client_id}:team`);
    return {
      client_id,
      overview: context.overview || null,
      preferences: context.preferences || null,
      team: team?.allAgents?.map(a => ({ id: a.agentId, name: a.name, role: a.role })) || [],
    };
  },

  async get_agent_performance({ agent_id }) {
    const stats = experience.getStats(agent_id);
    const agent = agentRegistry.get(agent_id);
    return {
      agent_id,
      registered: !!agent,
      totalTasks: stats.totalTasks,
      successRate: stats.successRate,
      avgDuration: stats.avgDuration,
      escalationRate: stats.escalationRate,
      skillBreakdown: stats.skillBreakdown,
    };
  },

  async start_workflow({ template, client_id, brief }) {
    try {
      const workflow = workflowEngine.createWorkflow(template, client_id, brief);
      // Start it async — don't block
      workflowEngine.runWorkflow(workflow.workflowId).catch(err => {
        logger.log('nikita', 'WORKFLOW_RUN_ERROR', { workflowId: workflow.workflowId, error: err.message });
      });

      return {
        success: true,
        workflow_id: workflow.workflowId,
        name: workflow.name,
        steps: workflow.steps.length,
        agents: [...new Set(workflow.steps.flatMap(s => s.agents))],
      };
    } catch (err) {
      return { error: err.message };
    }
  },

  async get_workflow_status({ workflow_id }) {
    if (!workflow_id) {
      const all = workflowEngine.listWorkflows();
      return {
        workflows: all.map(w => ({
          id: w.workflowId,
          name: w.name,
          status: w.status,
          clientId: w.clientId,
          stepsCompleted: w.steps?.filter(s => s.status === 'DONE').length || 0,
          stepsTotal: w.steps?.length || 0,
        })),
      };
    }

    const wf = workflowEngine.getWorkflowStatus(workflow_id);
    if (!wf) return { error: `Workflow '${workflow_id}' not found` };
    return wf;
  },

  async notify_harry({ message }) {
    await telegramNotifier.sendMessage(message);
    logger.log('nikita', 'TOOL_NOTIFY_HARRY', { length: message.length });
    return { sent: true };
  },

  async onboard_client({ client_id, company_name, industry, main_challenges, goals, budget_monthly }) {
    try {
      const { clientOnboarding } = await import('../core/client-onboarding.js');
      const result = clientOnboarding.runFullOnboarding(client_id, {
        companyName: company_name,
        industry: industry || null,
        mainChallenges: main_challenges || [],
        goals: goals || [],
        budget: budget_monthly ? { monthly: budget_monthly, currency: 'GBP' } : null,
      });

      return {
        success: true,
        client_id,
        company_name,
        teamSize: result.team.allAgents.length,
        tasksCreated: result.tasks.length,
        onboardingStatus: 'complete',
      };
    } catch (err) {
      return { error: err.message };
    }
  },

  async get_agency_overview() {
    const agents = agentRegistry.list();
    const allTasks = taskQueue.getAll();
    const clients = businessKnowledge.listClients();
    const workflows = workflowEngine.listWorkflows();
    const fin = memory.get('cfo:financials');

    return {
      agents: { online: agents.length, list: agents },
      tasks: {
        pending: allTasks.filter(t => t.status === 'PENDING').length,
        inProgress: allTasks.filter(t => t.status === 'IN_PROGRESS').length,
        completed: allTasks.filter(t => t.status === 'COMPLETED').length,
        failed: allTasks.filter(t => t.status === 'FAILED').length,
      },
      clients: clients.map(c => ({ id: c.clientId, name: c.name, status: c.status })),
      workflows: {
        active: workflows.filter(w => w.status === 'RUNNING' || w.status === 'WAITING_APPROVAL').length,
        total: workflows.length,
      },
      financials: fin ? {
        revenue: fin.revenue?.total || 0,
        expenses: fin.expenses?.total || 0,
        cash: fin.cashPosition || 0,
      } : null,
    };
  },

  async record_revenue({ client_id, amount, description }) {
    const { cfoBrain } = await import('../agents/cfo/brain.js');
    const result = cfoBrain.recordRevenue(client_id, amount, description);
    return { success: true, newTotal: result.total, client_id, amount };
  },

  async record_expense({ category, department, amount, description }) {
    const { cfoBrain } = await import('../agents/cfo/brain.js');
    const result = cfoBrain.recordExpense(category, department || 'general', amount, description);
    return result;
  },
};

// ─── Tool Executor ──────────────────────────────────────────────

/**
 * Execute a tool by name with the given input.
 * @param {string} toolName
 * @param {object} input
 * @returns {Promise<string>} JSON string result
 */
export async function executeTool(toolName, input) {
  const executor = executors[toolName];
  if (!executor) {
    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }

  try {
    const result = await executor(input);
    return JSON.stringify(result);
  } catch (err) {
    logger.log('nikita', 'TOOL_ERROR', { tool: toolName, error: err.message });
    return JSON.stringify({ error: err.message });
  }
}
