/**
 * Cron Jobs — node-cron based scheduler for all agent tasks
 *
 * Runs inside Express on Railway.
 * Each job calls real Claude API (via client-reports.js) and saves to DB.
 *
 * Schedule (all times UTC):
 *   Weekly financial report    — Monday 06:00
 *   Weekly brand audit         — Tuesday 07:00
 *   Weekly content calendar    — Monday 07:00
 *   Daily Nikita digest        — Every day 06:00
 *   XP + level updates         — Every day 00:00
 */

import cron from 'node-cron';
import { logger } from './logger.js';
import {
  runMarcusReportsForAll,
  runZaraReportsForAll,
  runPriyaReportsForAll,
  runNikitaDigestsForAll,
} from './client-reports.js';
import { getDb, isDbAvailable } from './db.js';

// ─── XP Award Logic ──────────────────────────────────────────

async function runXpUpdates() {
  const db = getDb();
  if (!db || !isDbAvailable()) {
    logger.log('cron', 'XP_SKIP', { reason: 'DB unavailable' });
    return;
  }

  // Award 10 XP to each agent who completed a task in the last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const recentReports = await db.report.findMany({
    where: { createdAt: { gte: since } },
    select: { clientId: true, agentId: true },
  });

  // Group by clientId + agentId
  const pairs = new Map();
  for (const r of recentReports) {
    const key = `${r.clientId}:${r.agentId}`;
    pairs.set(key, r);
  }

  let awarded = 0;
  for (const [, { clientId, agentId }] of pairs) {
    try {
      const existing = await db.clientAgent.findFirst({ where: { clientId, agentId } });
      if (!existing) continue;

      const newXp = existing.xp + 10;
      const newLevel = Math.floor(newXp / 100) + 1; // Level up every 100 XP

      await db.clientAgent.update({
        where: { id: existing.id },
        data: { xp: newXp, level: newLevel },
      });

      if (newLevel > existing.level) {
        logger.log('cron', 'AGENT_LEVEL_UP', { clientId, agentId, newLevel });
        await db.auditLog.create({
          data: {
            clientId,
            agentId,
            action: 'agent_level_up',
            detail: { oldLevel: existing.level, newLevel, xp: newXp },
          },
        });
      }

      awarded++;
    } catch (err) {
      logger.log('cron', 'XP_UPDATE_ERROR', { clientId, agentId, error: err.message });
    }
  }

  logger.log('cron', 'XP_UPDATES_DONE', { pairs: pairs.size, awarded });
}

// ─── Start All Cron Jobs ─────────────────────────────────────

function startCronJobs() {
  logger.log('cron', 'STARTING', {});

  // Daily Nikita digest — every day at 06:00 UTC
  cron.schedule('0 6 * * *', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'nikita-daily-digest' });
    try { await runNikitaDigestsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'nikita-daily-digest', error: e.message }); }
  }, { timezone: 'UTC' });

  // Marcus weekly financial report — every Monday at 06:00 UTC
  cron.schedule('0 6 * * 1', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'marcus-weekly-financial' });
    try { await runMarcusReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'marcus-weekly-financial', error: e.message }); }
  }, { timezone: 'UTC' });

  // Priya content calendar — every Monday at 07:00 UTC
  cron.schedule('0 7 * * 1', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'priya-content-calendar' });
    try { await runPriyaReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'priya-content-calendar', error: e.message }); }
  }, { timezone: 'UTC' });

  // Zara brand audit — every Tuesday at 07:00 UTC
  cron.schedule('0 7 * * 2', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'zara-brand-audit' });
    try { await runZaraReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'zara-brand-audit', error: e.message }); }
  }, { timezone: 'UTC' });

  // XP + level updates — every day at midnight UTC
  cron.schedule('0 0 * * *', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'xp-updates' });
    try { await runXpUpdates(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'xp-updates', error: e.message }); }
  }, { timezone: 'UTC' });

  logger.log('cron', 'STARTED', { jobs: 5 });
  console.log('  Cron Jobs ........... OK  (5 jobs scheduled)');
}

export { startCronJobs, runXpUpdates };
