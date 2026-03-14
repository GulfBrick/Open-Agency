/**
 * Dashboard Server
 *
 * Express server for the Open Claw Agency dashboard.
 * Serves on port 3001, provides API endpoints for agency status,
 * agent data, client data, logs, and manual task triggering.
 */

import express from 'express';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../core/logger.js';
import { memory } from '../core/memory.js';
import { agentRegistry } from '../core/agent-registry.js';
import { agentProfile } from '../core/agent-profile.js';
import { experience } from '../core/experience.js';
import { businessKnowledge } from '../core/business-knowledge.js';
import { taskQueue } from '../core/task-queue.js';
import { scheduler } from '../core/scheduler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3001;

function createDashboardServer() {
  const app = express();
  app.use(express.json());

  // ─── Serve Dashboard HTML ──────────────────────────────────

  app.get('/', (req, res) => {
    const htmlPath = join(__dirname, 'index.html');
    try {
      const html = readFileSync(htmlPath, 'utf-8');
      res.type('html').send(html);
    } catch (err) {
      res.status(500).send('Dashboard HTML not found');
    }
  });

  // ─── API: Full Agency Status ───────────────────────────────

  app.get('/api/status', (req, res) => {
    try {
      const agents = _getAgentList();
      const clients = _getClientList();
      const pipeline = _getPipelineData();
      const finances = _getFinancialData();
      const activeSprints = _getSprintData();
      const recentLogs = logger.getRecentLogs(20);
      const systemHealth = _getSystemHealth();

      res.json({
        agents,
        clients,
        pipeline,
        finances,
        activeSprints,
        recentLogs,
        systemHealth,
      });
    } catch (err) {
      logger.log('dashboard', 'STATUS_ERROR', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  // ─── API: Agent List ───────────────────────────────────────

  app.get('/api/agents', (req, res) => {
    try {
      res.json(_getAgentList());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── API: Client List ──────────────────────────────────────

  app.get('/api/clients', (req, res) => {
    try {
      res.json(_getClientList());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── API: Recent Logs ──────────────────────────────────────

  app.get('/api/logs', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      res.json(logger.getRecentLogs(limit));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── API: Schedules ────────────────────────────────────────

  app.get('/api/schedules', (req, res) => {
    try {
      res.json(scheduler.listSchedules());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── API: Manually Trigger a Task ──────────────────────────

  app.post('/api/task', async (req, res) => {
    const { agentId, method, args, clientId } = req.body;

    if (!agentId || !method) {
      return res.status(400).json({ error: 'agentId and method are required' });
    }

    logger.log('dashboard', 'MANUAL_TASK', { agentId, method, clientId });

    try {
      const result = await agentRegistry.dispatch(agentId, method, args || []);
      res.json({ success: true, agentId, method, result });
    } catch (err) {
      logger.log('dashboard', 'MANUAL_TASK_FAILED', { agentId, method, error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─── API: Trigger Schedule Now ─────────────────────────────

  app.post('/api/schedules/:name/run', async (req, res) => {
    const { name } = req.params;

    try {
      const result = await scheduler.runNow(name);
      res.json({ success: true, schedule: name, result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─── Data Assembly Helpers ─────────────────────────────────

  function _getAgentList() {
    const registeredIds = agentRegistry.list();
    const profiles = agentProfile.listAgents();

    // Build a combined list from both registry and profiles
    const agentMap = new Map();

    // Start with registered agents (runtime)
    for (const id of registeredIds) {
      const stats = experience.getStats(id);
      agentMap.set(id, {
        id,
        name: _agentDisplayName(id),
        role: _agentRole(id),
        status: 'ONLINE',
        tasksCompleted: stats.totalTasks,
        successRate: stats.successRate,
        rank: null,
      });
    }

    // Overlay profile data (persistent)
    for (const profile of profiles) {
      const existing = agentMap.get(profile.agentId);
      if (existing) {
        existing.rank = profile.rank;
        existing.name = profile.name;
        existing.role = profile.role;
      } else {
        const stats = experience.getStats(profile.agentId);
        agentMap.set(profile.agentId, {
          id: profile.agentId,
          name: profile.name,
          role: profile.role,
          status: profile.status,
          tasksCompleted: stats.totalTasks,
          successRate: stats.successRate,
          rank: profile.rank,
        });
      }
    }

    return [...agentMap.values()];
  }

  function _getClientList() {
    const clients = businessKnowledge.listClients();
    return clients.map(client => {
      const context = businessKnowledge.getClientContext(client.clientId);
      const registeredAgents = agentRegistry.list();

      return {
        id: client.clientId,
        name: client.name,
        status: client.status,
        activeAgents: registeredAgents.length,
        lastActivity: context.overview?.createdAt || null,
        industry: context.overview?.industry || null,
      };
    });
  }

  function _getPipelineData() {
    const salesState = memory.get('sales-lead:state');
    if (!salesState) {
      return { total: 0, hot: 0, warm: 0, cold: 0, wonThisMonth: 0 };
    }

    const pipeline = salesState.pipeline || [];
    const hot = pipeline.filter(d =>
      d.stage === 'NEGOTIATION' || d.stage === 'PROPOSAL'
    ).length;
    const warm = pipeline.filter(d =>
      d.stage === 'DISCOVERY' || d.stage === 'QUALIFIED'
    ).length;
    const cold = pipeline.filter(d => d.stage === 'LEAD').length;

    // Won this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const wonThisMonth = (salesState.closedDeals || []).filter(d =>
      new Date(d.closedAt) >= monthStart
    ).length;

    return {
      total: pipeline.length,
      hot,
      warm,
      cold,
      wonThisMonth,
      totalRevenue: salesState.metrics?.totalRevenue || 0,
    };
  }

  function _getFinancialData() {
    const fin = memory.get('cfo:financials');
    if (!fin) {
      return { revenue: 0, expenses: 0, profit: 0, cashPosition: 0 };
    }

    return {
      revenue: fin.revenue?.total || 0,
      expenses: fin.expenses?.total || 0,
      profit: (fin.revenue?.total || 0) - (fin.expenses?.total || 0),
      cashPosition: fin.cashPosition || 0,
      pendingInvoices: fin.invoices?.pending?.length || 0,
      overdueInvoices: fin.invoices?.overdue?.length || 0,
    };
  }

  function _getSprintData() {
    const devState = memory.get('dev-lead:state');
    if (!devState || !devState.currentSprint) return [];

    const sprint = devState.currentSprint;
    return [{
      clientId: sprint.clientId,
      sprintName: sprint.name,
      status: sprint.status,
      tasksInProgress: sprint.metrics?.inProgress || 0,
      tasksDone: sprint.metrics?.completed || 0,
      totalTasks: sprint.metrics?.totalTasks || 0,
      blockers: sprint.metrics?.blocked || 0,
    }];
  }

  function _getSystemHealth() {
    const bootCount = memory.get('bootCount') || 0;
    const lastBoot = memory.get('lastBoot') || null;
    const lastBriefing = memory.get('lastBriefing') || null;

    const uptime = lastBoot
      ? Math.round((Date.now() - new Date(lastBoot).getTime()) / 1000)
      : 0;

    return {
      uptime,
      uptimeFormatted: _formatUptime(uptime),
      bootCount,
      lastBriefing: lastBriefing?.generatedAt || null,
      schedulerActive: scheduler.listSchedules().length > 0,
      registeredAgents: agentRegistry.list().length,
    };
  }

  function _formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  }

  function _agentDisplayName(id) {
    const names = {
      'nikita': 'Nikita', 'cfo': 'Marcus (CFO)', 'cto': 'Zara (CTO)',
      'cmo': 'Priya (CMO)', 'dev-lead': 'Kai (Dev Lead)',
      'architect': 'Architect Bot', 'frontend': 'Frontend Dev',
      'backend': 'Backend Dev', 'fullstack': 'Fullstack Dev',
      'qa': 'QA Engineer', 'code-review': 'Code Reviewer',
      'sales-lead': 'Jordan (Sales)', 'closer': 'Closer Bot',
      'lead-qualifier': 'Lead Qualifier', 'follow-up': 'Follow-Up Bot',
      'proposal': 'Proposal Bot', 'creative-director': 'Nova (Creative)',
      'designer': 'Iris (Designer)', 'video-editor': 'Finn (Video)',
      'social-media': 'Jade (Social)', 'copywriter': 'Ash (Copy)',
    };
    return names[id] || id;
  }

  function _agentRole(id) {
    const roles = {
      'nikita': 'Owner / CEO', 'cfo': 'CFO', 'cto': 'CTO', 'cmo': 'CMO',
      'dev-lead': 'Dev Team Lead', 'architect': 'Architect',
      'frontend': 'Frontend Dev', 'backend': 'Backend Dev',
      'fullstack': 'Fullstack Dev', 'qa': 'QA Engineer',
      'code-review': 'Code Reviewer', 'sales-lead': 'Sales Lead',
      'closer': 'Closer', 'lead-qualifier': 'Lead Qualifier',
      'follow-up': 'Follow-Up', 'proposal': 'Proposal Writer',
      'creative-director': 'Creative Director', 'designer': 'Designer',
      'video-editor': 'Video Editor', 'social-media': 'Social Media',
      'copywriter': 'Copywriter',
    };
    return roles[id] || 'Agent';
  }

  // ─── Start Server ──────────────────────────────────────────

  function start() {
    return new Promise((resolve) => {
      const server = app.listen(PORT, () => {
        logger.log('dashboard', 'SERVER_STARTED', { port: PORT });
        console.log(`  Dashboard ........... http://localhost:${PORT}`);
        resolve(server);
      });
    });
  }

  return { app, start };
}

export { createDashboardServer };
