/**
 * Content Calendar Manager
 *
 * Manages the social media and content publishing schedule per client.
 * Tracks posts through their lifecycle: DRAFT → SCHEDULED → PUBLISHED → ARCHIVED.
 * Persists to data/clients/[clientId]/content-calendar.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(PROJECT_ROOT, 'data', 'clients');

/** Post status values */
const POST_STATUS = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
};

class ContentCalendar {
  constructor() {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  /**
   * Get the file path for a client's content calendar.
   * @param {string} clientId
   * @returns {string}
   */
  _calendarPath(clientId) {
    return join(DATA_DIR, clientId, 'content-calendar.json');
  }

  /**
   * Load the content calendar for a client.
   * @param {string} clientId
   * @returns {object[]} Array of post objects
   */
  _loadCalendar(clientId) {
    const filePath = this._calendarPath(clientId);
    if (!existsSync(filePath)) return [];

    try {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      return [];
    }
  }

  /**
   * Save the content calendar for a client.
   * @param {string} clientId
   * @param {object[]} posts
   */
  _saveCalendar(clientId, posts) {
    const dir = join(DATA_DIR, clientId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(this._calendarPath(clientId), JSON.stringify(posts, null, 2));
  }

  /**
   * Add a post to the content calendar.
   * @param {string} clientId
   * @param {{ platform: string, postType: string, scheduledDate: string, content: string, assets?: string[], createdBy: string }} postData
   * @returns {object} The created post
   */
  addPost(clientId, postData) {
    const posts = this._loadCalendar(clientId);

    const post = {
      id: `POST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      clientId,
      platform: postData.platform,
      postType: postData.postType,
      status: POST_STATUS.DRAFT,
      scheduledDate: postData.scheduledDate || null,
      content: postData.content,
      assets: postData.assets || [],
      createdBy: postData.createdBy,
      approvedBy: null,
      metrics: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    posts.push(post);
    this._saveCalendar(clientId, posts);

    logger.log('content-calendar', 'POST_ADDED', {
      clientId,
      postId: post.id,
      platform: post.platform,
      status: post.status,
    });

    return post;
  }

  /**
   * Update a post in the content calendar.
   * @param {string} clientId
   * @param {string} postId
   * @param {object} updates — partial post data to merge
   * @returns {object|null} The updated post, or null if not found
   */
  updatePost(clientId, postId, updates) {
    const posts = this._loadCalendar(clientId);
    const post = posts.find(p => p.id === postId);
    if (!post) return null;

    Object.assign(post, updates, { updatedAt: new Date().toISOString() });
    this._saveCalendar(clientId, posts);

    logger.log('content-calendar', 'POST_UPDATED', {
      clientId,
      postId,
      fields: Object.keys(updates),
    });

    return post;
  }

  /**
   * Get all posts scheduled within a date range.
   * @param {string} clientId
   * @param {string} startDate — ISO date string
   * @param {string} endDate — ISO date string
   * @returns {object[]}
   */
  getSchedule(clientId, startDate, endDate) {
    const posts = this._loadCalendar(clientId);
    const start = new Date(startDate);
    const end = new Date(endDate);

    return posts.filter(p => {
      if (!p.scheduledDate) return false;
      const d = new Date(p.scheduledDate);
      return d >= start && d <= end;
    });
  }

  /**
   * Get all posts for a specific platform.
   * @param {string} clientId
   * @param {string} platform
   * @returns {object[]}
   */
  getByPlatform(clientId, platform) {
    const posts = this._loadCalendar(clientId);
    return posts.filter(p => p.platform === platform);
  }

  /**
   * Get all posts pending approval (DRAFT status).
   * @param {string} clientId
   * @returns {object[]}
   */
  getPendingApproval(clientId) {
    const posts = this._loadCalendar(clientId);
    return posts.filter(p => p.status === POST_STATUS.DRAFT);
  }

  /**
   * Mark a post as published and record performance metrics.
   * @param {string} clientId
   * @param {string} postId
   * @param {{ impressions?: number, clicks?: number, engagement?: number, shares?: number, saves?: number }} [metrics]
   * @returns {object|null}
   */
  markPublished(clientId, postId, metrics = {}) {
    const posts = this._loadCalendar(clientId);
    const post = posts.find(p => p.id === postId);
    if (!post) return null;

    post.status = POST_STATUS.PUBLISHED;
    post.publishedAt = new Date().toISOString();
    post.metrics = {
      impressions: metrics.impressions || 0,
      clicks: metrics.clicks || 0,
      engagement: metrics.engagement || 0,
      shares: metrics.shares || 0,
      saves: metrics.saves || 0,
    };
    post.updatedAt = new Date().toISOString();

    this._saveCalendar(clientId, posts);

    logger.log('content-calendar', 'POST_PUBLISHED', {
      clientId,
      postId,
      platform: post.platform,
    });

    return post;
  }
}

const contentCalendar = new ContentCalendar();

export { contentCalendar, POST_STATUS };
