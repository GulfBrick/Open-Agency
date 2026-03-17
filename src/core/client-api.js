/**
 * Client API Routes
 *
 * Full REST API for client data — all require valid clientId in the URL.
 * Data isolation enforced: every query filters by the requesting client's ID.
 *
 * GET  /api/clients/:id              — Get client profile
 * GET  /api/clients/:id/agents       — Get assigned agents + XP/level
 * GET  /api/clients/:id/tasks        — Get task history
 * GET  /api/clients/:id/reports      — Get all reports
 * POST /api/clients/:id/message      — Send message to Nikita (Claude)
 * GET  /api/clients/:id/messages     — Get conversation history
 * POST /api/tasks/trigger            — Manually trigger a report for a client
 * GET  /api/agents                   — List all 27 agents (public)
 * GET  /api/audit/:clientId          — Audit log (admin API key only)
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { getDb, isDbAvailable } from './db.js';
import { logger } from './logger.js';
import {
  generateMarcusReport,
  generateZaraReport,
  generatePriyaReport,
  generateNikitaDigest,
  generateLenaReport,
  generateTheoReport,
  generateLexReport,
  generateHarperReport,
  generateKaiReport,
  generateMiaReport,
  generateLunaReport,
  generateRexReport,
  generateIrisReport,
  generateFelixReport,
  generateEliReport,
  generateNoraReport,
  generateOttoReport,
  generateRioReport,
  generateNovaReport,
  generateByteReport,
  generateCleoReport,
  generateSamReport,
  generateVeraReport,
  generateCoraReport,
  generateJulesReport,
  generateDrewReport,
  generateSageReport,
} from './client-reports.js';

const MODEL = 'claude-haiku-4-5';
const anthropic = new Anthropic();

// ─── All 27 Agents (canonical list) ─────────────────────────

const ALL_AGENTS = [
  { id: 'nikita',  name: 'Nikita',  role: 'CEO',               department: 'Leadership', tiers: ['starter','growth','enterprise'] },
  { id: 'rex',     name: 'Rex',     role: 'Sales Director',     department: 'Sales',      tiers: ['enterprise'] },
  { id: 'lena',    name: 'Lena',    role: 'Lead Generation',    department: 'Sales',      tiers: ['enterprise'] },
  { id: 'cleo',    name: 'Cleo',    role: 'Outreach',           department: 'Sales',      tiers: ['enterprise'] },
  { id: 'sam',     name: 'Sam',     role: 'CRM Management',     department: 'Sales',      tiers: ['enterprise'] },
  { id: 'priya',   name: 'Priya',   role: 'Marketing Director', department: 'Marketing',  tiers: ['growth','enterprise'] },
  { id: 'mia',     name: 'Mia',     role: 'Social Media',       department: 'Marketing',  tiers: ['growth','enterprise'] },
  { id: 'theo',    name: 'Theo',    role: 'SEO',                department: 'Marketing',  tiers: ['growth','enterprise'] },
  { id: 'luna',    name: 'Luna',    role: 'Paid Ads',           department: 'Marketing',  tiers: ['growth','enterprise'] },
  { id: 'kai',     name: 'Kai',     role: 'Dev Lead',           department: 'Development',tiers: ['growth','enterprise'] },
  { id: 'rio',     name: 'Rio',     role: 'Frontend Dev',       department: 'Development',tiers: ['growth','enterprise'] },
  { id: 'nova',    name: 'Nova',    role: 'Backend Dev',        department: 'Development',tiers: ['growth','enterprise'] },
  { id: 'byte',    name: 'Byte',    role: 'QA',                 department: 'Development',tiers: ['growth','enterprise'] },
  { id: 'marcus',  name: 'Marcus',  role: 'Finance Director',   department: 'Finance',    tiers: ['growth','enterprise'] },
  { id: 'iris',    name: 'Iris',    role: 'Bookkeeping',        department: 'Finance',    tiers: ['enterprise'] },
  { id: 'felix',   name: 'Felix',   role: 'Forecasting',        department: 'Finance',    tiers: ['enterprise'] },
  { id: 'zara',    name: 'Zara',    role: 'Creative Director',  department: 'Creative',   tiers: ['growth','enterprise'] },
  { id: 'eli',     name: 'Eli',     role: 'Copywriter',         department: 'Creative',   tiers: ['growth','enterprise'] },
  { id: 'nora',    name: 'Nora',    role: 'Graphic Design',     department: 'Creative',   tiers: ['growth','enterprise'] },
  { id: 'otto',    name: 'Otto',    role: 'Operations Manager', department: 'Operations', tiers: ['enterprise'] },
  { id: 'vera',    name: 'Vera',    role: 'Admin',              department: 'Operations', tiers: ['enterprise'] },
  { id: 'lex',     name: 'Lex',     role: 'Legal Director',     department: 'Legal',      tiers: ['enterprise'] },
  { id: 'cora',    name: 'Cora',    role: 'Compliance',         department: 'Legal',      tiers: ['enterprise'] },
  { id: 'jules',   name: 'Jules',   role: 'Documentation',      department: 'Legal',      tiers: ['enterprise'] },
  { id: 'harper',  name: 'Harper',  role: 'HR Director',        department: 'HR',         tiers: ['enterprise'] },
  { id: 'drew',    name: 'Drew',    role: 'Talent',             department: 'HR',         tiers: ['enterprise'] },
  { id: 'sage',    name: 'Sage',    role: 'People Ops',         department: 'HR',         tiers: ['enterprise'] },
];

// ─── Middleware: validate clientId exists ────────────────────

async function requireClient(req, res, next) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'clientId required' });

  const db = getDb();
  if (!db || !isDbAvailable()) {
    return res.status(503).json({ error: 'Database unavailable' });
  }

  try {
    const client = await db.client.findUnique({ where: { id } });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    req.clientRecord = client;
    next();
  } catch (err) {
    logger.log('client-api', 'DB_ERROR', { error: err.message });
    res.status(500).json({ error: 'Database error' });
  }
}

// ─── Zod Schemas ─────────────────────────────────────────────

const MessageSchema = z.object({
  message: z.string().min(1).max(4000),
});

const UpdateClientSchema = z.object({
  brief: z.string().max(3000).optional(),
  timezone: z.string().max(60).optional(),
  businessName: z.string().min(1).max(200).optional(),
});

const TriggerSchema = z.object({
  clientId: z.string().uuid(),
  agentId: z.enum([
    'marcus', 'zara', 'priya', 'nikita', 'lena', 'theo', 'lex', 'harper',
    'kai', 'mia', 'luna', 'rex', 'iris', 'felix', 'eli', 'nora', 'otto',
    'rio', 'nova', 'byte', 'cleo', 'sam', 'vera', 'cora', 'jules', 'drew', 'sage',
  ]),
});

// ─── Mount All Client Routes ─────────────────────────────────

function mountClientApiRoutes(app) {

  // GET /api/agents — all 27 agents, public
  app.get('/api/agents', (req, res) => {
    res.json(ALL_AGENTS);
  });

  // GET /api/clients/:id — client profile
  app.get('/api/clients/:id', requireClient, (req, res) => {
    const c = req.clientRecord;
    // Assign agent list based on tier
    const assignedAgentIds = ALL_AGENTS
      .filter(a => a.tiers.includes(c.tier))
      .map(a => a.id);

    res.json({
      id: c.id,
      email: c.email,
      businessName: c.businessName,
      tier: c.tier,
      brief: c.brief,
      timezone: c.timezone,
      createdAt: c.createdAt,
      assignedAgentCount: assignedAgentIds.length,
    });
  });

  // PUT /api/clients/:id — update brief / timezone / businessName
  app.put('/api/clients/:id', requireClient, async (req, res) => {
    const parsed = UpdateClientSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues });

    const db = getDb();
    try {
      const updated = await db.client.update({
        where: { id: req.params.id },
        data: parsed.data,
        select: { id: true, email: true, businessName: true, tier: true, brief: true, timezone: true, createdAt: true },
      });

      await db.auditLog.create({
        data: {
          clientId: req.params.id,
          agentId: 'system',
          action: 'client_updated',
          detail: { fields: Object.keys(parsed.data) },
          ip: req.ip,
        },
      });

      logger.log('client-api', 'CLIENT_UPDATED', { clientId: req.params.id, fields: Object.keys(parsed.data) });
      res.json(updated);
    } catch (err) {
      logger.log('client-api', 'UPDATE_ERROR', { error: err.message });
      res.status(500).json({ error: 'Database error' });
    }
  });

  // POST /api/clients/:id/kickoff — fire initial agent reports for a new client
  // Runs Nikita digest + tier-appropriate core agents. Fire-and-forget.
  app.post('/api/clients/:id/kickoff', requireClient, async (req, res) => {
    const db = getDb();
    const c = req.clientRecord;

    // Determine which agents to kick off by tier
    const KICKOFF_AGENTS = {
      starter: ['nikita'],
      growth:  ['nikita', 'marcus', 'priya', 'zara', 'kai'],
      enterprise: ['nikita', 'marcus', 'priya', 'zara', 'kai', 'rex', 'lena'],
    };

    const agents = KICKOFF_AGENTS[c.tier] || KICKOFF_AGENTS.starter;

    logger.log('client-api', 'KICKOFF_STARTED', { clientId: c.id, tier: c.tier, agents });

    // Create pending task records
    const tasks = await Promise.all(agents.map(agentId =>
      db.task.create({
        data: { clientId: c.id, agentId, type: 'kickoff', status: 'running', input: { source: 'kickoff' } },
      })
    ));

    await db.auditLog.create({
      data: {
        clientId: c.id,
        agentId: 'system',
        action: 'kickoff_started',
        detail: { agents, taskCount: tasks.length },
        ip: req.ip,
      },
    });

    // Return immediately, run reports in background
    res.json({ ok: true, agents, taskCount: tasks.length, message: 'Your team is spinning up. Reports will appear shortly.' });

    // Background: run each agent report
    (async () => {
      for (let i = 0; i < agents.length; i++) {
        const agentId = agents[i];
        const task = tasks[i];
        try {
          let result;
          if (agentId === 'nikita')      result = await generateNikitaDigest(c);
          else if (agentId === 'marcus') result = await generateMarcusReport(c);
          else if (agentId === 'priya')  result = await generatePriyaReport(c);
          else if (agentId === 'zara')   result = await generateZaraReport(c);
          else if (agentId === 'kai')    result = await generateKaiReport(c);
          else if (agentId === 'mia')    result = await generateMiaReport(c);
          else if (agentId === 'luna')   result = await generateLunaReport(c);
          else if (agentId === 'rex')    result = await generateRexReport(c);
          else if (agentId === 'lena')   result = await generateLenaReport(c);
          else if (agentId === 'theo')   result = await generateTheoReport(c);
          else if (agentId === 'iris')   result = await generateIrisReport(c);
          else if (agentId === 'felix')  result = await generateFelixReport(c);
          else if (agentId === 'eli')    result = await generateEliReport(c);
          else if (agentId === 'nora')   result = await generateNoraReport(c);
          else if (agentId === 'otto')   result = await generateOttoReport(c);
          else if (agentId === 'lex')    result = await generateLexReport(c);
          else if (agentId === 'harper') result = await generateHarperReport(c);
          else if (agentId === 'rio')    result = await generateRioReport(c);
          else if (agentId === 'nova')   result = await generateNovaReport(c);
          else if (agentId === 'byte')   result = await generateByteReport(c);
          else if (agentId === 'cleo')   result = await generateCleoReport(c);
          else if (agentId === 'sam')    result = await generateSamReport(c);
          else if (agentId === 'vera')   result = await generateVeraReport(c);
          else if (agentId === 'cora')   result = await generateCoraReport(c);
          else if (agentId === 'jules')  result = await generateJulesReport(c);
          else if (agentId === 'drew')   result = await generateDrewReport(c);
          else if (agentId === 'sage')   result = await generateSageReport(c);

          await db.task.update({
            where: { id: task.id },
            data: { status: 'complete', output: result, completedAt: new Date() },
          });

          // Award XP to agent
          const agentRow = await db.clientAgent.findFirst({ where: { clientId: c.id, agentId } });
          if (agentRow) {
            const newXp = agentRow.xp + 25;
            const newLevel = Math.floor(newXp / 100) + 1;
            await db.clientAgent.update({ where: { id: agentRow.id }, data: { xp: newXp, level: newLevel } });
          }

          logger.log('client-api', 'KICKOFF_AGENT_DONE', { clientId: c.id, agentId });
        } catch (err) {
          await db.task.update({
            where: { id: task.id },
            data: { status: 'failed', output: { error: err.message }, completedAt: new Date() },
          });
          logger.log('client-api', 'KICKOFF_AGENT_FAILED', { clientId: c.id, agentId, error: err.message });
        }
      }

      logger.log('client-api', 'KICKOFF_COMPLETE', { clientId: c.id, agents });
    })();
  });

  // GET /api/clients/:id/agents — agents + XP/level
  app.get('/api/clients/:id/agents', requireClient, async (req, res) => {
    const db = getDb();
    try {
      const rows = await db.clientAgent.findMany({
        where: { clientId: req.params.id },
      });

      // Merge with canonical agent metadata
      const result = rows.map(row => {
        const meta = ALL_AGENTS.find(a => a.id === row.agentId) || {};
        return {
          id: row.id,
          agentId: row.agentId,
          name: meta.name || row.agentId,
          role: meta.role || 'Agent',
          department: meta.department || 'Agency',
          level: row.level,
          xp: row.xp,
          xpToNextLevel: (row.level * 100) - row.xp,
        };
      });

      res.json(result);
    } catch (err) {
      logger.log('client-api', 'AGENTS_ERROR', { error: err.message });
      res.status(500).json({ error: 'Database error' });
    }
  });

  // GET /api/clients/:id/tasks — task history
  app.get('/api/clients/:id/tasks', requireClient, async (req, res) => {
    const db = getDb();
    try {
      const tasks = await db.task.findMany({
        where: { clientId: req.params.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      res.json(tasks);
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  // GET /api/clients/:id/reports — all reports
  app.get('/api/clients/:id/reports', requireClient, async (req, res) => {
    const db = getDb();
    try {
      const reports = await db.report.findMany({
        where: { clientId: req.params.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, agentId: true, type: true, content: true, createdAt: true },
      });

      // Parse JSON content for display
      const parsed = reports.map(r => {
        let parsed_content = null;
        try { parsed_content = JSON.parse(r.content); } catch { parsed_content = { output: r.content }; }
        return { ...r, content: parsed_content };
      });

      res.json(parsed);
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  // POST /api/clients/:id/message — Nikita chat (persistent history)
  app.post('/api/clients/:id/message', requireClient, async (req, res) => {
    const parsed = MessageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues });

    const { message } = parsed.data;
    const { id: clientId } = req.params;
    const c = req.clientRecord;
    const db = getDb();

    try {
      // Save user message
      await db.message.create({ data: { clientId, role: 'user', content: message } });

      // Load last 20 messages for context
      const history = await db.message.findMany({
        where: { clientId },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });

      const conversationMessages = history.map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Call Nikita via Claude
      const systemPrompt = `You are Nikita, CEO of Open Agency. You are responding to a client message.

Client: ${c.businessName}
Tier: ${c.tier}
Brief: ${c.brief || 'No brief yet.'}

You are confident, warm, direct. You get to the point. You answer their question and tell them what's happening next. Never sycophantic.`;

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: conversationMessages,
      });

      const reply = response.content[0].text;

      // Save assistant reply
      await db.message.create({ data: { clientId, role: 'assistant', content: reply } });

      // Audit log
      await db.auditLog.create({
        data: {
          clientId,
          agentId: 'nikita',
          action: 'message_sent',
          detail: { messageLength: message.length },
          ip: req.ip,
        },
      });

      res.json({ reply, agentId: 'nikita' });
    } catch (err) {
      logger.log('client-api', 'MESSAGE_ERROR', { clientId, error: err.message });
      res.status(500).json({ error: 'Failed to get response' });
    }
  });

  // GET /api/clients/:id/messages — conversation history
  app.get('/api/clients/:id/messages', requireClient, async (req, res) => {
    const db = getDb();
    try {
      const messages = await db.message.findMany({
        where: { clientId: req.params.id },
        orderBy: { createdAt: 'asc' },
        take: 50,
        select: { id: true, role: true, content: true, createdAt: true },
      });
      res.json(messages);
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  // POST /api/tasks/trigger — trigger a specific report for a client
  app.post('/api/tasks/trigger', async (req, res) => {
    const parsed = TriggerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues });

    const { clientId, agentId } = parsed.data;
    const db = getDb();
    if (!db || !isDbAvailable()) return res.status(503).json({ error: 'Database unavailable' });

    const clientRecord = await db.client.findUnique({ where: { id: clientId } });
    if (!clientRecord) return res.status(404).json({ error: 'Client not found' });

    logger.log('client-api', 'TASK_TRIGGERED', { clientId, agentId });

    // Create a task record
    const task = await db.task.create({
      data: {
        clientId,
        agentId,
        type: 'manual-trigger',
        status: 'running',
        input: { agentId },
      },
    });

    // Fire and forget — return task ID immediately
    (async () => {
      try {
        let result;
        if (agentId === 'marcus') result = await generateMarcusReport(clientRecord);
        else if (agentId === 'zara') result = await generateZaraReport(clientRecord);
        else if (agentId === 'priya') result = await generatePriyaReport(clientRecord);
        else if (agentId === 'nikita') result = await generateNikitaDigest(clientRecord);
        else if (agentId === 'lena') result = await generateLenaReport(clientRecord);
        else if (agentId === 'theo') result = await generateTheoReport(clientRecord);
        else if (agentId === 'lex') result = await generateLexReport(clientRecord);
        else if (agentId === 'harper') result = await generateHarperReport(clientRecord);
        else if (agentId === 'kai') result = await generateKaiReport(clientRecord);
        else if (agentId === 'mia') result = await generateMiaReport(clientRecord);
        else if (agentId === 'luna') result = await generateLunaReport(clientRecord);
        else if (agentId === 'rex') result = await generateRexReport(clientRecord);
        else if (agentId === 'iris') result = await generateIrisReport(clientRecord);
        else if (agentId === 'felix') result = await generateFelixReport(clientRecord);
        else if (agentId === 'eli') result = await generateEliReport(clientRecord);
        else if (agentId === 'nora') result = await generateNoraReport(clientRecord);
        else if (agentId === 'otto') result = await generateOttoReport(clientRecord);
        else if (agentId === 'rio') result = await generateRioReport(clientRecord);
        else if (agentId === 'nova') result = await generateNovaReport(clientRecord);
        else if (agentId === 'byte') result = await generateByteReport(clientRecord);
        else if (agentId === 'cleo') result = await generateCleoReport(clientRecord);
        else if (agentId === 'sam') result = await generateSamReport(clientRecord);
        else if (agentId === 'vera') result = await generateVeraReport(clientRecord);
        else if (agentId === 'cora') result = await generateCoraReport(clientRecord);
        else if (agentId === 'jules') result = await generateJulesReport(clientRecord);
        else if (agentId === 'drew') result = await generateDrewReport(clientRecord);
        else if (agentId === 'sage') result = await generateSageReport(clientRecord);

        await db.task.update({
          where: { id: task.id },
          data: { status: 'complete', output: result, completedAt: new Date() },
        });
      } catch (err) {
        await db.task.update({
          where: { id: task.id },
          data: { status: 'failed', output: { error: err.message }, completedAt: new Date() },
        });
      }
    })();

    res.json({ ok: true, taskId: task.id, agentId, clientId });
  });

  // GET /api/clients/:id/activity — merged activity feed (reports + tasks)
  app.get('/api/clients/:id/activity', requireClient, async (req, res) => {
    const db = getDb();
    try {
      const [reports, tasks, agentRows] = await Promise.all([
        db.report.findMany({
          where: { clientId: req.params.id },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, agentId: true, type: true, content: true, createdAt: true },
        }),
        db.task.findMany({
          where: { clientId: req.params.id, status: { in: ['complete', 'failed'] } },
          orderBy: { completedAt: 'desc' },
          take: 20,
          select: { id: true, agentId: true, type: true, status: true, output: true, completedAt: true, createdAt: true },
        }),
        db.clientAgent.findMany({
          where: { clientId: req.params.id },
          select: { agentId: true, level: true, xp: true },
        }),
      ]);

      // Merge and sort by date
      const activities = [];

      for (const r of reports) {
        let summary = '';
        try {
          const parsed = JSON.parse(r.content);
          summary = parsed.summary || '';
        } catch { /* ignore */ }
        activities.push({
          id: `report-${r.id}`,
          kind: 'report',
          agentId: r.agentId,
          type: r.type.replace(/-/g, ' '),
          summary,
          status: 'complete',
          createdAt: r.createdAt,
        });
      }

      for (const t of tasks) {
        let summary = '';
        if (t.output && typeof t.output === 'object') {
          summary = t.output.summary || '';
        }
        activities.push({
          id: `task-${t.id}`,
          kind: 'task',
          agentId: t.agentId,
          type: t.type.replace(/-/g, ' '),
          summary,
          status: t.status,
          createdAt: t.completedAt || t.createdAt,
        });
      }

      // Sort newest first
      activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Build agent level map
      const agentLevels = {};
      for (const a of agentRows) {
        agentLevels[a.agentId] = { level: a.level, xp: a.xp };
      }

      res.json({
        activities: activities.slice(0, 30),
        agentLevels,
        totalReports: reports.length,
        totalTasks: tasks.length,
      });
    } catch (err) {
      logger.log('client-api', 'ACTIVITY_ERROR', { error: err.message });
      res.status(500).json({ error: 'Database error' });
    }
  });

  // GET /api/audit/:clientId — admin only
  app.get('/api/audit/:clientId', async (req, res) => {
    // Admin gate — must have API key set
    const apiKey = process.env.OPEN_AGENCY_API_KEY;
    if (apiKey) {
      const provided = req.headers['x-api-key'];
      if (!provided || provided !== apiKey) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const db = getDb();
    if (!db || !isDbAvailable()) return res.status(503).json({ error: 'Database unavailable' });

    try {
      const logs = await db.auditLog.findMany({
        where: { clientId: req.params.clientId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });
}

export { mountClientApiRoutes, ALL_AGENTS };
