import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const STATE_FILE = join(DATA_DIR, 'state.json');

class Memory {
  constructor() {
    mkdirSync(DATA_DIR, { recursive: true });
    this.state = this._load();
  }

  /**
   * Get a value from memory.
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    return this.state[key];
  }

  /**
   * Set a value in memory and persist to disk.
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    this.state[key] = value;
    this._save();
  }

  /**
   * Delete a key from memory.
   * @param {string} key
   */
  delete(key) {
    delete this.state[key];
    this._save();
  }

  /**
   * Get the entire state object.
   * @returns {object}
   */
  getAll() {
    return { ...this.state };
  }

  /**
   * Check if a key exists.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return key in this.state;
  }

  /**
   * Clear all state and persist.
   */
  clear() {
    this.state = {};
    this._save();
  }

  /**
   * Load state from disk.
   * @private
   */
  _load() {
    if (!existsSync(STATE_FILE)) return {};
    try {
      const content = readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      console.error('Failed to load state:', err.message);
      return {};
    }
  }

  /**
   * Save state to disk.
   * @private
   */
  _save() {
    try {
      writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error('Failed to save state:', err.message);
    }
  }
}

const memory = new Memory();

export { memory };
