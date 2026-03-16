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
    if (from.includes('hetzner') && msg.envelope.subject?.includes('created')) {
      console.log('Subject:', msg.envelope.subject);
      const textPart = msg.bodyParts?.get('text');
      if (textPart) {
        const decoded = Buffer.from(textPart.toString(), 'base64').toString('utf-8');
        console.log(decoded.substring(0, 1000));
      }
    }
  }
} finally {
  lock.release();
  await client.logout();
}
