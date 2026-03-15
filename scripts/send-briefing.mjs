import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'openagency.n@gmail.com',
    pass: 'zcdo dunn lhuu mtrb'
  }
});

const emailHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 0; }
    .wrapper { max-width: 640px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #0A0B14 0%, #1a0a2e 100%); padding: 40px 40px 32px; }
    .logo { font-size: 13px; font-weight: 700; letter-spacing: 3px; color: #7C3AED; text-transform: uppercase; margin-bottom: 8px; }
    .header h1 { color: #ffffff; font-size: 28px; font-weight: 700; margin: 0; letter-spacing: -0.5px; }
    .header p { color: #94A3B8; font-size: 13px; margin: 8px 0 0; }
    .body { padding: 40px; }
    .greeting { font-size: 16px; color: #1a202c; margin-bottom: 24px; }
    .section { margin-bottom: 32px; }
    .section-title { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #7C3AED; margin-bottom: 12px; }
    .section p { font-size: 14px; color: #4a5568; line-height: 1.7; margin: 0 0 12px; }
    .stat-row { display: flex; gap: 16px; margin: 20px 0; }
    .stat { flex: 1; background: #f8f9fa; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: 700; color: #7C3AED; }
    .stat-label { font-size: 11px; color: #94A3B8; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
    .checklist { list-style: none; padding: 0; margin: 0; }
    .checklist li { padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #4a5568; display: flex; align-items: center; gap: 10px; }
    .checklist li:last-child { border-bottom: none; }
    .check { color: #10B981; font-weight: 700; }
    .pending { color: #F59E0B; font-weight: 700; }
    .divider { height: 1px; background: #f0f0f0; margin: 32px 0; }
    .footer { background: #0A0B14; padding: 32px 40px; }
    .footer-logo { font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 4px; }
    .footer-tagline { font-size: 12px; color: #7C3AED; margin-bottom: 16px; }
    .footer-sig { font-size: 13px; color: #94A3B8; line-height: 1.6; }
    .footer-name { color: #ffffff; font-weight: 600; }
    .footer-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 16px 0; }
    .footer-legal { font-size: 11px; color: #475569; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="logo">Open Agency</div>
      <h1>1PM Briefing — 15 March 2026</h1>
      <p>From the desk of Nikita · CEO, Open Agency</p>
    </div>
    <div class="body">
      <p class="greeting">Harry,</p>

      <div class="section">
        <div class="section-title">Overnight Progress</div>
        <p>I've been heads down since you went to sleep. Here's what the team delivered:</p>
        <ul class="checklist">
          <li><span class="check">✓</span> Dashboard fully rebuilt — animated agency building with department floors, agent desks, chat bubbles, and live activity</li>
          <li><span class="check">✓</span> Full rebrand — "Open Claw Agency" replaced with "Open Agency" across 55 files</li>
          <li><span class="check">✓</span> 8 scheduled agent tasks configured — CFO, CMO, CTO running daily check-ins</li>
          <li><span class="check">✓</span> All changes pushed to GitHub (main branch)</li>
          <li><span class="check">✓</span> nodemailer installed — hence this email</li>
          <li><span class="pending">→</span> Agents need real work — they're scheduled but idle without active briefs</li>
          <li><span class="pending">→</span> X (Twitter) account pending your approval — Jade is ready to post</li>
        </ul>
      </div>

      <div class="divider"></div>

      <div class="section">
        <div class="section-title">Agency Status</div>
        <div class="stat-row">
          <div class="stat"><div class="stat-value">21</div><div class="stat-label">Agents Online</div></div>
          <div class="stat"><div class="stat-value">1</div><div class="stat-label">Active Client</div></div>
          <div class="stat"><div class="stat-value">8</div><div class="stat-label">Scheduled Tasks</div></div>
          <div class="stat"><div class="stat-value">£0</div><div class="stat-label">Revenue (Day 1)</div></div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="section">
        <div class="section-title">What I Need From You</div>
        <p>You said you're our first client. To put the team to work on Clearline Markets properly, I need a brief — even a rough one. What's the biggest problem in the business right now? What would a world-class team tackle first?</p>
        <p>Also — if you have an X account to share, Jade will start building the Open Agency brand in public today.</p>
      </div>

      <div class="divider"></div>

      <div class="section">
        <div class="section-title">My Commitment</div>
        <p>Open Agency is not a tool. It's a team. And teams deliver. I'm running this properly — briefs, departments, accountability. You'll get daily updates from me, and your agents will earn their keep.</p>
        <p>Intelligence at work. That's not just a motto. It's what happens here every day.</p>
      </div>
    </div>
    <div class="footer">
      <div class="footer-logo">Open Agency</div>
      <div class="footer-tagline">Intelligence at work.</div>
      <div class="footer-divider"></div>
      <div class="footer-sig">
        <span class="footer-name">Nikita</span><br>
        CEO & Owner, Open Agency<br>
        openagency.n@gmail.com
      </div>
      <div class="footer-divider"></div>
      <div class="footer-legal">Open Agency © 2026 · This email was sent from an AI CEO. Genuinely.</div>
    </div>
  </div>
</body>
</html>
`;

const mailOptions = {
  from: '"Nikita | Open Agency" <openagency.n@gmail.com>',
  to: 'daniel.swart@clearlinemarkets.com',
  subject: '1PM Briefing — Open Agency is alive and working',
  html: emailHTML
};

try {
  const info = await transporter.sendMail(mailOptions);
  console.log('Email sent:', info.messageId);
} catch (err) {
  console.error('Failed to send:', err.message);
}
