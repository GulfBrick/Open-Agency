/**
 * Task Scheduler
 *
 * Autonomously triggers agent tasks on a schedule.
 * Uses Node's setInterval — no external dependencies.
 * Schedule config stored in data/schedules.json.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { agentRegistry } from './agent-registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const SCHEDULES_FILE = join(PROJECT_ROOT, 'data', 'schedules.json');

/** Check interval — every 60 seconds */
const CHECK_INTERVAL_MS = 60 * 1000;

class Scheduler {
  constructor() {
    this._schedules = new Map();
    this._intervalId = null;
    this._lastChecked = new Map();
    this._loadSchedules();
  }

  /**
   * Load schedules from data/schedules.json.
   */
  _loadSchedules() {
    if (!existsSync(SCHEDULES_FILE)) {
      logger.log('scheduler', 'NO_SCHEDULES_FILE', { path: SCHEDULES_FILE });
      return;
    }

    try {
      const raw = readFileSync(SCHEDULES_FILE, 'utf-8');
      const schedules = JSON.parse(raw);

      for (const [name, config] of Object.entries(schedules)) {
        this._schedules.set(name, {
          ...config,
          _key: name,
        });
      }

      logger.log('scheduler', 'SCHEDULES_LOADED', { count: this._schedules.size });
    } catch (err) {
      logger.log('scheduler', 'SCHEDULES_LOAD_ERROR', { error: err.message });
    }
  }

  /**
   * Save current schedules back to data/schedules.json.
   */
  _saveSchedules() {
    const obj = {};
    for (const [name, config] of this._schedules) {
      const { _key, ...rest } = config;
      obj[name] = rest;
    }

    try {
      writeFileSync(SCHEDULES_FILE, JSON.stringify(obj, null, 2));
    } catch (err) {
      logger.log('scheduler', 'SCHEDULES_SAVE_ERROR', { error: err.message });
    }
  }

  /**
   * Check if a schedule should fire right now.
   * @param {object} config — schedule config
   * @returns {boolean}
   */
  _shouldFire(config) {
    if (!config.enabled) return false;

    const now = new Date();
    const { schedule } = config;
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday

    // Check time match (within the check interval window)
    const timeMatch = currentHour === schedule.hour && currentMinute === schedule.minute;
    if (!timeMatch) return false;

    // Check day match
    if (schedule.type === 'weekly' && schedule.dayOfWeek !== null) {
      if (currentDay !== schedule.dayOfWeek) return false;
    }

    // Prevent double-firing within the same minute
    const key = config._key;
    const lastFired = this._lastChecked.get(key);
    if (lastFired) {
      const elapsed = now.getTime() - lastFired.getTime();
      if (elapsed < CHECK_INTERVAL_MS * 2) return false;
    }

    return true;
  }

  /**
   * Execute a scheduled task.
   * @param {string} name — schedule name
   * @param {object} config — schedule config
   */
  async _executeSchedule(name, config) {
    const { agentId, method, args } = config;

    logger.log('scheduler', 'SCHEDULE_TRIGGERED', {
      name,
      agentId,
      method,
    });

    try {
      const result = await agentRegistry.dispatch(agentId, method, args || []);

      logger.log('scheduler', 'SCHEDULE_COMPLETED', {
        name,
        agentId,
        method,
        success: true,
      });

      return result;
    } catch (err) {
      logger.log('scheduler', 'SCHEDULE_FAILED', {
        name,
        agentId,
        method,
        error: err.message,
      });

      return null;
    }
  }

  /**
   * The main check loop — runs every CHECK_INTERVAL_MS.
   */
  async _tick() {
    for (const [name, config] of this._schedules) {
      if (this._shouldFire(config)) {
        this._lastChecked.set(name, new Date());
        // Fire and forget — don't block the tick loop
        this._executeSchedule(name, config).catch(err => {
          logger.log('scheduler', 'SCHEDULE_ERROR', { name, error: err.message });
        });
      }
    }
  }

  // ─── Public API ──────────────────────────────────────────────

  /**
   * Start all scheduled tasks.
   */
  start() {
    if (this._intervalId) {
      logger.log('scheduler', 'ALREADY_RUNNING');
      return;
    }

    this._intervalId = setInterval(() => this._tick(), CHECK_INTERVAL_MS);
    logger.log('scheduler', 'STARTED', {
      scheduleCount: this._schedules.size,
      checkIntervalMs: CHECK_INTERVAL_MS,
    });
  }

  /**
   * Stop all scheduled tasks.
   */
  stop() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
      logger.log('scheduler', 'STOPPED');
    }
  }

  /**
   * Add a new schedule.
   * @param {string} name — unique schedule name
   * @param {{ type: string, hour: number, minute: number, dayOfWeek?: number }} cronLike — schedule timing
   * @param {string} agentId — agent to dispatch to
   * @param {string} method — method to call on the agent
   * @param {any[]} [args] — arguments to pass
   * @returns {object} The created schedule
   */
  addSchedule(name, cronLike, agentId, method, args = []) {
    const config = {
      name,
      description: `Custom schedule: ${agentId}.${method}`,
      agentId,
      method,
      args,
      schedule: cronLike,
      enabled: true,
      _key: name,
    };

    this._schedules.set(name, config);
    this._saveSchedules();

    logger.log('scheduler', 'SCHEDULE_ADDED', { name, agentId, method });

    return config;
  }

  /**
   * Remove a schedule.
   * @param {string} name
   * @returns {boolean} Whether it was removed
   */
  removeSchedule(name) {
    const existed = this._schedules.delete(name);
    if (existed) {
      this._saveSchedules();
      logger.log('scheduler', 'SCHEDULE_REMOVED', { name });
    }
    return existed;
  }

  /**
   * List all active schedules.
   * @returns {{ name: string, agentId: string, method: string, schedule: object, enabled: boolean }[]}
   */
  listSchedules() {
    const list = [];
    for (const [name, config] of this._schedules) {
      list.push({
        name: config.name,
        key: name,
        agentId: config.agentId,
        method: config.method,
        schedule: config.schedule,
        enabled: config.enabled,
      });
    }
    return list;
  }

  /**
   * Trigger a schedule immediately, bypassing time checks.
   * @param {string} scheduleName — the key name of the schedule
   * @returns {Promise<any>}
   */
  async runNow(scheduleName) {
    const config = this._schedules.get(scheduleName);
    if (!config) {
      throw new Error(`Schedule '${scheduleName}' not found`);
    }

    logger.log('scheduler', 'MANUAL_TRIGGER', { name: scheduleName });
    return this._executeSchedule(scheduleName, config);
  }

  /**
   * Enable or disable a schedule.
   * @param {string} name
   * @param {boolean} enabled
   */
  setEnabled(name, enabled) {
    const config = this._schedules.get(name);
    if (!config) return;

    config.enabled = enabled;
    this._saveSchedules();

    logger.log('scheduler', 'SCHEDULE_TOGGLED', { name, enabled });
  }
}

const scheduler = new Scheduler();

export { scheduler };
