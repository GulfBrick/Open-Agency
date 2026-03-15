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
  for await (const msg of client.fetch('1:*', { envelope: true, bodyParts: ['text'] })) {
    const from = msg.envelope.from?.[0]?.address || '';
    if (from.toLowerCase().includes('clearline')) {
      console.log('From:', from);
      console.log('Subject:', msg.envelope.subject);
      console.log('Date:', msg.envelope.date);
      console.log('---');
      const textPart = msg.bodyParts?.get('text');
      if (textPart) {
        console.log(textPart.toString().substring(0, 2000));
      }
    }
  }
} finally {
  lock.release();
  await client.logout();
}
