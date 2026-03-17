/**
 * Auth API
 *
 * POST /api/auth/lookup — look up a client by email, return clientId
 * POST /api/auth/register — create a new client (manual sign-up, no Whop)
 *
 * This is a lightweight auth layer. Whop is the source of truth for
 * paid clients. This endpoint lets clients find their portal by email.
 */

import { z } from 'zod';
import { getDb, isDbAvailable } from './db.js';
import { logger } from './logger.js';

// ─── Schemas ─────────────────────────────────────────────────

const LookupSchema = z.object({
  email: z.string().email(),
});

const RegisterSchema = z.object({
  email: z.string().email(),
  businessName: z.string().min(1).max(200),
  tier: z.enum(['starter', 'growth', 'enterprise']).default('starter'),
  brief: z.string().max(2000).optional(),
  timezone: z.string().max(60).optional(),
});

// ─── Mount Routes ─────────────────────────────────────────────

function mountAuthRoutes(app) {

  // POST /api/auth/lookup — find client by email
  // Returns clientId, businessName, tier (no sensitive data)
  app.post('/api/auth/lookup', async (req, res) => {
    const parsed = LookupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid email required', issues: parsed.error.issues });
    }

    const { email } = parsed.data;

    const db = getDb();
    if (!db || !isDbAvailable()) {
      return res.status(503).json({ error: 'Database unavailable — try again shortly' });
    }

    try {
      const client = await db.client.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, email: true, businessName: true, tier: true, createdAt: true },
      });

      if (!client) {
        // Don't reveal whether the email exists — just say "not found"
        return res.status(404).json({ error: 'No account found for this email. Sign up at oagencyconsulting.com/pricing' });
      }

      logger.log('auth', 'LOOKUP_SUCCESS', { email, clientId: client.id });

      return res.json({
        clientId: client.id,
        businessName: client.businessName,
        tier: client.tier,
        createdAt: client.createdAt,
      });
    } catch (err) {
      logger.log('auth', 'LOOKUP_ERROR', { email, error: err.message });
      return res.status(500).json({ error: 'Lookup failed — try again' });
    }
  });

  // POST /api/auth/register — create a new client record
  // Used when someone signs up outside of Whop (e.g. direct deal)
  app.post('/api/auth/register', async (req, res) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues });
    }

    const { email, businessName, tier, brief, timezone } = parsed.data;

    const db = getDb();
    if (!db || !isDbAvailable()) {
      return res.status(503).json({ error: 'Database unavailable — try again shortly' });
    }

    try {
      // Check if already exists
      const existing = await db.client.findUnique({ where: { email: email.toLowerCase() } });
      if (existing) {
        return res.status(409).json({
          error: 'An account already exists for this email',
          clientId: existing.id,
        });
      }

      // Create client
      const client = await db.client.create({
        data: {
          whopUserId: `manual-${Date.now()}`,
          email: email.toLowerCase(),
          businessName,
          tier,
          brief: brief || null,
          timezone: timezone || 'UTC',
        },
        select: { id: true, email: true, businessName: true, tier: true, createdAt: true },
      });

      // Assign default agents for tier
      const TIER_AGENTS = {
        starter: ['nikita', 'priya', 'mia', 'theo', 'luna'],
        growth: ['nikita', 'marcus', 'priya', 'kai', 'rio', 'nova', 'byte', 'zara', 'eli', 'nora'],
        enterprise: [
          'nikita', 'rex', 'lena', 'cleo', 'sam',
          'priya', 'mia', 'theo', 'luna',
          'kai', 'rio', 'nova', 'byte',
          'marcus', 'iris', 'felix',
          'zara', 'eli', 'nora',
          'otto', 'vera',
          'lex', 'cora', 'jules',
          'harper', 'drew', 'sage',
        ],
      };

      const agentIds = TIER_AGENTS[tier] || TIER_AGENTS.starter;
      await db.clientAgent.createMany({
        data: agentIds.map(agentId => ({ clientId: client.id, agentId, level: 1, xp: 0 })),
        skipDuplicates: true,
      });

      // Audit log
      await db.auditLog.create({
        data: {
          clientId: client.id,
          agentId: 'system',
          action: 'client_registered',
          detail: { tier, source: 'manual-register' },
          ip: req.ip,
        },
      });

      logger.log('auth', 'REGISTER_SUCCESS', { email, clientId: client.id, tier });

      return res.status(201).json({
        clientId: client.id,
        businessName: client.businessName,
        tier: client.tier,
        createdAt: client.createdAt,
        agentsAssigned: agentIds.length,
      });
    } catch (err) {
      logger.log('auth', 'REGISTER_ERROR', { email, error: err.message });
      return res.status(500).json({ error: 'Registration failed — try again' });
    }
  });
}

export { mountAuthRoutes };
