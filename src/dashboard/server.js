/**
 * Dashboard Server
 *
 * Express server for the Open Agency dashboard.
 * Serves on port 3001, provides API endpoints for agency status,
 * agent data, client data, logs, and manual task triggering.
 */

import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { logger } from '../core/logger.js';
import { memory } from '../core/memory.js';
import { agentRegistry } from '../core/agent-registry.js';
import { agentProfile } from '../core/agent-profile.js';
import { experience } from '../core/experience.js';
import { businessKnowledge } from '../core/business-knowledge.js';
import { taskQueue } from '../core/task-queue.js';
import { scheduler } from '../core/scheduler.js';
import { mountOnboardingRoutes } from '../core/client-onboarding-api.js';
import { workflowEngine } from '../core/workflow-engine.js';
import { nikitaConversation } from '../core/nikita-conversation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3001;

function createDashboardServer() {
  const app = express();
  app.use(cors({
    origin: function (origin, callback) {
      const allowed = [
        'https://oagencyconsulting.com',
        'https://www.oagencyconsulting.com',
        'http://localhost:3000',
        'http://localhost:3001',
      ];
      // Allow Vercel preview/production deployments
      if (!origin || allowed.includes(origin) || /\.vercel\.app$/.test(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'X-API-Key'],
  }));
  app.use(express.json());
  app.use('/assets', express.static(join(__dirname, 'assets')));

  // ─── API Key Authentication Middleware ──────────────────────
  //
  // Protects all /api/* routes except explicitly exempted ones.
  // Checks X-API-Key header against OPEN_AGENCY_API_KEY env var.

  const EXEMPT_ROUTES = new Set(['/api/health', '/api/config/public']);

  function apiKeyAuth(req, res, next) {
    // Only apply to /api/* routes
    if (!req.path.startsWith('/api/')) return next();

    // Exempt specific public endpoints
    if (EXEMPT_ROUTES.has(req.path)) return next();

    const apiKey = process.env.OPEN_AGENCY_API_KEY;
    const provided = req.headers['x-api-key'];

    if (!apiKey) {
      // No key configured — allow all (local dev mode)
      return next();
    }

    if (!provided) {
      logger.log('dashboard', 'AUTH_FAILED', { reason: 'missing_key', ip: req.ip, path: req.path });
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(apiKey);
    if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      logger.log('dashboard', 'AUTH_FAILED', { reason: 'invalid_key', ip: req.ip, path: req.path });
      return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
  }

  app.use(apiKeyAuth);

  // ─── API: Health Check (no auth) ───────────────────────────

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      agency: 'Open Agency',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // ─── API: Public Config (no auth) ─────────────────────────
  //
  // Returns the API key so the local dashboard HTML can
  // attach it to fetch() calls. In production, the Next.js
  // web app holds its own key server-side — this is for the
  // local dashboard only.

  app.get('/api/config/public', (req, res) => {
    res.json({ apiKey: process.env.OPEN_AGENCY_API_KEY || null });
  });

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

      // Last reports from C-suite for dashboard display
      const lastReports = {
        cfo: memory.get('cfo:lastSnapshot')?.generatedAt || null,
        cto: memory.get('cto:lastReport')?.generatedAt || null,
        cmo: memory.get('cmo:lastReport')?.generatedAt || null,
      };

      res.json({
        agents,
        clients,
        pipeline,
        finances,
        activeSprints,
        recentLogs,
        systemHealth,
        lastBriefing: memory.get('lastBriefing')?.text || null,
        lastReports,
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

  // ─── API: Last Agent Reports ─────────────────────────────
  //
  // Returns the most recent reports from C-suite and team leads,
  // so the dashboard can show "Last report: [timestamp]" per agent.

  app.get('/api/reports', (req, res) => {
    try {
      const cfoSnapshot = memory.get('cfo:lastSnapshot');
      const ctoReport = memory.get('cto:lastReport');
      const cmoReport = memory.get('cmo:lastReport');
      const salesReport = memory.get('sales-lead:lastQualification');
      const devReport = memory.get('dev-lead:lastSprint');

      res.json({
        cfo: cfoSnapshot ? {
          type: 'Daily Financial Snapshot',
          generatedAt: cfoSnapshot.generatedAt,
          summary: {
            revenue: cfoSnapshot.revenue,
            expenses: cfoSnapshot.expenses,
            profit: cfoSnapshot.profit,
            cashPosition: cfoSnapshot.cashPosition,
          },
          report: cfoSnapshot.report,
        } : null,
        cto: ctoReport ? {
          type: 'Daily Tech Status Report',
          generatedAt: ctoReport.generatedAt,
          summary: {
            overallStatus: ctoReport.overallStatus,
            health: ctoReport.health,
            infraCost: ctoReport.infraCost,
          },
          report: ctoReport.report,
        } : null,
        cmo: cmoReport ? {
          type: 'Daily Marketing Report',
          generatedAt: cmoReport.generatedAt,
          summary: {
            performance: cmoReport.performance,
            suggestion: cmoReport.suggestion,
          },
          report: cmoReport.report,
        } : null,
        salesLead: salesReport ? {
          type: 'Last Lead Qualification',
          generatedAt: salesReport.generatedAt,
        } : null,
        devLead: devReport ? {
          type: 'Last Sprint Created',
          generatedAt: devReport.generatedAt,
        } : null,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Client Onboarding Routes ────────────────────────────
  mountOnboardingRoutes(app);

  // ─── API: Nikita Chat Message ──────────────────────────────

  app.post('/api/nikita/message', async (req, res) => {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    logger.log('nikita', 'DASHBOARD_CHAT_MESSAGE', { length: message.length });

    try {
      const reply = await nikitaConversation.respond(message, 'dashboard');
      res.json({ reply });
    } catch (err) {
      logger.log('nikita', 'DASHBOARD_CHAT_ERROR', { error: err.message });
      res.status(500).json({ error: 'Failed to get response from Nikita' });
    }
  });

  // ─── API: Nikita Chat History ─────────────────────────────

  app.get('/api/nikita/history', (req, res) => {
    try {
      res.json(nikitaConversation.getHistory(20));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── API: ElevenLabs Config ───────────────────────────────

  app.get('/api/config/elevenlabs', (req, res) => {
    res.json({ apiKey: process.env.ELEVENLABS_API_KEY || null });
  });

  // ─── API: Task Queue ─────────────────────────────────────

  app.get('/api/tasks', (req, res) => {
    try {
      const all = taskQueue.getAll();
      const grouped = {
        pending: all.filter(t => t.status === 'PENDING'),
        inProgress: all.filter(t => t.status === 'IN_PROGRESS'),
        completed: all.filter(t => t.status === 'COMPLETED'),
        failed: all.filter(t => t.status === 'FAILED'),
      };
      grouped.completed = grouped.completed.map(t => ({
        ...t,
        result: memory.get(`task-result:${t.id}`) || null,
      }));
      res.json(grouped);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── API: Workflows ─────────────────────────────────────

  app.get('/api/workflows', (req, res) => {
    try {
      res.json(workflowEngine.listWorkflows());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/workflows/:id', (req, res) => {
    const wf = workflowEngine.getWorkflowStatus(req.params.id);
    if (!wf) return res.status(404).json({ error: 'Workflow not found' });
    res.json(wf);
  });

  app.post('/api/workflows/:id/approve', (req, res) => {
    const ok = workflowEngine.approveWorkflow(req.params.id, 'harry');
    if (!ok) return res.status(404).json({ error: 'Workflow not found or not waiting for approval' });
    logger.log('dashboard', 'WORKFLOW_APPROVED', { workflowId: req.params.id });
    res.json({ success: true, approvedBy: 'harry' });
  });

  // ─── API: Experience / Agent Stats ──────────────────────

  app.get('/api/experience', (req, res) => {
    try {
      const topPerformers = experience.getTopPerformers(20);
      const registeredIds = agentRegistry.list();
      const allStats = registeredIds.map(id => ({
        agentId: id,
        ...experience.getStats(id),
      }));
      res.json({ topPerformers, allStats });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Data Assembly Helpers ─────────────────────────────────

  function _getAgentList() {
    const registeredIds = agentRegistry.list();
    const profiles = agentProfile.listAgents();

    // Map agent IDs to their last report memory keys
    const lastReportKeys = {
      'cfo': 'cfo:lastSnapshot',
      'cto': 'cto:lastReport',
      'cmo': 'cmo:lastReport',
      'sales-lead': 'sales-lead:lastQualification',
      'dev-lead': 'dev-lead:lastSprint',
      'frontend': 'frontend-dev:lastTask',
      'backend': 'backend-dev:lastTask',
      'fullstack': 'fullstack-dev:lastTask',
    };

    // Build a combined list from both registry and profiles
    const agentMap = new Map();

    // Start with registered agents (runtime)
    for (const id of registeredIds) {
      const stats = experience.getStats(id);
      const reportKey = lastReportKeys[id];
      const lastReport = reportKey ? memory.get(reportKey) : null;

      agentMap.set(id, {
        id,
        name: _agentDisplayName(id),
        role: _agentRole(id),
        status: 'ONLINE',
        tasksCompleted: stats.totalTasks,
        successRate: stats.successRate,
        rank: null,
        lastReport: lastReport?.generatedAt || lastReport?.completedAt || null,
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
        const reportKey = lastReportKeys[profile.agentId];
        const lastReport = reportKey ? memory.get(reportKey) : null;

        agentMap.set(profile.agentId, {
          id: profile.agentId,
          name: profile.name,
          role: profile.role,
          status: profile.status,
          tasksCompleted: stats.totalTasks,
          successRate: stats.successRate,
          rank: profile.rank,
          lastReport: lastReport?.generatedAt || lastReport?.completedAt || null,
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
