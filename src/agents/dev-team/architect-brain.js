/**
 * Architect Bot Brain — "The Blueprint"
 *
 * Extends AgentBrain with system design capabilities.
 * Produces technical specs, API contracts, database schemas, and ADRs.
 * Works from requirements and outputs design documents for the dev team.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../../core/message-bus.js';

const AGENT_ID = 'architect';
const AGENT_DIR = 'dev-team/architect';
const MODEL = 'claude-sonnet-4-5-20250929';

const ESCALATION_TRIGGERS = [
  'architecture change', 'breaking change', 'migration',
  'infrastructure', 'scalability concern',
  'security design', 'data model change',
];

class ArchitectBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      model: MODEL,
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initDesignState();
  }

  _initDesignState() {
    if (!memory.has('architect:state')) {
      memory.set('architect:state', {
        designDocs: [],
        apiContracts: [],
        schemas: [],
        adrs: [],
      });
    }
  }

  getDesignState() {
    return memory.get('architect:state');
  }

  /**
   * Create a design document for a feature.
   * @param {string} title
   * @param {string} context — why this is needed
   * @param {string} design — the proposed solution
   * @param {string[]} [tradeOffs] — alternatives considered
   * @param {string} [clientId]
   * @returns {object}
   */
  createDesignDoc(title, context, design, tradeOffs = [], clientId = null) {
    const state = this.getDesignState();
    const doc = {
      id: `DESIGN-${Date.now()}`,
      title,
      context,
      design,
      tradeOffs,
      clientId,
      status: 'draft',
      createdAt: new Date().toISOString(),
      approvedBy: null,
    };

    state.designDocs.push(doc);
    memory.set('architect:state', state);

    logger.log(AGENT_ID, 'DESIGN_DOC_CREATED', { docId: doc.id, title });

    // Notify Dev Team Lead
    messageBus.send({
      from: AGENT_ID,
      to: 'dev-lead',
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.MEDIUM,
      payload: { event: 'DESIGN_DOC_READY', doc },
    });

    return doc;
  }

  /**
   * Define an API contract.
   * @param {string} endpoint — e.g. 'POST /api/users'
   * @param {object} spec — { requestSchema, responseSchema, auth, errors }
   * @param {string} [clientId]
   * @returns {object}
   */
  defineApiContract(endpoint, spec, clientId = null) {
    const state = this.getDesignState();
    const contract = {
      id: `API-${Date.now()}`,
      endpoint,
      ...spec,
      clientId,
      version: 1,
      createdAt: new Date().toISOString(),
    };

    state.apiContracts.push(contract);
    memory.set('architect:state', state);

    logger.log(AGENT_ID, 'API_CONTRACT_DEFINED', { contractId: contract.id, endpoint });

    return contract;
  }

  /**
   * Define a database schema.
   * @param {string} entityName
   * @param {object} schema — { fields, indexes, relationships }
   * @param {string} [clientId]
   * @returns {object}
   */
  defineSchema(entityName, schema, clientId = null) {
    const state = this.getDesignState();
    const entry = {
      id: `SCHEMA-${Date.now()}`,
      entityName,
      ...schema,
      clientId,
      version: 1,
      createdAt: new Date().toISOString(),
    };

    state.schemas.push(entry);
    memory.set('architect:state', state);

    logger.log(AGENT_ID, 'SCHEMA_DEFINED', { schemaId: entry.id, entityName });

    return entry;
  }

  async processMessage(message) {
    const state = this.getDesignState();
    const additionalContext = [
      `Design docs: ${state.designDocs.length}`,
      `API contracts: ${state.apiContracts.length}`,
      `Schemas: ${state.schemas.length}`,
      `ADRs: ${state.adrs.length}`,
    ].join('\n');

    return super.processMessage(message, additionalContext);
  }
}

const architectBrain = new ArchitectBrain();

export { architectBrain };
