import { ImapFlow } from 'imapflow';

const client = new ImapFlow({
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: { user: 'openagency.n@gmail.com', pass: 'zcdo dunn lhuu mtrb' },
  logger: false
});

await client.connect();
const lock = await client.getMailboxLock('INBOX');
try {
  const messages = [];
  for await (const msg of client.fetch('1:20', { envelope: true })) {
    messages.push({
      seq: msg.seq,
      subject: msg.envelope.subject,
      from: msg.envelope.from?.[0]?.address,
      date: msg.envelope.date
    });
  }
  const sorted = messages.reverse();
  if (sorted.length === 0) {
    console.log('No messages in inbox yet.');
  } else {
    console.log(`Found ${sorted.length} messages:\n`);
    for (const m of sorted) {
      console.log(`From: ${m.from}`);
      console.log(`Subject: ${m.subject}`);
      console.log(`Date: ${m.date}`);
      console.log('---');
    }
  }
} finally {
  lock.release();
  await client.logout();
}
