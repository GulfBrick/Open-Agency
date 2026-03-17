/**
 * Client Onboarding API
 *
 * Handles the web frontend onboarding flow — creates client in Prisma DB,
 * assigns agents by tier, and sends welcome email.
 *
 * Endpoints:
 *   POST /api/clients/onboard     — create client from web form
 *   GET  /api/clients/:id/team    — shows assigned agents
 *   GET  /api/clients/:id/status  — shows current work status
 */

import { z } from 'zod';
import { clientOnboarding } from './client-onboarding.js';
import { getDb, isDbAvailable } from './db.js';
import { logger } from './logger.js';
import { sendWelcomeEmail } from './email.js';
import { assignAgents } from './whop-webhook.js';

// ─── Zod Schema for web form ────────────────────────────────

const OnboardSchema = z.object({
  name: z.string().min(1).max(200),
  industry: z.string().optional().default(''),
  companySize: z.string().optional().default(''),
  website: z.string().optional().default(''),
  contactName: z.string().optional().default(''),
  contactEmail: z.string().email(),
  goals: z.string().optional().default(''),
  monthlyBudget: z.string().optional().default(''),
  departments: z.array(z.string()).optional().default([]),
  plan: z.string().optional().default('growth'),
  integrations: z.object({
    githubToken: z.string().optional().default(''),
    gitlabToken: z.string().optional().default(''),
    bitbucketUser: z.string().optional().default(''),
    bitbucketAppPassword: z.string().optional().default(''),
  }).optional(),
  brief: z.string().optional().default(''),
});

// ─── Map frontend plan names to tier ────────────────────────

function planToTier(plan) {
  if (plan === 'agency' || plan === 'enterprise') return 'enterprise';
  if (plan === 'growth') return 'growth';
  return 'starter';
}

// ─── Mount Routes ───────────────────────────────────────────

function mountOnboardingRoutes(app) {

  // ─── POST /api/clients/onboard ────────────────────────────
  app.post('/api/clients/onboard', async (req, res) => {
    const parsed = OnboardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues });
    }

    const data = parsed.data;
    const tier = planToTier(data.plan);

    logger.log('onboarding', 'REQUEST', {
      businessName: data.name,
      email: data.contactEmail,
      tier,
    });

    // Build brief from form data
    const briefParts = [data.brief];
    if (data.goals) briefParts.push(`Goals: ${data.goals}`);
    if (data.industry) briefParts.push(`Industry: ${data.industry}`);
    if (data.companySize) briefParts.push(`Size: ${data.companySize}`);
    if (data.website) briefParts.push(`Website: ${data.website}`);
    if (data.monthlyBudget) briefParts.push(`Budget: ${data.monthlyBudget}`);
    if (data.departments?.length) briefParts.push(`Departments: ${data.departments.join(', ')}`);
    const fullBrief = briefParts.filter(Boolean).join('\n');

    // Try to create in database
    const db = getDb();
    if (db && isDbAvailable()) {
      try {
        // Create or update client
        const whopUserId = `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const client = await db.client.upsert({
          where: { email: data.contactEmail },
          update: {
            businessName: data.name,
            tier,
            brief: fullBrief,
          },
          create: {
            whopUserId,
            email: data.contactEmail,
            businessName: data.name,
            tier,
            brief: fullBrief,
          },
        });

        // Assign agents by tier
        const department = data.departments?.[0] || 'marketing';
        const assignedAgents = await assignAgents(db, client.id, tier, department);

        // Audit log
        await db.auditLog.create({
          data: {
            clientId: client.id,
            agentId: 'nikita',
            action: 'client_onboarded',
            detail: { tier, departments: data.departments, source: 'web-form' },
            ip: req.ip,
          },
        });

        // Send welcome email (non-blocking)
        sendWelcomeEmail({
          email: data.contactEmail,
          tier,
          businessName: data.name,
        }).catch(err => {
          logger.log('onboarding', 'WELCOME_EMAIL_FAILED', { error: err.message });
        });

        logger.log('onboarding', 'CLIENT_CREATED', {
          clientId: client.id,
          tier,
          agentCount: assignedAgents.length,
        });

        return res.json({
          success: true,
          clientId: client.id,
          businessName: data.name,
          tier,
          agentCount: assignedAgents.length,
          message: 'Your team is being briefed. Welcome to Open Agency.',
        });
      } catch (err) {
        logger.log('onboarding', 'DB_ERROR', { error: err.message });
        return res.status(500).json({ error: 'Failed to create client record' });
      }
    }

    // Fallback: run in-memory onboarding if DB is unavailable
    try {
      const slug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const result = clientOnboarding.runFullOnboarding(slug, {
        companyName: data.name,
        industry: data.industry,
        size: data.companySize,
        website: data.website,
        contacts: [{ name: data.contactName, email: data.contactEmail, role: 'Primary' }],
        goals: [data.goals].filter(Boolean),
      });

      return res.json({
        success: true,
        clientId: slug,
        businessName: data.name,
        tier,
        agentCount: result.team?.allAgents?.length || 0,
        message: 'Onboarded (offline mode). Your team is ready.',
        offline: true,
      });
    } catch (err) {
      logger.log('onboarding', 'FALLBACK_ERROR', { error: err.message });
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/clients/:id/team ────────────────────────────
  app.get('/api/clients/:id/team', async (req, res) => {
    const clientId = req.params.id;

    // Try DB first
    const db = getDb();
    if (db && isDbAvailable()) {
      try {
        const agents = await db.clientAgent.findMany({
          where: { clientId },
        });
        if (agents.length > 0) {
          return res.json({ clientId, agents });
        }
      } catch { /* fall through */ }
    }

    // Fallback to in-memory
    try {
      const team = clientOnboarding.getClientTeam(clientId);
      if (!team) {
        return res.status(404).json({ error: `No team found for client '${clientId}'` });
      }
      res.json({
        clientId,
        agents: team.allAgents?.map(a => ({
          agentId: a.agentId,
          name: a.name,
          role: a.role,
        })) || [],
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/clients/:id/status ──────────────────────────
  app.get('/api/clients/:id/status', async (req, res) => {
    const clientId = req.params.id;

    const db = getDb();
    if (db && isDbAvailable()) {
      try {
        const client = await db.client.findUnique({ where: { id: clientId } });
        if (client) {
          const agentCount = await db.clientAgent.count({ where: { clientId } });
          const taskCount = await db.task.count({ where: { clientId } });
          const reportCount = await db.report.count({ where: { clientId } });
          return res.json({
            clientId,
            businessName: client.businessName,
            tier: client.tier,
            agentCount,
            taskCount,
            reportCount,
            status: 'active',
          });
        }
      } catch { /* fall through */ }
    }

    try {
      const status = clientOnboarding.getOnboardingStatus(clientId);
      if (!status) {
        return res.status(404).json({ error: `Client '${clientId}' not found` });
      }
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  logger.log('dashboard', 'ONBOARDING_ROUTES_MOUNTED', {
    routes: [
      'POST /api/clients/onboard',
      'GET /api/clients/:id/team',
      'GET /api/clients/:id/status',
    ],
  });
}

export { mountOnboardingRoutes };
