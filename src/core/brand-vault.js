/**
 * Brand Vault
 *
 * Stores and manages brand guidelines per client.
 * Every creative asset is reviewed against these guidelines.
 * Persists to data/clients/[clientId]/brand.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(PROJECT_ROOT, 'data', 'clients');

class BrandVault {
  constructor() {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  /**
   * Get the file path for a client's brand guidelines.
   * @param {string} clientId
   * @returns {string}
   */
  _brandPath(clientId) {
    return join(DATA_DIR, clientId, 'brand.json');
  }

  /**
   * Set the full brand guidelines for a client.
   * @param {string} clientId
   * @param {{ name: string, colors?: { primary?: string, secondary?: string, accent?: string }, typography?: { heading?: string, body?: string }, voice?: string, tone?: string, doNots?: string[], logoUsage?: string }} brandData
   * @returns {object} The stored brand data
   */
  setBrand(clientId, brandData) {
    const dir = join(DATA_DIR, clientId);
    mkdirSync(dir, { recursive: true });

    const brand = {
      clientId,
      name: brandData.name,
      colors: brandData.colors || {},
      typography: brandData.typography || {},
      voice: brandData.voice || null,
      tone: brandData.tone || null,
      doNots: brandData.doNots || [],
      logoUsage: brandData.logoUsage || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    writeFileSync(this._brandPath(clientId), JSON.stringify(brand, null, 2));

    logger.log('brand-vault', 'BRAND_SET', { clientId, name: brand.name });

    return brand;
  }

  /**
   * Get the brand guidelines for a client.
   * @param {string} clientId
   * @returns {object|null} The brand data, or null if not set
   */
  getBrand(clientId) {
    const filePath = this._brandPath(clientId);
    if (!existsSync(filePath)) return null;

    try {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Update specific fields of a client's brand guidelines.
   * Merges updates into the existing brand data.
   * @param {string} clientId
   * @param {object} updates — partial brand data to merge
   * @returns {object|null} The updated brand data, or null if no brand exists
   */
  updateBrand(clientId, updates) {
    const existing = this.getBrand(clientId);
    if (!existing) return null;

    // Deep merge for nested objects
    if (updates.colors) {
      existing.colors = { ...existing.colors, ...updates.colors };
      delete updates.colors;
    }
    if (updates.typography) {
      existing.typography = { ...existing.typography, ...updates.typography };
      delete updates.typography;
    }

    const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    writeFileSync(this._brandPath(clientId), JSON.stringify(merged, null, 2));

    logger.log('brand-vault', 'BRAND_UPDATED', { clientId, fields: Object.keys(updates) });

    return merged;
  }

  /**
   * Get just the voice and tone guidelines for a client.
   * Useful for copywriting and social media agents.
   * @param {string} clientId
   * @returns {{ voice: string|null, tone: string|null, doNots: string[] }}
   */
  getVoiceGuidelines(clientId) {
    const brand = this.getBrand(clientId);
    if (!brand) return { voice: null, tone: null, doNots: [] };

    return {
      voice: brand.voice,
      tone: brand.tone,
      doNots: brand.doNots || [],
    };
  }
}

const brandVault = new BrandVault();

export { brandVault };
