/**
 * Prisma Client Singleton
 *
 * Import { db } from './db.js' anywhere you need database access.
 * Gracefully handles missing DATABASE_URL (runs in no-DB mode for local dev).
 */

import { logger } from './logger.js';

let prisma = null;
let dbAvailable = false;

async function initDb() {
  if (!process.env.DATABASE_URL) {
    logger.log('db', 'SKIP', { reason: 'DATABASE_URL not set — running without database' });
    return;
  }

  try {
    // Dynamic import so the server boots fine even if prisma generate hasn't run yet
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient({
      log: ['error', 'warn'],
    });
    await prisma.$connect();
    dbAvailable = true;
    logger.log('db', 'CONNECTED', { url: process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@') });
  } catch (err) {
    logger.log('db', 'CONNECT_FAILED', { error: err.message });
    console.warn('  Database ............ OFFLINE  (will retry on next deploy)');
    prisma = null;
    dbAvailable = false;
  }
}

/**
 * Get the Prisma client. Returns null if DB is not available.
 */
function getDb() {
  return prisma;
}

/**
 * Is the database available?
 */
function isDbAvailable() {
  return dbAvailable;
}

export { initDb, getDb, isDbAvailable };

// Convenience default export
export default { init: initDb, get: getDb, available: isDbAvailable };
