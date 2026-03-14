import { writeFileSync, appendFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const LOG_DIR = join(PROJECT_ROOT, 'logs');
const LOG_FILE = join(LOG_DIR, 'agent-actions.jsonl');

class Logger {
  constructor() {
    mkdirSync(LOG_DIR, { recursive: true });
    this.recentLogs = [];
  }

  /**
   * Log an agent action.
   * @param {string} agentId - The agent performing the action
   * @param {string} action - What they did (e.g. TASK_CREATED, MESSAGE_SENT)
   * @param {object} [details] - Additional context
   */
  log(agentId, action, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      agentId,
      action,
      details,
    };

    // Console output
    const prefix = `[${entry.timestamp}] [${agentId}]`;
    console.log(`${prefix} ${action}`, Object.keys(details).length > 0 ? details : '');

    // Append to JSONL file
    try {
      appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
    } catch (err) {
      console.error('Failed to write log:', err.message);
    }

    // Keep recent logs in memory
    this.recentLogs.push(entry);
    if (this.recentLogs.length > 1000) {
      this.recentLogs = this.recentLogs.slice(-500);
    }
  }

  /**
   * Get recent log entries.
   * @param {number} [limit=50]
   * @returns {object[]}
   */
  getRecentLogs(limit = 50) {
    return this.recentLogs.slice(-limit);
  }

  /**
   * Get logs for a specific agent.
   * @param {string} agentId
   * @param {number} [limit=50]
   * @returns {object[]}
   */
  getAgentLogs(agentId, limit = 50) {
    return this.recentLogs
      .filter(l => l.agentId === agentId)
      .slice(-limit);
  }

  /**
   * Read logs from file (for cold starts — loads the last N entries).
   * @param {number} [limit=100]
   * @returns {object[]}
   */
  readFromFile(limit = 100) {
    if (!existsSync(LOG_FILE)) return [];
    try {
      const content = readFileSync(LOG_FILE, 'utf-8').trim();
      if (!content) return [];
      const lines = content.split('\n').slice(-limit);
      return lines.map(line => JSON.parse(line));
    } catch (err) {
      console.error('Failed to read log file:', err.message);
      return [];
    }
  }
}

const logger = new Logger();

export { logger };
