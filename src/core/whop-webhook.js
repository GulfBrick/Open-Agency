/**
 * Whop Webhook Handler
 *
 * POST /api/webhooks/whop
 * - Verifies HMAC signature
 * - Creates client in DB
 * - Assigns agents by tier
 * - Sends welcome email
 */

import crypto from 'crypto';
import express from 'express';
import { z } from 'zod';
import { getDb, isDbAvailable } from './db.js';
import { logger } from './logger.js';
import { sendWelcomeEmail } from './email.js';

// ─── Agent assignment by tier ────────────────────────────────

const TIER_AGENTS = {
  starter: ['nikita'],
  growth: ['nikita', 'marcus', 'priya', 'kai', 'rio', 'nova', 'byte'],
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

// Starter gets 1 department — client chooses; default to marketing if not specified
const STARTER_DEPT_AGENTS = {
  sales: ['nikita', 'rex', 'lena', 'cleo', 'sam'],
  marketing: ['nikita', 'priya', 'mia', 'theo', 'luna'],
  development: ['nikita', 'kai', 'rio', 'nova', 'byte'],
  creative: ['nikita', 'zara', 'eli', 'nora'],
};

// Whop price IDs → tiers (configure these in Whop dashboard)
const PRICE_TIER_MAP = {
  // Fill with your actual Whop price/plan IDs
  starter: 'starter',
  growth: 'growth',
  enterprise: 'enterprise',
};

// ─── Schema validation ───────────────────────────────────────

const WhopPayloadSchema = z.object({
  event: z.string(),
  data: z.object({
    id: z.string().optional(),
    user: z.object({
      id: z.string(),
      email: z.string().email(),
      username: z.string().optional(),
    }).optional(),
    membership: z.object({
      id: z.string(),
      user_id: z.string().optional(),
      plan_id: z.string().optional(),
      status: z.string().optional(),
    }).optional(),
    // Some Whop events nest differently
    email: z.string().email().optional(),
    user_id: z.string().optional(),
    plan_id: z.string().optional(),
  }),
}).passthrough();

// ─── Signature verification ──────────────────────────────────

function verifyWhopSignature(rawBody, signature, secret) {
  if (!secret) {
    logger.log('whop', 'SIGNATURE_SKIP', { reason: 'WHOP_WEBHOOK_SECRET not set' });
    return true; // Allow in dev if no secret configured
  }
  if (!signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const sig = signature.startsWith('sha256=') ? signature.slice(7) : signature;

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
  } catch {
    return false;
  }
}

// ─── Determine tier from Whop plan ID ───────────────────────

function resolveTier(planId = '') {
  const lower = planId.toLowerCase();
  if (lower.includes('enterprise')) return 'enterprise';
  if (lower.includes('growth')) return 'growth';
  return 'starter';
}

// ─── Assign agents for a client in DB ───────────────────────

async function assignAgents(db, clientId, tier, department = 'marketing') {
  let agentIds = TIER_AGENTS[tier] || TIER_AGENTS.starter;

  if (tier === 'starter' && department) {
    agentIds = STARTER_DEPT_AGENTS[department] || STARTER_DEPT_AGENTS.marketing;
  }

  const records = agentIds.map(agentId => ({
    clientId,
    agentId,
    level: 1,
    xp: 0,
  }));

  await db.clientAgent.createMany({
    data: records,
    skipDuplicates: true,
  });

  return agentIds;
}

// ─── Mount webhook route ─────────────────────────────────────

function mountWhopWebhook(app) {
  // Raw body capture for signature verification
  app.post(
    '/api/webhooks/whop',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      const rawBody = req.body;
      const signature = req.headers['whop-signature'] || req.headers['x-whop-signature'];
      const secret = process.env.WHOP_WEBHOOK_SECRET;

      // 1. Verify signature
      if (!verifyWhopSignature(rawBody, signature, secret)) {
        logger.log('whop', 'SIGNATURE_INVALID', { ip: req.ip });
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // 2. Parse body
      let payload;
      try {
        payload = JSON.parse(rawBody.toString());
      } catch (err) {
        logger.log('whop', 'PARSE_ERROR', { error: err.message });
        return res.status(400).json({ error: 'Invalid JSON' });
      }

      // 3. Validate schema
      const parsed = WhopPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        logger.log('whop', 'SCHEMA_ERROR', { errors: parsed.error.issues });
        return res.status(400).json({ error: 'Invalid payload schema' });
      }

      const { event, data } = parsed.data;
      logger.log('whop', 'WEBHOOK_RECEIVED', { event });

      // 4. Only handle membership/payment events
      const HANDLED_EVENTS = [
        'membership.went_valid',
        'payment.succeeded',
        'membership.created',
      ];

      if (!HANDLED_EVENTS.includes(event)) {
        return res.status(200).json({ ok: true, skipped: event });
      }

      // 5. Extract user details
      const user = data.user || {};
      const membership = data.membership || {};
      const whopUserId = user.id || membership.user_id || data.user_id || '';
      const email = user.email || data.email || '';
      const planId = membership.plan_id || data.plan_id || '';

      if (!whopUserId || !email) {
        logger.log('whop', 'MISSING_USER_DATA', { whopUserId, email });
        return res.status(400).json({ error: 'Missing user data' });
      }

      const tier = resolveTier(planId);

      // 6. If DB is available, create/update client record
      const db = getDb();
      let clientId = null;

      if (db && isDbAvailable()) {
        try {
          // Idempotent: upsert so re-delivery is safe
          const client = await db.client.upsert({
            where: { whopUserId },
            update: { tier, email },
            create: {
              whopUserId,
              email,
              businessName: user.username || email.split('@')[0],
              tier,
            },
          });
          clientId = client.id;

          // Assign agents
          const assignedAgents = await assignAgents(db, clientId, tier);

          // Audit log
          await db.auditLog.create({
            data: {
              clientId,
              agentId: 'system',
              action: 'client_created',
              detail: { tier, assignedAgents, event },
              ip: req.ip,
            },
          });

          logger.log('whop', 'CLIENT_CREATED', { clientId, tier, email, agentCount: assignedAgents.length });
        } catch (err) {
          logger.log('whop', 'DB_ERROR', { error: err.message });
          // Don't fail the webhook — Whop will retry
          return res.status(500).json({ error: 'Database error' });
        }
      } else {
        logger.log('whop', 'DB_UNAVAILABLE', { note: 'Client not persisted — DB offline' });
      }

      // 7. Send welcome email
      try {
        await sendWelcomeEmail({ email, tier, businessName: user.username || email });
        logger.log('whop', 'WELCOME_EMAIL_SENT', { email, tier });
      } catch (err) {
        logger.log('whop', 'WELCOME_EMAIL_FAILED', { error: err.message });
        // Non-fatal — client is still created
      }

      return res.status(200).json({ ok: true, clientId, tier });
    }
  );
}

export { mountWhopWebhook, assignAgents, resolveTier };
