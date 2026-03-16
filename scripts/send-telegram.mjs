import 'dotenv/config';

const BOT_TOKEN = process.env.NIKITA_TELEGRAM_TOKEN;
const CHAT_ID = process.env.HARRY_TELEGRAM_ID;

const message = process.argv[2];

if (!message) {
  console.error('Usage: node send-telegram.mjs "your message"');
  process.exit(1);
}

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('Missing NIKITA_TELEGRAM_TOKEN or HARRY_TELEGRAM_ID in .env');
  process.exit(1);
}

try {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: `🏗️ *Open Agency Update*\n\n${message}`,
      parse_mode: 'Markdown'
    })
  });
  const data = await res.json();
  if (data.ok) {
    console.log('Telegram sent:', data.result.message_id);
  } else {
    console.error('Failed:', data.description);
  }
} catch (err) {
  console.error('Error:', err.message);
}
