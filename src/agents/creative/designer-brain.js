/**
 * Iris — Graphic Designer Brain — "The Visionary"
 *
 * Extends AgentBrain with graphic design capabilities.
 * Creates visual concepts, asset specifications, colour palettes,
 * and typography guides. Reviews designs against brand guidelines.
 *
 * Client brand context injected at runtime via the Brand Vault.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../../core/message-bus.js';
import { brandVault } from '../../core/brand-vault.js';

const AGENT_ID = 'designer';
const AGENT_DIR = 'creative/designer';
const MODEL = 'claude-sonnet-4-5-20250929';

const ESCALATION_TRIGGERS = [
  'brand violation', 'off-brand', 'brand inconsistency',
  'logo misuse', 'colour deviation', 'typography violation',
  'accessibility', 'contrast ratio', 'colour blindness',
  'design system change', 'visual identity change',
];

class DesignerBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      model: MODEL,
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initDesignerState();
  }

  _initDesignerState() {
    if (!memory.has('designer:state')) {
      memory.set('designer:state', {
        concepts: [],
        assets: [],
        palettes: [],
        brandIssues: [],
      });
    }
  }

  getDesignerState() {
    return memory.get('designer:state');
  }

  /**
   * Generate a design concept from a brief.
   * @param {{ objective: string, audience: string, tone: string, deliverables: string[] }} brief
   * @param {string} format — 'social-graphic', 'ad-banner', 'presentation', 'infographic', 'logo'
   * @returns {object} The concept specification
   */
  designConcept(brief, format) {
    const state = this.getDesignerState();
    const concept = {
      id: `CONCEPT-${Date.now()}`,
      brief: brief.objective,
      format,
      audience: brief.audience,
      tone: brief.tone,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };

    state.concepts.push(concept);
    memory.set('designer:state', state);

    logger.log(AGENT_ID, 'CONCEPT_CREATED', { conceptId: concept.id, format });

    return concept;
  }

  /**
   * Create a detailed asset specification.
   * @param {string} clientId
   * @param {string} assetType — 'social-post', 'ad-banner', 'email-header', 'presentation-slide'
   * @param {{ width: number, height: number }} dimensions
   * @param {object} [brandOverrides] — optional brand-specific overrides
   * @returns {object} The asset specification
   */
  createAssetSpec(clientId, assetType, dimensions, brandOverrides) {
    const brand = brandVault.getBrand(clientId);
    const state = this.getDesignerState();

    const spec = {
      id: `ASSET-${Date.now()}`,
      clientId,
      assetType,
      dimensions,
      colors: brandOverrides?.colors || (brand ? brand.colors : {}),
      typography: brandOverrides?.typography || (brand ? brand.typography : {}),
      status: 'specified',
      createdAt: new Date().toISOString(),
    };

    state.assets.push(spec);
    memory.set('designer:state', state);

    logger.log(AGENT_ID, 'ASSET_SPEC_CREATED', {
      assetId: spec.id,
      clientId,
      assetType,
      width: dimensions.width,
      height: dimensions.height,
    });

    return spec;
  }

  /**
   * Review a design against brand guidelines.
   * @param {{ description: string, colors: string[], fonts: string[] }} design
   * @param {object} brandGuidelines — from Brand Vault
   * @returns {{ consistent: boolean, issues: string[] }}
   */
  reviewDesign(design, brandGuidelines) {
    const issues = [];

    // Check colours against brand palette
    if (brandGuidelines.colors && design.colors) {
      const approvedColors = Object.values(brandGuidelines.colors).map(c => c?.toLowerCase());
      for (const color of design.colors) {
        if (!approvedColors.includes(color.toLowerCase())) {
          issues.push(`Colour ${color} is not in the approved brand palette`);
        }
      }
    }

    // Check fonts against brand typography
    if (brandGuidelines.typography && design.fonts) {
      const approvedFonts = Object.values(brandGuidelines.typography).map(f => f?.toLowerCase());
      for (const font of design.fonts) {
        if (!approvedFonts.includes(font.toLowerCase())) {
          issues.push(`Font "${font}" is not in the approved brand typography`);
        }
      }
    }

    const consistent = issues.length === 0;

    if (!consistent) {
      const state = this.getDesignerState();
      state.brandIssues.push({
        issues,
        reportedAt: new Date().toISOString(),
      });
      memory.set('designer:state', state);

      // Alert Creative Director
      messageBus.send({
        from: AGENT_ID,
        to: 'creative-director',
        type: MESSAGE_TYPES.ALERT,
        priority: PRIORITY.MEDIUM,
        payload: { event: 'BRAND_CONSISTENCY_ISSUE', issues },
      });
    }

    logger.log(AGENT_ID, 'DESIGN_REVIEWED', { consistent, issueCount: issues.length });

    return { consistent, issues };
  }

  /**
   * Generate a colour palette recommendation.
   * @param {{ colors?: object, tone?: string }} brand — existing brand info
   * @param {string} mood — 'energetic', 'calm', 'bold', 'minimal', 'warm', 'cool'
   * @returns {object} Palette recommendation
   */
  generateColorPalette(brand, mood) {
    const state = this.getDesignerState();

    const palette = {
      id: `PALETTE-${Date.now()}`,
      basedOn: brand.colors || {},
      mood,
      createdAt: new Date().toISOString(),
    };

    state.palettes.push(palette);
    memory.set('designer:state', state);

    logger.log(AGENT_ID, 'PALETTE_GENERATED', { paletteId: palette.id, mood });

    return palette;
  }

  /**
   * Generate typography guide recommendations.
   * @param {{ typography?: object, voice?: string }} brand
   * @returns {object} Typography guide
   */
  typographyGuide(brand) {
    const guide = {
      id: `TYPO-${Date.now()}`,
      basedOn: brand.typography || {},
      brandVoice: brand.voice || null,
      createdAt: new Date().toISOString(),
    };

    logger.log(AGENT_ID, 'TYPOGRAPHY_GUIDE_CREATED', { guideId: guide.id });

    return guide;
  }

  async processMessage(message) {
    const state = this.getDesignerState();
    const additionalContext = [
      `Concepts created: ${state.concepts.length}`,
      `Assets specified: ${state.assets.length}`,
      `Open brand issues: ${state.brandIssues.length}`,
    ].join('\n');

    return super.processMessage(message, additionalContext);
  }
}

const designerBrain = new DesignerBrain();

export { designerBrain };
