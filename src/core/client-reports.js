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

// ─── Lena — Lead Generation Report ──────────────────────────

async function generateLenaReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  logger.log('lena', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Lena, the Lead Generation specialist at Open Agency. You are relentless, data-driven, and always building pipeline. Each day you research ideal customer profiles, build prospect lists, and identify high-value leads for clients. You are specific about who to target and why.`;

  const userPrompt = buildAgentPrompt(
    'Lena', 'Lead Generation',
    businessName, brief, tier,
    'Run a daily lead generation pass. Produce: 5 new qualified prospect leads (with company name, contact name, role, LinkedIn URL placeholder, and why they fit the ICP), a summary of ICP adjustments, and 3 outreach angles to test this week.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('lena', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const db = getDb();
  if (db && isDbAvailable()) {
    // Save as task output
    await db.task.create({
      data: {
        clientId,
        agentId: 'lena',
        type: 'daily-lead-gen',
        status: 'complete',
        input: { trigger: 'cron' },
        output: result,
        completedAt: new Date(),
      },
    });
    await db.auditLog.create({
      data: {
        clientId,
        agentId: 'lena',
        action: 'lead_gen_completed',
        detail: { prospects: result.next_actions?.length || 0 },
      },
    });
  }

  try {
    await sendTaskCompletionEmail({
      email,
      agentId: 'lena',
      taskType: 'Daily Lead Generation',
      summary: result.summary,
    });
  } catch (err) {
    logger.log('lena', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('lena', 'REPORT_DONE', { clientId });
  return result;
}

// ─── Theo — SEO Report ──────────────────────────────────────

async function generateTheoReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  logger.log('theo', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Theo, the SEO specialist at Open Agency. You are methodical, keyword-obsessed, and always optimising. Each week you produce SEO audits with keyword rankings, on-page recommendations, content briefs, and technical SEO fixes. You back every recommendation with reasoning.`;

  const userPrompt = buildAgentPrompt(
    'Theo', 'SEO Specialist',
    businessName, brief, tier,
    'Produce the weekly SEO check. Cover: 5 target keywords with estimated ranking, 3 on-page optimisation recommendations, 2 content brief ideas targeting search intent, 1 technical SEO issue to fix, and a competitor keyword gap analysis.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('theo', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'theo', 'weekly-seo-check', content);

  try {
    await sendTaskCompletionEmail({
      email,
      agentId: 'theo',
      taskType: 'Weekly SEO Check',
      summary: result.summary,
    });
  } catch (err) {
    logger.log('theo', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('theo', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Lex — Legal Document Review (Enterprise only) ──────────

async function generateLexReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier !== 'enterprise') return null;

  logger.log('lex', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Lex, the Legal Director at Open Agency. You are thorough, cautious, and always flagging risk. Each week you review your client's legal exposure — contracts, terms, compliance obligations, and regulatory changes. You produce actionable summaries, not jargon.`;

  const userPrompt = buildAgentPrompt(
    'Lex', 'Legal Director',
    businessName, brief, tier,
    'Produce the weekly legal document review. Cover: current contract/risk summary, 3 compliance items to check, any regulatory changes affecting the client\'s industry, and recommended legal actions for the week.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('lex', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'lex', 'weekly-legal-review', content);

  try {
    await sendTaskCompletionEmail({
      email,
      agentId: 'lex',
      taskType: 'Weekly Legal Review',
      summary: result.summary,
    });
  } catch (err) {
    logger.log('lex', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('lex', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Harper — HR Weekly Pack (Enterprise only) ──────────────

async function generateHarperReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier !== 'enterprise') return null;

  logger.log('harper', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Harper, the HR Director at Open Agency. You are people-first, strategic, and always thinking about culture and talent. Each week you produce an HR pack covering hiring pipeline, people ops updates, org health, and recommended actions. Practical and warm.`;

  const userPrompt = buildAgentPrompt(
    'Harper', 'HR Director',
    businessName, brief, tier,
    'Produce the weekly HR pack. Cover: hiring pipeline summary, any open roles and recruitment progress, people ops recommendations, 3 culture/team health observations, and suggested HR actions for the week.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('harper', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'harper', 'weekly-hr-pack', content);

  try {
    await sendTaskCompletionEmail({
      email,
      agentId: 'harper',
      taskType: 'Weekly HR Pack',
      summary: result.summary,
    });
  } catch (err) {
    logger.log('harper', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('harper', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Kai — Dev Sprint Report ─────────────────────────────────

async function generateKaiReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier === 'starter') return null;
  logger.log('kai', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Kai, the Dev Lead at Open Agency. You are decisive, technically sharp, and ship-focused. Each week you review the client's tech project, break down what needs building, and assign work to the team. Your reports are precise, prioritised, and include real code direction.`;

  const userPrompt = buildAgentPrompt(
    'Kai', 'Dev Lead',
    businessName, brief, tier,
    'Produce the weekly dev sprint report. Cover: sprint goal and top 3 technical priorities, feature breakdown with estimated effort, any technical debt to address, blockers to flag, and recommended architecture decisions for the week.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('kai', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'kai', 'weekly-dev-sprint', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'kai', taskType: 'Weekly Dev Sprint Report', summary: result.summary });
  } catch (err) {
    logger.log('kai', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('kai', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Mia — Social Media Report ───────────────────────────────

async function generateMiaReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier === 'starter') return null;
  logger.log('mia', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Mia, the Social Media specialist at Open Agency. You live on social media, know every platform inside out, and always write content that gets engagement. You write posts, build schedules, and track what's working. Your tone is sharp, current, and always on brand.`;

  const userPrompt = buildAgentPrompt(
    'Mia', 'Social Media Specialist',
    businessName, brief, tier,
    'Produce the weekly social media report. Include: 5 ready-to-post social posts (with platform, caption, and hashtags), engagement performance summary, 3 trending topics to leverage, and this week\'s posting schedule recommendation.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('mia', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'mia', 'weekly-social-media', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'mia', taskType: 'Weekly Social Media Report', summary: result.summary });
  } catch (err) {
    logger.log('mia', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('mia', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Luna — Paid Ads Report ──────────────────────────────────

async function generateLunaReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier === 'starter') return null;
  logger.log('luna', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Luna, the Paid Ads specialist at Open Agency. You are data-obsessed, ROAS-driven, and always optimising. You manage ad budgets, write ad copy, set up audience targeting, and report on performance with precision. You never waste ad spend.`;

  const userPrompt = buildAgentPrompt(
    'Luna', 'Paid Ads Specialist',
    businessName, brief, tier,
    'Produce the weekly paid ads report. Cover: current campaign performance (CTR, CPC, ROAS estimates), 3 ad copy variations to test, audience targeting recommendations, budget allocation advice, and top 3 optimisation actions for this week.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('luna', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'luna', 'weekly-paid-ads', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'luna', taskType: 'Weekly Paid Ads Report', summary: result.summary });
  } catch (err) {
    logger.log('luna', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('luna', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Rex — Sales Strategy Report ────────────────────────────

async function generateRexReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier !== 'enterprise') return null;
  logger.log('rex', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Rex, the Sales Director at Open Agency. You are competitive, pipeline-obsessed, and close deals. Each week you review the sales strategy, prospect pipeline, outreach performance, and identify new opportunities. Your reports drive revenue.`;

  const userPrompt = buildAgentPrompt(
    'Rex', 'Sales Director',
    businessName, brief, tier,
    'Produce the weekly sales strategy report. Cover: pipeline health and deal stages, 5 highest-priority prospects to focus on, outreach strategy for the week, objection handling tips for the most common blockers, and 3 actions to accelerate revenue this week.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('rex', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'rex', 'weekly-sales-strategy', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'rex', taskType: 'Weekly Sales Strategy Report', summary: result.summary });
  } catch (err) {
    logger.log('rex', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('rex', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Iris — Bookkeeping Report ───────────────────────────────

async function generateIrisReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier !== 'enterprise') return null;
  logger.log('iris', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Iris, the Bookkeeping specialist at Open Agency. You are meticulous, organised, and never let a number slide. Each week you categorise expenses, track invoices, and flag anything that looks off. Your reports give clients a clear view of their money.`;

  const userPrompt = buildAgentPrompt(
    'Iris', 'Bookkeeping Specialist',
    businessName, brief, tier,
    'Produce the weekly bookkeeping report. Cover: expense categories and totals, outstanding invoices to chase, any unusual or uncategorised transactions, recommendations for cost efficiency, and a clean summary of current financial position.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('iris', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'iris', 'weekly-bookkeeping', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'iris', taskType: 'Weekly Bookkeeping Report', summary: result.summary });
  } catch (err) {
    logger.log('iris', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('iris', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Felix — Forecasting Report ─────────────────────────────

async function generateFelixReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier !== 'enterprise') return null;
  logger.log('felix', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Felix, the Financial Forecasting specialist at Open Agency. You are analytical, forward-thinking, and always model the risks. Each week you build revenue projections, scenario models, and give clients a clear-eyed view of where they're heading financially.`;

  const userPrompt = buildAgentPrompt(
    'Felix', 'Financial Forecaster',
    businessName, brief, tier,
    'Produce the weekly financial forecast. Include: 30/60/90-day revenue projection with assumptions, three scenarios (base / bull / bear), key metrics to track, top 2 financial risks to monitor, and recommended financial moves this week.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('felix', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'felix', 'weekly-forecast', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'felix', taskType: 'Weekly Financial Forecast', summary: result.summary });
  } catch (err) {
    logger.log('felix', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('felix', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Eli — Copywriting Report ────────────────────────────────

async function generateEliReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier === 'starter') return null;
  logger.log('eli', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Eli, the Copywriter at Open Agency. You write words that convert. Landing pages, email sequences, ad copy, sales scripts — you make every word earn its place. Your copy is sharp, benefits-focused, and always speaks directly to the customer.`;

  const userPrompt = buildAgentPrompt(
    'Eli', 'Copywriter',
    businessName, brief, tier,
    'Produce the weekly copywriting output. Deliver: 3 email subject line variants (for a promotional campaign), one full landing page headline + subheadline + CTA set, 2 ad copy variants (short-form), and 3 messaging angles to test this week.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('eli', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'eli', 'weekly-copy', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'eli', taskType: 'Weekly Copywriting Output', summary: result.summary });
  } catch (err) {
    logger.log('eli', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('eli', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Nora — Graphic Design Brief ─────────────────────────────

async function generateNoraReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier === 'starter') return null;
  logger.log('nora', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Nora, the Graphic Design specialist at Open Agency. You think visually, brief with precision, and make brands look exceptional. Each week you produce design briefs, generate visual direction, and guide the creative team on what to make and how it should look.`;

  const userPrompt = buildAgentPrompt(
    'Nora', 'Graphic Design Specialist',
    businessName, brief, tier,
    'Produce the weekly design brief. Include: 3 design assets to create this week (with brief, dimensions, purpose, and visual style direction for each), brand colour/font reminders, any visual inconsistencies to fix, and top design priority for the week.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('nora', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'nora', 'weekly-design-brief', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'nora', taskType: 'Weekly Design Brief', summary: result.summary });
  } catch (err) {
    logger.log('nora', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('nora', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Otto — Operations Report ────────────────────────────────

async function generateOttoReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier !== 'enterprise') return null;
  logger.log('otto', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Otto, the Operations Manager at Open Agency. You are systematic, efficient, and obsessed with removing friction. You build SOPs, automate workflows, and ensure the business runs smoothly. Your reports spot inefficiencies and provide clear operational improvements.`;

  const userPrompt = buildAgentPrompt(
    'Otto', 'Operations Manager',
    businessName, brief, tier,
    'Produce the weekly operations report. Cover: top 3 operational inefficiencies identified, 2 SOPs to create or update, workflow automation opportunities, resource utilisation summary, and 3 operational quick wins for this week.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('otto', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'otto', 'weekly-operations', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'otto', taskType: 'Weekly Operations Report', summary: result.summary });
  } catch (err) {
    logger.log('otto', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('otto', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Rio — Frontend Dev Report ──────────────────────────────

async function generateRioReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier === 'starter') return null;
  logger.log('rio', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Rio, the Frontend Developer at Open Agency. You build beautiful, fast, accessible UIs in React and Next.js. Each week you review the client's frontend — performance, accessibility, UI/UX issues — and produce a concrete list of improvements with implementation suggestions.`;

  const userPrompt = buildAgentPrompt(
    'Rio', 'Frontend Developer',
    businessName, brief, tier,
    'Produce the weekly frontend development report. Include: top 3 UI/UX improvements to ship this week, any performance issues to address (Core Web Vitals, load times), accessibility quick wins, 1 component to refactor or build, and estimated effort for each item.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('rio', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'rio', 'weekly-frontend-report', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'rio', taskType: 'Weekly Frontend Development Report', summary: result.summary });
  } catch (err) {
    logger.log('rio', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('rio', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Nova — Backend Dev Report ──────────────────────────────

async function generateNovaReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier === 'starter') return null;
  logger.log('nova', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Nova, the Backend Developer at Open Agency. You architect robust APIs, optimise databases, and keep systems running clean. Each week you review backend health, identify bottlenecks, and ship improvements. You write Node/Express and Python with precision.`;

  const userPrompt = buildAgentPrompt(
    'Nova', 'Backend Developer',
    businessName, brief, tier,
    'Produce the weekly backend development report. Include: API health summary, top 3 backend improvements to ship this week, any security concerns or dependency updates, database query optimisations, and one architecture improvement to plan.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('nova', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'nova', 'weekly-backend-report', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'nova', taskType: 'Weekly Backend Development Report', summary: result.summary });
  } catch (err) {
    logger.log('nova', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('nova', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Byte — QA Report ───────────────────────────────────────

async function generateByteReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier === 'starter') return null;
  logger.log('byte', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Byte, the QA specialist at Open Agency. You think like a user trying to break things. You write test plans, file bug reports, run regression checks, and make sure nothing ships broken. You are methodical, thorough, and direct about what's wrong.`;

  const userPrompt = buildAgentPrompt(
    'Byte', 'QA Specialist',
    businessName, brief, tier,
    'Produce the weekly QA report. Include: top 5 test cases to run this week, any known bugs or regressions to verify, a regression test checklist for recent changes, recommended test automation to add, and current quality health score with justification.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('byte', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'byte', 'weekly-qa-report', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'byte', taskType: 'Weekly QA Report', summary: result.summary });
  } catch (err) {
    logger.log('byte', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('byte', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Cleo — Outreach Report ──────────────────────────────────

async function generateCleoReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier !== 'enterprise') return null;
  logger.log('cleo', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Cleo, the Outreach specialist at Open Agency. You write cold emails and DMs that get replies. You understand buyer psychology, personalisation at scale, and follow-up sequencing. Your outreach is relevant, human, and always focused on the prospect's problem — not the client's product.`;

  const userPrompt = buildAgentPrompt(
    'Cleo', 'Outreach Specialist',
    businessName, brief, tier,
    'Produce the weekly outreach plan. Include: a 3-email cold email sequence (subject + body for each), 2 LinkedIn DM scripts for different prospect personas, follow-up timing strategy, and 3 A/B test ideas for subject lines or opening hooks.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('cleo', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'cleo', 'weekly-outreach-plan', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'cleo', taskType: 'Weekly Outreach Plan', summary: result.summary });
  } catch (err) {
    logger.log('cleo', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('cleo', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Sam — CRM Management Report ────────────────────────────

async function generateSamReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier !== 'enterprise') return null;
  logger.log('sam', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Sam, the CRM Manager at Open Agency. You keep the pipeline clean, deals moving, and nothing falling through the cracks. You audit CRM hygiene, flag stale deals, and recommend follow-up actions. You are organised, proactive, and data-driven.`;

  const userPrompt = buildAgentPrompt(
    'Sam', 'CRM Manager',
    businessName, brief, tier,
    'Produce the weekly CRM management report. Include: pipeline health assessment, top 5 deals requiring action this week, deals at risk of going cold (with recommended re-engagement), CRM data hygiene recommendations, and a summary of pipeline metrics.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('sam', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'sam', 'weekly-crm-report', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'sam', taskType: 'Weekly CRM Report', summary: result.summary });
  } catch (err) {
    logger.log('sam', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('sam', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Vera — Admin Report ─────────────────────────────────────

async function generateVeraReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier !== 'enterprise') return null;
  logger.log('vera', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Vera, the Admin specialist at Open Agency. You keep everything organised — schedules, documents, task coordination, follow-ups. You are proactive, detail-oriented, and always make sure nothing gets dropped. Your weekly reports surface admin bottlenecks and propose solutions.`;

  const userPrompt = buildAgentPrompt(
    'Vera', 'Admin Specialist',
    businessName, brief, tier,
    'Produce the weekly admin and coordination report. Include: top 5 admin tasks to complete this week, any scheduling or meeting prep needed, document management recommendations, follow-up reminders, and process improvements to reduce admin overhead.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('vera', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'vera', 'weekly-admin-report', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'vera', taskType: 'Weekly Admin Report', summary: result.summary });
  } catch (err) {
    logger.log('vera', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('vera', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Cora — Compliance Report ────────────────────────────────

async function generateCoraReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier !== 'enterprise') return null;
  logger.log('cora', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Cora, the Compliance specialist at Open Agency. You ensure clients stay on the right side of regulations without drowning in paperwork. You are thorough, pragmatic, and always flag the highest-risk items first. You draft policy summaries and compliance checklists that people actually use.`;

  const userPrompt = buildAgentPrompt(
    'Cora', 'Compliance Specialist',
    businessName, brief, tier,
    'Produce the weekly compliance report. Include: top 3 compliance risks to monitor this week, any regulatory updates relevant to this business, a compliance checklist for current operations, one policy to review or update, and recommended immediate actions.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('cora', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'cora', 'weekly-compliance-report', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'cora', taskType: 'Weekly Compliance Report', summary: result.summary });
  } catch (err) {
    logger.log('cora', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('cora', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Jules — Legal Documentation Report ─────────────────────

async function generateJulesReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier !== 'enterprise') return null;
  logger.log('jules', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Jules, the Legal Documentation specialist at Open Agency. You draft NDAs, privacy policies, service agreements, and legal templates with precision. You write in plain English where possible without losing legal accuracy. Each week you produce or review a legal document relevant to the client's current operations.`;

  const userPrompt = buildAgentPrompt(
    'Jules', 'Legal Documentation Specialist',
    businessName, brief, tier,
    'Produce the weekly legal documentation report. Include: one legal document draft or template relevant to this business (NDA, privacy policy section, service agreement clause, or similar), flagged legal language that needs updating in existing docs, and 3 documentation priorities for the week.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('jules', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'jules', 'weekly-legal-docs', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'jules', taskType: 'Weekly Legal Documentation', summary: result.summary });
  } catch (err) {
    logger.log('jules', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('jules', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Drew — Talent Report ────────────────────────────────────

async function generateDrewReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier !== 'enterprise') return null;
  logger.log('drew', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Drew, the Talent specialist at Open Agency. You write job descriptions that attract the right people, build interview kits that actually work, and draft offer letters that close. You are strategic about hiring — every role should solve a real problem and every hire should raise the bar.`;

  const userPrompt = buildAgentPrompt(
    'Drew', 'Talent Specialist',
    businessName, brief, tier,
    'Produce the weekly talent report. Include: assessment of current hiring needs based on business brief, one job description draft for the highest-priority open role (or anticipated need), a 5-question interview kit for that role, offer letter template outline, and 3 talent acquisition priorities for the week.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('drew', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'drew', 'weekly-talent-report', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'drew', taskType: 'Weekly Talent Report', summary: result.summary });
  } catch (err) {
    logger.log('drew', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('drew', 'REPORT_DONE', { clientId, reportId: report?.id });
  return result;
}

// ─── Sage — People Ops Report ────────────────────────────────

async function generateSageReport(clientObj) {
  const { id: clientId, email, businessName, tier, brief } = clientObj;
  if (tier !== 'enterprise') return null;
  logger.log('sage', 'REPORT_START', { clientId, businessName });

  const systemPrompt = `You are Sage, the People Operations specialist at Open Agency. You build the systems that make teams work — onboarding docs, SOPs, performance frameworks, culture playbooks. You are thoughtful, human-centred, and practical. You make complex HR processes feel simple.`;

  const userPrompt = buildAgentPrompt(
    'Sage', 'People Operations Specialist',
    businessName, brief, tier,
    'Produce the weekly people operations report. Include: employee experience assessment, one onboarding document to create or improve, a performance review framework recommendation, 3 SOPs to document this week, and a culture health check with action items.'
  );

  let result;
  try {
    result = await callAgent(systemPrompt, userPrompt);
  } catch (err) {
    logger.log('sage', 'REPORT_FAILED', { clientId, error: err.message });
    throw err;
  }

  const content = JSON.stringify(result);
  const report = await saveReport(clientId, 'sage', 'weekly-people-ops', content);

  try {
    await sendTaskCompletionEmail({ email, agentId: 'sage', taskType: 'Weekly People Ops Report', summary: result.summary });
  } catch (err) {
    logger.log('sage', 'EMAIL_FAILED', { clientId, error: err.message });
  }

  logger.log('sage', 'REPORT_DONE', { clientId, reportId: report?.id });
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

async function runLenaReportsForAll() {
  const clients = await loadAllClients();
  logger.log('cron', 'LENA_REPORTS_START', { clientCount: clients.length });
  for (const c of clients) {
    // Lena runs for growth + enterprise (Sales-adjacent, available via lead gen)
    if (c.tier === 'starter') continue;
    try { await generateLenaReport(c); } catch (e) { logger.log('cron', 'LENA_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runTheoReportsForAll() {
  const clients = await loadAllClients();
  logger.log('cron', 'THEO_REPORTS_START', { clientCount: clients.length });
  for (const c of clients) {
    if (c.tier === 'starter') continue;
    try { await generateTheoReport(c); } catch (e) { logger.log('cron', 'THEO_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runLexReportsForAll() {
  const clients = await loadAllClients();
  logger.log('cron', 'LEX_REPORTS_START', { clientCount: clients.length });
  for (const c of clients) {
    try { await generateLexReport(c); } catch (e) { logger.log('cron', 'LEX_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runHarperReportsForAll() {
  const clients = await loadAllClients();
  logger.log('cron', 'HARPER_REPORTS_START', { clientCount: clients.length });
  for (const c of clients) {
    try { await generateHarperReport(c); } catch (e) { logger.log('cron', 'HARPER_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runKaiReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateKaiReport(c); } catch (e) { logger.log('cron', 'KAI_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runMiaReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateMiaReport(c); } catch (e) { logger.log('cron', 'MIA_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runLunaReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateLunaReport(c); } catch (e) { logger.log('cron', 'LUNA_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runRexReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateRexReport(c); } catch (e) { logger.log('cron', 'REX_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runIrisReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateIrisReport(c); } catch (e) { logger.log('cron', 'IRIS_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runFelixReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateFelixReport(c); } catch (e) { logger.log('cron', 'FELIX_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runEliReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateEliReport(c); } catch (e) { logger.log('cron', 'ELI_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runNoraReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateNoraReport(c); } catch (e) { logger.log('cron', 'NORA_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runOttoReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateOttoReport(c); } catch (e) { logger.log('cron', 'OTTO_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runRioReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateRioReport(c); } catch (e) { logger.log('cron', 'RIO_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runNovaReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateNovaReport(c); } catch (e) { logger.log('cron', 'NOVA_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runByteReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateByteReport(c); } catch (e) { logger.log('cron', 'BYTE_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runCleoReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateCleoReport(c); } catch (e) { logger.log('cron', 'CLEO_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runSamReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateSamReport(c); } catch (e) { logger.log('cron', 'SAM_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runVeraReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateVeraReport(c); } catch (e) { logger.log('cron', 'VERA_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runCoraReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateCoraReport(c); } catch (e) { logger.log('cron', 'CORA_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runJulesReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateJulesReport(c); } catch (e) { logger.log('cron', 'JULES_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runDrewReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateDrewReport(c); } catch (e) { logger.log('cron', 'DREW_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

async function runSageReportsForAll() {
  const clients = await loadAllClients();
  for (const c of clients) {
    try { await generateSageReport(c); } catch (e) { logger.log('cron', 'SAGE_REPORT_ERROR', { clientId: c.id, error: e.message }); }
  }
}

export {
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
};
