import { ImapFlow } from 'imapflow';

const client = new ImapFlow({
  host: 'imap.gmail.com', port: 993, secure: true,
  auth: { user: 'openagency.n@gmail.com', pass: 'zcdo dunn lhuu mtrb' },
  logger: false
});

await client.connect();
const lock = await client.getMailboxLock('INBOX');
try {
  for await (const msg of client.fetch('1:20', { envelope: true, bodyParts: ['text'], source: true })) {
    const from = msg.envelope.from?.[0]?.address || '';
    if (from.toLowerCase().includes('daniel') || from.toLowerCase().includes('clearline')) {
      console.log('FROM:', from);
      console.log('SUBJECT:', msg.envelope.subject);
      console.log('DATE:', msg.envelope.date);
      console.log('--- BODY ---');
      const raw = msg.source.toString();
      // Extract text after headers
      const bodyStart = raw.indexOf('\r\n\r\n');
      if (bodyStart !== -1) {
        console.log(raw.substring(bodyStart, bodyStart + 3000));
      } else {
        console.log(raw.substring(0, 3000));
      }
      break;
    }
  }
} finally {
  lock.release();
  await client.logout();
}
