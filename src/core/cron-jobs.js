/**
 * Cron Jobs — node-cron based scheduler for all agent tasks
 *
 * Runs inside Express on Railway.
 * Each job calls real Claude API (via client-reports.js) and saves to DB.
 *
 * Schedule (all times UTC):
 *   Daily Nikita digest        — Every day 08:00
 *   Marcus financial report    — Monday 08:00
 *   Priya content calendar     — Monday 09:00
 *   Zara brand audit           — Tuesday 09:00
 *   Lena lead gen              — Mon–Fri 07:00
 *   Theo SEO check             — Wednesday 10:00
 *   Lex legal review           — Friday 09:00 (Enterprise only)
 *   Harper HR pack             — Monday 10:00 (Enterprise only)
 *   Task queue processor       — Every 5 minutes
 *   XP + level updates         — Every day 00:00
 */

import cron from 'node-cron';
import { logger } from './logger.js';
import { sendAgentLevelUpEmail } from './email.js';
import {
  runMarcusReportsForAll,
  runZaraReportsForAll,
  runPriyaReportsForAll,
  runNikitaDigestsForAll,
  runLenaReportsForAll,
  runTheoReportsForAll,
  runLexReportsForAll,
  runHarperReportsForAll,
  runKaiReportsForAll,
  runMiaReportsForAll,
  runLunaReportsForAll,
  runRexReportsForAll,
  runIrisReportsForAll,
  runFelixReportsForAll,
  runEliReportsForAll,
  runNoraReportsForAll,
  runOttoReportsForAll,
  runRioReportsForAll,
  runNovaReportsForAll,
  runByteReportsForAll,
  runCleoReportsForAll,
  runSamReportsForAll,
  runVeraReportsForAll,
  runCoraReportsForAll,
  runJulesReportsForAll,
  runDrewReportsForAll,
  runSageReportsForAll,
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

  const recentTasks = await db.task.findMany({
    where: { completedAt: { gte: since }, status: 'complete' },
    select: { clientId: true, agentId: true },
  });

  // Group by clientId + agentId
  const pairs = new Map();
  for (const r of [...recentReports, ...recentTasks]) {
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

        // Send level-up email to client
        try {
          const clientRow = await db.client.findUnique({
            where: { id: clientId },
            select: { email: true, businessName: true },
          });
          if (clientRow) {
            const agentName = agentId.charAt(0).toUpperCase() + agentId.slice(1);
            await sendAgentLevelUpEmail({
              email: clientRow.email,
              agentId,
              agentName,
              newLevel,
              businessName: clientRow.businessName,
            });
            logger.log('cron', 'LEVEL_UP_EMAIL_SENT', { clientId, agentId, newLevel });
          }
        } catch (emailErr) {
          logger.log('cron', 'LEVEL_UP_EMAIL_FAILED', { clientId, agentId, error: emailErr.message });
        }
      }

      awarded++;
    } catch (err) {
      logger.log('cron', 'XP_UPDATE_ERROR', { clientId, agentId, error: err.message });
    }
  }

  logger.log('cron', 'XP_UPDATES_DONE', { pairs: pairs.size, awarded });
}

// ─── Task Queue Processor ───────────────────────────────────

async function processTaskQueue() {
  const db = getDb();
  if (!db || !isDbAvailable()) return;

  const pending = await db.task.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: 5,
  });

  if (pending.length === 0) return;

  logger.log('cron', 'TASK_QUEUE_PROCESSING', { count: pending.length });

  for (const task of pending) {
    try {
      await db.task.update({
        where: { id: task.id },
        data: { status: 'running' },
      });

      // Mark as complete — actual execution is handled by the task executor
      // This processor catches any orphaned pending tasks
      logger.log('cron', 'TASK_QUEUE_ITEM', { taskId: task.id, agentId: task.agentId });
    } catch (err) {
      logger.log('cron', 'TASK_QUEUE_ERROR', { taskId: task.id, error: err.message });
    }
  }
}

// ─── Start All Cron Jobs ─────────────────────────────────────

function startCronJobs() {
  logger.log('cron', 'STARTING', {});

  // 1. Daily Nikita digest — every day at 08:00 UTC
  cron.schedule('0 8 * * *', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'nikita-daily-digest' });
    try { await runNikitaDigestsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'nikita-daily-digest', error: e.message }); }
  }, { timezone: 'UTC' });

  // 2. Marcus weekly financial report — every Monday at 08:00 UTC
  cron.schedule('0 8 * * 1', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'marcus-weekly-financial' });
    try { await runMarcusReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'marcus-weekly-financial', error: e.message }); }
  }, { timezone: 'UTC' });

  // 3. Priya content calendar — every Monday at 09:00 UTC
  cron.schedule('0 9 * * 1', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'priya-content-calendar' });
    try { await runPriyaReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'priya-content-calendar', error: e.message }); }
  }, { timezone: 'UTC' });

  // 4. Zara brand audit — every Tuesday at 09:00 UTC
  cron.schedule('0 9 * * 2', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'zara-brand-audit' });
    try { await runZaraReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'zara-brand-audit', error: e.message }); }
  }, { timezone: 'UTC' });

  // 5. Lena lead gen — every weekday at 07:00 UTC
  cron.schedule('0 7 * * 1-5', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'lena-daily-leadgen' });
    try { await runLenaReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'lena-daily-leadgen', error: e.message }); }
  }, { timezone: 'UTC' });

  // 6. Theo SEO check — every Wednesday at 10:00 UTC
  cron.schedule('0 10 * * 3', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'theo-weekly-seo' });
    try { await runTheoReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'theo-weekly-seo', error: e.message }); }
  }, { timezone: 'UTC' });

  // 7. Lex legal review — every Friday at 09:00 UTC (Enterprise only, filtered in report fn)
  cron.schedule('0 9 * * 5', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'lex-weekly-legal' });
    try { await runLexReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'lex-weekly-legal', error: e.message }); }
  }, { timezone: 'UTC' });

  // 8. Harper HR pack — every Monday at 10:00 UTC (Enterprise only, filtered in report fn)
  cron.schedule('0 10 * * 1', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'harper-weekly-hr' });
    try { await runHarperReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'harper-weekly-hr', error: e.message }); }
  }, { timezone: 'UTC' });

  // 9. Task queue processor — every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try { await processTaskQueue(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'task-queue-processor', error: e.message }); }
  }, { timezone: 'UTC' });

  // 10. XP + level updates — every day at midnight UTC
  cron.schedule('0 0 * * *', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'xp-updates' });
    try { await runXpUpdates(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'xp-updates', error: e.message }); }
  }, { timezone: 'UTC' });

  // 11. Kai dev sprint — every Tuesday at 09:30 UTC
  cron.schedule('30 9 * * 2', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'kai-dev-sprint' });
    try { await runKaiReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'kai-dev-sprint', error: e.message }); }
  }, { timezone: 'UTC' });

  // 12. Mia social media — every Monday at 09:30 UTC
  cron.schedule('30 9 * * 1', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'mia-social-media' });
    try { await runMiaReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'mia-social-media', error: e.message }); }
  }, { timezone: 'UTC' });

  // 13. Luna paid ads — every Wednesday at 09:00 UTC
  cron.schedule('0 9 * * 3', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'luna-paid-ads' });
    try { await runLunaReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'luna-paid-ads', error: e.message }); }
  }, { timezone: 'UTC' });

  // 14. Rex sales strategy — every Monday at 08:30 UTC (Enterprise only, filtered in fn)
  cron.schedule('30 8 * * 1', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'rex-sales-strategy' });
    try { await runRexReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'rex-sales-strategy', error: e.message }); }
  }, { timezone: 'UTC' });

  // 15. Iris bookkeeping — every Wednesday at 08:00 UTC (Enterprise only)
  cron.schedule('0 8 * * 3', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'iris-bookkeeping' });
    try { await runIrisReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'iris-bookkeeping', error: e.message }); }
  }, { timezone: 'UTC' });

  // 16. Felix forecasting — every Thursday at 08:00 UTC (Enterprise only)
  cron.schedule('0 8 * * 4', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'felix-forecasting' });
    try { await runFelixReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'felix-forecasting', error: e.message }); }
  }, { timezone: 'UTC' });

  // 17. Eli copywriting — every Tuesday at 10:00 UTC (Growth + Enterprise)
  cron.schedule('0 10 * * 2', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'eli-copy' });
    try { await runEliReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'eli-copy', error: e.message }); }
  }, { timezone: 'UTC' });

  // 18. Nora design brief — every Thursday at 09:00 UTC (Growth + Enterprise)
  cron.schedule('0 9 * * 4', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'nora-design' });
    try { await runNoraReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'nora-design', error: e.message }); }
  }, { timezone: 'UTC' });

  // 19. Otto operations — every Friday at 08:00 UTC (Enterprise only)
  cron.schedule('0 8 * * 5', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'otto-operations' });
    try { await runOttoReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'otto-operations', error: e.message }); }
  }, { timezone: 'UTC' });

  // 20. Rio frontend dev — every Wednesday at 09:30 UTC (Growth + Enterprise)
  cron.schedule('30 9 * * 3', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'rio-frontend' });
    try { await runRioReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'rio-frontend', error: e.message }); }
  }, { timezone: 'UTC' });

  // 21. Nova backend dev — every Thursday at 09:30 UTC (Growth + Enterprise)
  cron.schedule('30 9 * * 4', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'nova-backend' });
    try { await runNovaReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'nova-backend', error: e.message }); }
  }, { timezone: 'UTC' });

  // 22. Byte QA — every Thursday at 10:00 UTC (Growth + Enterprise)
  cron.schedule('0 10 * * 4', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'byte-qa' });
    try { await runByteReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'byte-qa', error: e.message }); }
  }, { timezone: 'UTC' });

  // 23. Cleo outreach — every Monday at 08:00 UTC (Enterprise only)
  cron.schedule('0 8 * * 1', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'cleo-outreach' });
    try { await runCleoReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'cleo-outreach', error: e.message }); }
  }, { timezone: 'UTC' });

  // 24. Sam CRM — every Tuesday at 08:00 UTC (Enterprise only)
  cron.schedule('0 8 * * 2', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'sam-crm' });
    try { await runSamReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'sam-crm', error: e.message }); }
  }, { timezone: 'UTC' });

  // 25. Vera admin — every Wednesday at 08:30 UTC (Enterprise only)
  cron.schedule('30 8 * * 3', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'vera-admin' });
    try { await runVeraReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'vera-admin', error: e.message }); }
  }, { timezone: 'UTC' });

  // 26. Cora compliance — every Thursday at 09:00 UTC (Enterprise only)
  cron.schedule('0 9 * * 4', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'cora-compliance' });
    try { await runCoraReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'cora-compliance', error: e.message }); }
  }, { timezone: 'UTC' });

  // 27. Jules legal docs — every Friday at 09:30 UTC (Enterprise only)
  cron.schedule('30 9 * * 5', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'jules-legal-docs' });
    try { await runJulesReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'jules-legal-docs', error: e.message }); }
  }, { timezone: 'UTC' });

  // 28. Drew talent — every Tuesday at 10:00 UTC (Enterprise only)
  cron.schedule('0 10 * * 2', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'drew-talent' });
    try { await runDrewReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'drew-talent', error: e.message }); }
  }, { timezone: 'UTC' });

  // 29. Sage people ops — every Monday at 10:30 UTC (Enterprise only)
  cron.schedule('30 10 * * 1', async () => {
    logger.log('cron', 'JOB_TRIGGERED', { job: 'sage-people-ops' });
    try { await runSageReportsForAll(); }
    catch (e) { logger.log('cron', 'JOB_FAILED', { job: 'sage-people-ops', error: e.message }); }
  }, { timezone: 'UTC' });

  logger.log('cron', 'STARTED', { jobs: 29 });
  console.log('  Cron Jobs ........... OK  (29 jobs scheduled — all 27 agents)');
}

export { startCronJobs, runXpUpdates };
