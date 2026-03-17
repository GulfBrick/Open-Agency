/**
 * Email Module — Nodemailer via Gmail
 *
 * Sends transactional emails from openagency.n@gmail.com
 */

import nodemailer from 'nodemailer';
import { logger } from './logger.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    logger.log('email', 'SKIP', { reason: 'GMAIL_USER or GMAIL_APP_PASSWORD not set' });
    return null;
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  return transporter;
}

// ─── Welcome Email ───────────────────────────────────────────

async function sendWelcomeEmail({ email, tier, businessName }) {
  const t = getTransporter();
  if (!t) throw new Error('Email not configured');

  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  const portalUrl = `${process.env.FRONTEND_URL || 'https://oagencyconsulting.com'}/portal`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: 'Helvetica Neue', sans-serif; background: #0a0a0a; color: #e5e5e5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #111; border: 1px solid #222; border-radius: 12px; padding: 40px; }
    .logo { font-size: 24px; font-weight: 700; color: #fff; letter-spacing: -0.5px; margin-bottom: 32px; }
    .logo span { color: #7c3aed; }
    h1 { font-size: 28px; font-weight: 700; color: #fff; margin: 0 0 12px; }
    p { color: #999; line-height: 1.6; margin: 0 0 16px; }
    .tier-badge { display: inline-block; background: #7c3aed22; border: 1px solid #7c3aed; color: #a78bfa; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
    .cta { display: inline-block; background: #7c3aed; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin-top: 8px; }
    .agents { background: #0a0a0a; border-radius: 8px; padding: 20px; margin: 24px 0; }
    .agents h3 { color: #fff; margin: 0 0 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
    .agent-list { color: #666; font-size: 14px; line-height: 1.8; }
    .divider { border: none; border-top: 1px solid #222; margin: 32px 0; }
    .footer { color: #444; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">Open<span>Agency</span></div>
    <div class="tier-badge">${tierLabel} Plan</div>
    <h1>Welcome aboard${businessName ? ', ' + businessName : ''}.</h1>
    <p>Your AI team is ready to work. Nikita is your main point of contact — she's already been briefed on your business and has activated your agents.</p>
    <div class="agents">
      <h3>Your Team</h3>
      <div class="agent-list">
        ${getAgentListHtml(tier)}
      </div>
    </div>
    <p>Head to your client portal to complete your business brief, connect your tools, and get your first reports.</p>
    <a href="${portalUrl}" class="cta">Go to Your Portal →</a>
    <hr class="divider" />
    <p class="footer">Open Agency · Intelligence at work · <a href="https://oagencyconsulting.com" style="color: #555;">oagencyconsulting.com</a></p>
  </div>
</body>
</html>
  `;

  await t.sendMail({
    from: `"Nikita — Open Agency" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `Your Open Agency team is ready, ${businessName || ''}`.trim(),
    html,
  });
}

function getAgentListHtml(tier) {
  if (tier === 'enterprise') {
    return 'Nikita (CEO) · Marcus (CFO) · Priya (CMO) · Zara (CTO) · Kai (Dev Lead) · Rex (Sales) · Lex (Legal) · Harper (HR) · and 19 more agents';
  }
  if (tier === 'growth') {
    return 'Nikita (CEO) · Marcus (CFO) · Priya (CMO) · Kai (Dev Lead) · Rio · Nova · Byte · Mia · Theo · Luna';
  }
  return 'Nikita (CEO) · Your chosen department team (Sales / Marketing / Dev / Creative)';
}

// ─── Task Completion Email ───────────────────────────────────

async function sendTaskCompletionEmail({ email, agentId, taskType, summary }) {
  const t = getTransporter();
  if (!t) return;

  const agentName = agentId.charAt(0).toUpperCase() + agentId.slice(1);
  const portalUrl = `${process.env.FRONTEND_URL || 'https://oagencyconsulting.com'}/portal`;

  await t.sendMail({
    from: `"${agentName} — Open Agency" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `${agentName} just completed: ${taskType}`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #111;">${agentName} completed a task</h2>
        <p style="color: #555;"><strong>Task:</strong> ${taskType}</p>
        <p style="color: #555;"><strong>Summary:</strong> ${summary}</p>
        <p style="margin-top: 24px;"><a href="${portalUrl}" style="background: #7c3aed; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px;">View in Portal →</a></p>
      </div>
    `,
  });
}

// ─── Agent Level-Up Email ────────────────────────────────────

async function sendAgentLevelUpEmail({ email, agentId, agentName, newLevel, businessName }) {
  const t = getTransporter();
  if (!t) return;

  const portalUrl = `${process.env.FRONTEND_URL || 'https://oagencyconsulting.com'}/portal`;

  const levelMessages = {
    2: 'getting to know your business inside out',
    3: 'operating at senior level — deeper insights, sharper recommendations',
    4: 'working at expert level — you\'re seeing the difference',
    5: 'hitting peak performance — elite-tier outputs',
  };
  const levelMsg = levelMessages[newLevel] || 'continuing to level up';

  await t.sendMail({
    from: `"Nikita — Open Agency" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `${agentName} just hit Level ${newLevel} 🎯`,
    html: `
      <div style="font-family: 'Helvetica Neue', sans-serif; background: #0a0a0a; color: #e5e5e5; max-width: 500px; margin: 0 auto; padding: 40px 32px; border-radius: 12px;">
        <div style="font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 24px;">Open<span style="color: #7c3aed">Agency</span></div>
        <div style="background: #7c3aed22; border: 1px solid #7c3aed44; border-radius: 12px; padding: 24px; margin-bottom: 24px; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 8px;">⚡</div>
          <div style="font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 4px;">${agentName} reached Level ${newLevel}</div>
          <div style="font-size: 13px; color: #a78bfa;">${levelMsg}</div>
        </div>
        <p style="color: #888; font-size: 14px; line-height: 1.7; margin: 0 0 20px;">
          The longer your agents work with ${businessName || 'your business'}, the better they get. ${agentName} has been putting in the work — and it shows.
        </p>
        <a href="${portalUrl}" style="display: inline-block; background: #7c3aed; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">View in Portal →</a>
        <p style="color: #333; font-size: 11px; margin-top: 32px;">Open Agency · Intelligence at work</p>
      </div>
    `,
  });
}

export { sendWelcomeEmail, sendTaskCompletionEmail, sendAgentLevelUpEmail };
