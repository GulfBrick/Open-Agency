/**
 * Client Reports — Real Claude API calls for per-client agent reports
 *
 * Marcus, Priya, Zara each generate structured reports for a given client
 * using the master context agent prompt template.
 * Output is saved to the Report table and triggers a client notification email.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getDb, isDbAvailable } from './db.js';
import { logger } from './logger.js';
import { sendTaskCompletionEmail } from './email.js';

const MODEL = 'claude-haiku-4-5';
const client = new Anthropic();

// ─── Agent Prompt Builder ────────────────────────────────────

function buildAgentPrompt(agentName, agentRole, clientName, clientBrief, tier, taskDescription) {
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return `You are ${agentName}, the ${agentRole} at Open Agency.

Your client is ${clientName}.
Their business brief: ${clientBrief || 'No brief provided yet — make reasonable assumptions based on the business name.'}
Their tier: ${tier}

Today's date: ${today}
Your task: ${taskDescription}

Produce your output now. Be specific, actionable, and professional.
Format your response as JSON with the following structure:
{
  "summary": "one sentence summary",
  "output": "full report/output content",
  "next_actions": ["action 1", "action 2", "action 3"],
  "confidence": "high | medium | low"
}`;
}

// ─── Call Claude and parse JSON output ──────────────────────

async function callAgent(systemPrompt, userPrompt) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content[0].text;

  // Try to parse JSON, fall back to wrapping raw text
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      summary: 'Report generated',
      output: text,
      next_actions: [],
      confidence: 'medium',
    };
  }
}

// ─── Save report to DB ───────────────────────────────────────

async function saveReport(clientId, agentId, type, content) {
  const db = getDb();
  if (!db || !isDbAvailable()) {
    logger.log('client-reports', 'DB_UNAVAILABLE', { clientId, agentId, type });
    return null;
  }

  const report = await db.report.create({
    data: { clientId, agentId, type, content },
  });

  await db.auditLog.create({
    data: {
      clientId,
      agentId,
      action: 'report_generated',
      detail: { type, reportId: report.id },
    },
  });

  return report;
}

// ─── Load all clients from DB ───────────────────────────────

async function loadAllClients() {
  const db = getDb();
  if (!db || !isDbAvailable()) return [];
  return db.client.findMany({ select: { id: true, email: true, businessName: true, tier: true, brief: true } });
}

// ─── Marcus — Financial Health Report ───────────────────────

async function generateMarcusReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  logger.log('marcus', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Marcus, the Finance Director at Open Agency. You are sharp, numbers-first, and always flag risks early. You produce weekly financial health reports for clients — covering cash flow, burn rate, revenue trends, and actionable recommendations. Be direct, specific, and data-driven even when working from limited information.`;

  const userPrompt = buildAgentPrompt(
    'Marcus', 'Finance Director',
    businessName, brief, tier,
    'Produce the weekly financial health report. Cover: cash flow health, revenue vs expense trends, burn rate estimate, top 3 financial risks, and 3 specific actions the client should take this week.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('marcus', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'marcus', 'weekly-financial-report', content);

  // Notify client
  try {
    await sendTaskCompletionEmail({
      email,
      agentId: 'marcus',
      taskType: 'Weekly Financial Health Report',
      summary: result.summary,
    });
  } catch (err) {
    logger.log('marcus', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('marcus', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Zara — Tech Stack Audit ─────────────────────────────────

async function generateZaraReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  logger.log('zara', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Zara, the Creative Director at Open Agency. You specialise in brand audits, visual direction, and creative strategy. Each week you review a client's digital presence, brand consistency, and creative assets. You produce actionable reports that guide the creative team's work.`;

  const userPrompt = buildAgentPrompt(
    'Zara', 'Creative Director',
    businessName, brief, tier,
    'Produce the weekly creative & brand audit. Cover: brand consistency assessment, website/social visual health, top 3 creative opportunities, content gaps, and 3 specific actions for the creative team this week.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('zara', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'zara', 'weekly-brand-audit', content);

  try {
    await sendTaskCompletionEmail({
      email,
      agentId: 'zara',
      taskType: 'Weekly Brand & Creative Audit',
      summary: result.summary,
    });
  } catch (err) {
    logger.log('zara', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('zara', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Priya — Content Calendar ───────────────────────────────

async function generatePriyaReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  logger.log('priya', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Priya, the Marketing Director at Open Agency. You are data-driven, creative, and obsessed with ROI. Each week you produce a 2-week content calendar and marketing strategy review for clients. Your recommendations are specific, platform-aware, and tied to measurable outcomes.`;

  const userPrompt = buildAgentPrompt(
    'Priya', 'Marketing Director',
    businessName, brief, tier,
    'Produce the 2-week content calendar and weekly marketing report. Include: 10 specific content ideas (with platform, format, topic, and hook for each), current marketing priorities, top 3 growth opportunities, and 3 immediate actions.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('priya', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'priya', 'weekly-content-calendar', content);

  try {
    await sendTaskCompletionEmail({
      email,
      agentId: 'priya',
      taskType: 'Weekly Content Calendar & Marketing Report',
      summary: result.summary,
    });
  } catch (err) {
    logger.log('priya', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('priya', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Nikita Daily Digest ─────────────────────────────────────

async function generateNikitaDigest(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  logger.log('nikita', 'DIGEST_START', { clientId, businessName });

  // Pull recent reports for context
  const db = getDb();
  let recentReports = [];
  if (db && isDbAvailable()) {
    recentReports = await db.report.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { agentId: true, type: true, content: true, createdAt: true },
    });
  }

  const reportSummaries = recentReports.map(r => {
    try {
      const parsed = JSON.parse(r.content);
      return `- ${r.agentId} (${r.type}): ${parsed.summary || 'Report available'}`;
    } catch {
      return `- ${r.agentId} (${r.type}): Report available`;
    }
  }).join('\n');

  const systemPrompt = `You are Nikita, the CEO of Open Agency. You send a daily digest to your clients — a sharp, warm, executive summary of everything your team has done. Be direct, clear, and make the client feel like they have a real team working for them.`;

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const userPrompt = `You are Nikita, CEO of Open Agency.

Your client is ${businessName}.
Their brief: ${brief || 'No brief yet.'}
Their tier: ${tier}
Today: ${today}

Recent team activity:
${reportSummaries || 'No reports yet — team is getting started.'}

Write the daily digest email for this client. Cover:
1. What the team worked on today
2. Key insights or flags
3. What's happening next

Format as JSON:
{
  "summary": "one sentence",
  "output": "full digest text (conversational, warm, executive tone)",
  "next_actions": ["action 1", "action 2"],
  "confidence": "high"
}`;

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('nikita', 'DIGEST_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  await saveReport(clientId, 'nikita', 'daily-digest', content);

  try {
    await sendTaskCompletionEmail({
      email,
      agentId: 'nikita',
      taskType: 'Daily Agency Digest',
      summary: result.summary,
    });
  } catch (err) {
    logger.log('nikita', 'DIGEST_EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('nikita', 'DIGEST_DONE', { clientId });
  return result;
}

// ─── Run all reports for all clients ────────────────────────

async function runMarcusReportsForAll() {
  const clients = await loadAllClients();
  logger.log('cron', 'MARCUS_REPORTS_START', { clientCount: clients.length });
  for (const c of clients) {
    try { await generateMarcusReport(c); } catch (e) { logger.log('cron', 'MARCUS_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runZaraReportsForAll() {
  const clients = await loadAllClients();
  logger.log('cron', 'ZARA_REPORTS_START', { clientCount: clients.length });
  for (const c of clients) {
    try { await generateZaraReport(c); } catch (e) { logger.log('cron', 'ZARA_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runPriyaReportsForAll() {
  const clients = await loadAllClients();
  logger.log('cron', 'PRIYA_REPORTS_START', { clientCount: clients.length });
  for (const c of clients) {
    try { await generatePriyaReport(c); } catch (e) { logger.log('cron', 'PRIYA_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runNikitaDigestsForAll() {
  const clients = await loadAllClients();
  logger.log('cron', 'NIKITA_DIGESTS_START', { clientCount: clients.length });
  for (const c of clients) {
    try { await generateNikitaDigest(c); } catch (e) { logger.log('cron', 'NIKITA_DIGEST_ERROR', { clientId: c.id, error: e.message }); }
  }
}

export {
  generateMarcusReport,
  generateZaraReport,
  generatePriyaReport,
  generateNikitaDigest,
  runMarcusReportsForAll,
  runZaraReportsForAll,
  runPriyaReportsForAll,
  runNikitaDigestsForAll,
};
