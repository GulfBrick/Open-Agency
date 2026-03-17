/**
 * Git Integration Module
 *
 * POST /api/integrations/save — validate PAT, encrypt with AES-256-GCM, store in DB
 * GET  /api/integrations/:clientId — get integration status (tokens masked)
 */

import crypto from 'crypto';
import { z } from 'zod';
import { getDb, isDbAvailable } from './db.js';
import { logger } from './logger.js';

// ─── AES-256-GCM Encryption ─────────────────────────────────

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY not set');
  // Accept 32-char string or 64-char hex
  if (key.length === 64) return Buffer.from(key, 'hex');
  if (key.length === 32) return Buffer.from(key, 'utf8');
  throw new Error('ENCRYPTION_KEY must be 32 chars (utf8) or 64 chars (hex)');
}

function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(stored) {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, ciphertextHex] = stored.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) throw new Error('Invalid encrypted token format');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

// ─── Token Validation ────────────────────────────────────────

async function validateToken(platform, token, repoUrl) {
  const validators = {
    github: async () => {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${token}`,
          'User-Agent': 'OpenAgency/1.0',
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
      const user = await res.json();
      return { valid: true, username: user.login };
    },
    gitlab: async () => {
      const res = await fetch('https://gitlab.com/api/v4/user', {
        headers: { 'PRIVATE-TOKEN': token },
      });
      if (!res.ok) throw new Error(`GitLab returned ${res.status}`);
      const user = await res.json();
      return { valid: true, username: user.username };
    },
    bitbucket: async () => {
      // Bitbucket App Passwords use HTTP Basic auth: username:app_password
      // token may be "user:app_password" combined, or just app_password (legacy)
      const basicCreds = token.includes(':') ? token : `${repoUrl || ''}:${token}`;
      const encoded = Buffer.from(basicCreds).toString('base64');
      const res = await fetch('https://api.bitbucket.org/2.0/user', {
        headers: { Authorization: `Basic ${encoded}` },
      });
      if (!res.ok) throw new Error(`Bitbucket returned ${res.status} — check username and App Password`);
      const user = await res.json();
      return { valid: true, username: user.nickname };
    },
  };

  const validator = validators[platform];
  if (!validator) throw new Error(`Unsupported platform: ${platform}`);
  return validator();
}

// ─── Schema ──────────────────────────────────────────────────

const SaveIntegrationSchema = z.object({
  clientId: z.string().uuid(),
  platform: z.enum(['github', 'gitlab', 'bitbucket']),
  token: z.string().min(1).max(500),
  repoUrl: z.string().url().optional(),
});

// ─── Mount Routes ─────────────────────────────────────────────

function mountGitIntegrationRoutes(app) {

  // Save / update a git token
  app.post('/api/integrations/save', async (req, res) => {
    const parsed = SaveIntegrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues });
    }

    const { clientId, platform, token, repoUrl } = parsed.data;

    // Validate token against platform API
    let validationResult;
    try {
      validationResult = await validateToken(platform, token, repoUrl);
    } catch (err) {
      logger.log('git-integration', 'TOKEN_INVALID', { clientId, platform, error: err.message });
      return res.status(400).json({ error: `Token validation failed: ${err.message}` });
    }

    // Encrypt the token
    let encryptedToken;
    try {
      encryptedToken = encrypt(token);
    } catch (err) {
      logger.log('git-integration', 'ENCRYPT_FAILED', { error: err.message });
      return res.status(500).json({ error: 'Encryption unavailable — set ENCRYPTION_KEY' });
    }

    // Store in DB if available
    const db = getDb();
    if (db && isDbAvailable()) {
      const tokenField = `${platform}Token`;
      const repoField = `${platform}Repo`;

      try {
        await db.integration.upsert({
          where: { clientId },
          update: {
            [tokenField]: encryptedToken,
            ...(repoUrl ? { [repoField]: repoUrl } : {}),
          },
          create: {
            clientId,
            [tokenField]: encryptedToken,
            ...(repoUrl ? { [repoField]: repoUrl } : {}),
          },
        });

        // Audit log
        await db.auditLog.create({
          data: {
            clientId,
            agentId: 'system',
            action: 'token_saved',
            detail: { platform, repoUrl: repoUrl || null, username: validationResult.username },
            ip: req.ip,
          },
        });

        logger.log('git-integration', 'TOKEN_SAVED', { clientId, platform, username: validationResult.username });
      } catch (err) {
        logger.log('git-integration', 'DB_ERROR', { error: err.message });
        return res.status(500).json({ error: 'Database error' });
      }
    } else {
      logger.log('git-integration', 'DB_UNAVAILABLE', { note: 'Token validated but not persisted' });
    }

    return res.json({
      ok: true,
      platform,
      username: validationResult.username,
      message: `${platform} connected as ${validationResult.username}`,
    });
  });

  // Get integration status for a client (tokens masked)
  app.get('/api/integrations/:clientId', async (req, res) => {
    const { clientId } = req.params;

    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    const db = getDb();
    if (!db || !isDbAvailable()) {
      return res.json({ github: false, gitlab: false, bitbucket: false, dbOffline: true });
    }

    try {
      const integration = await db.integration.findUnique({ where: { clientId } });
      if (!integration) {
        return res.json({ github: false, gitlab: false, bitbucket: false });
      }

      return res.json({
        github: !!integration.githubToken,
        gitlab: !!integration.gitlabToken,
        bitbucket: !!integration.bitbucketToken,
        githubRepo: integration.githubRepo || null,
        gitlabRepo: integration.gitlabRepo || null,
        bitbucketRepo: integration.bitbucketRepo || null,
      });
    } catch (err) {
      logger.log('git-integration', 'FETCH_ERROR', { error: err.message });
      return res.status(500).json({ error: 'Database error' });
    }
  });
}

/**
 * Retrieve and decrypt a stored token for agent use.
 * Returns null if not set or DB unavailable.
 */
async function getDecryptedToken(clientId, platform) {
  const db = getDb();
  if (!db || !isDbAvailable()) return null;

  const integration = await db.integration.findUnique({ where: { clientId } });
  if (!integration) return null;

  const tokenField = `${platform}Token`;
  const encrypted = integration[tokenField];
  if (!encrypted) return null;

  try {
    return decrypt(encrypted);
  } catch (err) {
    logger.log('git-integration', 'DECRYPT_FAILED', { clientId, platform, error: err.message });
    return null;
  }
}

export { mountGitIntegrationRoutes, getDecryptedToken, encrypt, decrypt };
