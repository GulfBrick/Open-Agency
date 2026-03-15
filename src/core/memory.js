/**
 * Sharded Memory Store
 *
 * Splits state into domain-specific JSON files to prevent corruption
 * and reduce write contention. Each key prefix (before the first ':')
 * maps to its own file: data/state/cfo.json, data/state/cto.json, etc.
 *
 * Keys without a prefix go to data/state/_global.json.
 *
 * Debounces writes — batches rapid-fire .set() calls into a single
 * disk write per shard every 500ms.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const STATE_DIR = join(DATA_DIR, 'state');
const LEGACY_FILE = join(DATA_DIR, 'state.json');

const DEBOUNCE_MS = 500;

class Memory {
  constructor() {
    mkdirSync(STATE_DIR, { recursive: true });
    /** @type {Map<string, object>} shard name → key/value pairs */
    this._shards = new Map();
    /** @type {Map<string, NodeJS.Timeout>} shard name → pending write timer */
    this._dirty = new Map();
    this._loadAll();
  }

  /**
   * Get a value from memory.
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    const shard = this._shardFor(key);
    const data = this._shards.get(shard);
    return data ? data[key] : undefined;
  }

  /**
   * Set a value in memory and persist (debounced).
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    const shard = this._shardFor(key);
    if (!this._shards.has(shard)) {
      this._shards.set(shard, {});
    }
    this._shards.get(shard)[key] = value;
    this._scheduleSave(shard);
  }

  /**
   * Delete a key from memory.
   * @param {string} key
   */
  delete(key) {
    const shard = this._shardFor(key);
    const data = this._shards.get(shard);
    if (data) {
      delete data[key];
      this._scheduleSave(shard);
    }
  }

  /**
   * Get the entire state object (merged across all shards).
   * @returns {object}
   */
  getAll() {
    const merged = {};
    for (const data of this._shards.values()) {
      Object.assign(merged, data);
    }
    return merged;
  }

  /**
   * Check if a key exists.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    const shard = this._shardFor(key);
    const data = this._shards.get(shard);
    return data ? key in data : false;
  }

  /**
   * Clear all state and persist.
   */
  clear() {
    for (const [shard] of this._shards) {
      this._shards.set(shard, {});
      this._saveShard(shard);
    }
  }

  /**
   * Flush all pending writes immediately (call before process exit).
   */
  flush() {
    for (const [shard, timer] of this._dirty) {
      clearTimeout(timer);
      this._saveShard(shard);
    }
    this._dirty.clear();
  }

  // ─── Internal ──────────────────────────────────────────

  /**
   * Determine which shard a key belongs to.
   * Keys like "cfo:financials" → shard "cfo"
   * Keys like "bootCount" → shard "_global"
   * Keys like "task-result:xxx" → shard "task-result"
   * Keys like "client:xxx:yyy" → shard "client"
   */
  _shardFor(key) {
    const colonIdx = key.indexOf(':');
    if (colonIdx === -1) return '_global';
    return key.substring(0, colonIdx);
  }

  /**
   * Load all shard files + migrate legacy state.json if it exists.
   */
  _loadAll() {
    // First, migrate legacy state.json if it exists
    if (existsSync(LEGACY_FILE)) {
      try {
        const legacy = JSON.parse(readFileSync(LEGACY_FILE, 'utf-8'));
        // Split legacy data into shards
        for (const [key, value] of Object.entries(legacy)) {
          const shard = this._shardFor(key);
          if (!this._shards.has(shard)) {
            this._shards.set(shard, {});
          }
          this._shards.get(shard)[key] = value;
        }
        // Save all shards from legacy data
        for (const shard of this._shards.keys()) {
          this._saveShard(shard);
        }
        // Rename legacy file so we don't re-migrate
        const backupPath = LEGACY_FILE + '.migrated';
        if (!existsSync(backupPath)) {
          writeFileSync(backupPath, readFileSync(LEGACY_FILE));
        }
        console.log(`[memory] Migrated legacy state.json into ${this._shards.size} shards`);
      } catch (err) {
        console.error('[memory] Failed to migrate legacy state:', err.message);
      }
    }

    // Load all shard files
    if (existsSync(STATE_DIR)) {
      const files = readdirSync(STATE_DIR).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const shard = file.replace('.json', '');
        try {
          const content = readFileSync(join(STATE_DIR, file), 'utf-8');
          const data = JSON.parse(content);
          // Merge with any data already loaded from legacy migration
          const existing = this._shards.get(shard) || {};
          this._shards.set(shard, { ...existing, ...data });
        } catch (err) {
          console.error(`[memory] Failed to load shard ${shard}:`, err.message);
        }
      }
    }
  }

  /**
   * Schedule a debounced write for a shard.
   */
  _scheduleSave(shard) {
    if (this._dirty.has(shard)) {
      clearTimeout(this._dirty.get(shard));
    }
    const timer = setTimeout(() => {
      this._saveShard(shard);
      this._dirty.delete(shard);
    }, DEBOUNCE_MS);
    this._dirty.set(shard, timer);
  }

  /**
   * Write a single shard to disk.
   */
  _saveShard(shard) {
    const data = this._shards.get(shard);
    if (!data) return;
    try {
      writeFileSync(join(STATE_DIR, `${shard}.json`), JSON.stringify(data, null, 2));
    } catch (err) {
      console.error(`[memory] Failed to save shard ${shard}:`, err.message);
    }
  }
}

const memory = new Memory();

// Flush on exit
process.on('beforeExit', () => memory.flush());
process.on('SIGINT', () => { memory.flush(); process.exit(0); });
process.on('SIGTERM', () => { memory.flush(); process.exit(0); });

export { memory };
