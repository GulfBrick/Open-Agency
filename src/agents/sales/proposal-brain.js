/**
 * Proposal Bot Brain
 *
 * Extends the base AgentBrain with proposal generation logic.
 * Creates customised proposals, quotes, and pitch decks.
 * Tracks proposal lifecycle and conversion.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../../core/message-bus.js';

const AGENT_ID = 'proposal';
const AGENT_DIR = 'sales/proposal';
const WORKER_MODEL = 'claude-sonnet-4-5-20250929';

/** Proposal escalation triggers */
const ESCALATION_TRIGGERS = [
  'custom pricing', 'non-standard terms', 'special discount',
  'new capability', 'never done before',
  'capacity constraint', 'timeline concern',
  'legal review', 'contract modification',
];

/** Proposal status values */
const PROPOSAL_STATUS = {
  DRAFTING: 'DRAFTING',
  REVIEW: 'REVIEW',
  APPROVED: 'APPROVED',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  REVISED: 'REVISED',
};

class ProposalBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      model: WORKER_MODEL,
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initProposalState();
  }

  /**
   * Initialise or load proposal state from memory.
   */
  _initProposalState() {
    if (!memory.has('proposal:state')) {
      memory.set('proposal:state', {
        proposals: [],
        templates: [],
        metrics: {
          totalGenerated: 0,
          totalSent: 0,
          totalAccepted: 0,
          totalRejected: 0,
          avgTurnaroundHours: 0,
          totalValue: 0,
        },
      });
    }
  }

  /**
   * Get current proposal state.
   * @returns {object}
   */
  getProposalState() {
    return memory.get('proposal:state');
  }

  /**
   * Create a new proposal.
   * @param {string} leadId
   * @param {string} prospectName
   * @param {{ value: number, scope: string, timeline: string, deliverables?: string[], pricingModel?: string, context?: string }} details
   * @returns {object} The proposal
   */
  createProposal(leadId, prospectName, details) {
    const state = this.getProposalState();

    const proposal = {
      id: `PROP-${Date.now()}`,
      leadId,
      prospectName,
      value: details.value,
      scope: details.scope,
      timeline: details.timeline,
      deliverables: details.deliverables || [],
      pricingModel: details.pricingModel || 'project',
      context: details.context || '',
      status: PROPOSAL_STATUS.DRAFTING,
      revisions: 0,
      sections: {
        executiveSummary: '',
        understanding: '',
        solution: '',
        deliverablesTimeline: '',
        investment: '',
        nextSteps: '',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sentAt: null,
      respondedAt: null,
    };

    state.proposals.push(proposal);
    state.metrics.totalGenerated++;
    state.metrics.totalValue += details.value;
    memory.set('proposal:state', state);

    logger.log(AGENT_ID, 'PROPOSAL_CREATED', {
      proposalId: proposal.id,
      leadId,
      value: details.value,
    });

    return proposal;
  }

  /**
   * Generate proposal content using LLM.
   * @param {string} proposalId
   * @returns {Promise<object|null>} Updated proposal with generated content
   */
  async generateContent(proposalId) {
    const state = this.getProposalState();
    const proposal = state.proposals.find(p => p.id === proposalId);
    if (!proposal) return null;

    const content = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: this.getSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: `Generate a proposal for the following deal. Return a JSON object with keys: executiveSummary, understanding, solution, deliverablesTimeline, investment, nextSteps. Each value should be a well-written paragraph or section.

Prospect: ${proposal.prospectName}
Value: ${proposal.value}
Scope: ${proposal.scope}
Timeline: ${proposal.timeline}
Deliverables: ${proposal.deliverables.join(', ') || 'To be defined'}
Pricing model: ${proposal.pricingModel}
Context: ${proposal.context}`,
        },
      ],
    });

    try {
      const text = content.content[0].text;
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      proposal.sections = JSON.parse(cleaned);
    } catch {
      // Use the raw text as the executive summary
      proposal.sections.executiveSummary = content.content[0].text;
    }

    proposal.status = PROPOSAL_STATUS.REVIEW;
    proposal.updatedAt = new Date().toISOString();
    memory.set('proposal:state', state);

    // Notify Sales Lead for review
    messageBus.send({
      from: AGENT_ID,
      to: 'sales-lead',
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.HIGH,
      payload: {
        event: 'PROPOSAL_READY_FOR_REVIEW',
        proposalId: proposal.id,
        leadId: proposal.leadId,
        prospectName: proposal.prospectName,
        value: proposal.value,
      },
    });

    logger.log(AGENT_ID, 'PROPOSAL_CONTENT_GENERATED', {
      proposalId,
      leadId: proposal.leadId,
    });

    return proposal;
  }

  /**
   * Update proposal status.
   * @param {string} proposalId
   * @param {string} status — PROPOSAL_STATUS value
   * @param {string} [notes]
   * @returns {object|null} Updated proposal
   */
  updateStatus(proposalId, status, notes) {
    const state = this.getProposalState();
    const proposal = state.proposals.find(p => p.id === proposalId);
    if (!proposal) return null;

    proposal.status = status;
    proposal.updatedAt = new Date().toISOString();

    if (status === PROPOSAL_STATUS.SENT) {
      proposal.sentAt = new Date().toISOString();
      state.metrics.totalSent++;
    }

    if (status === PROPOSAL_STATUS.ACCEPTED) {
      proposal.respondedAt = new Date().toISOString();
      state.metrics.totalAccepted++;

      // Notify Sales Lead — deal should progress to close
      messageBus.send({
        from: AGENT_ID,
        to: 'sales-lead',
        type: MESSAGE_TYPES.REPORT,
        priority: PRIORITY.HIGH,
        payload: {
          event: 'PROPOSAL_ACCEPTED',
          proposalId: proposal.id,
          leadId: proposal.leadId,
          prospectName: proposal.prospectName,
          value: proposal.value,
        },
      });
    }

    if (status === PROPOSAL_STATUS.REJECTED) {
      proposal.respondedAt = new Date().toISOString();
      state.metrics.totalRejected++;

      messageBus.send({
        from: AGENT_ID,
        to: 'sales-lead',
        type: MESSAGE_TYPES.REPORT,
        priority: PRIORITY.MEDIUM,
        payload: {
          event: 'PROPOSAL_REJECTED',
          proposalId: proposal.id,
          leadId: proposal.leadId,
          prospectName: proposal.prospectName,
          value: proposal.value,
          reason: notes || 'unknown',
        },
      });
    }

    if (status === PROPOSAL_STATUS.REVISED) {
      proposal.revisions++;
    }

    // Update average turnaround
    const sentProposals = state.proposals.filter(p => p.sentAt);
    if (sentProposals.length > 0) {
      const totalHours = sentProposals.reduce((sum, p) => {
        const created = new Date(p.createdAt);
        const sent = new Date(p.sentAt);
        return sum + (sent - created) / (1000 * 60 * 60);
      }, 0);
      state.metrics.avgTurnaroundHours = Math.round(totalHours / sentProposals.length);
    }

    memory.set('proposal:state', state);

    logger.log(AGENT_ID, 'PROPOSAL_STATUS_UPDATED', {
      proposalId,
      status,
    });

    return proposal;
  }

  /**
   * Get proposal performance metrics.
   * @returns {object}
   */
  getMetrics() {
    const state = this.getProposalState();
    return {
      ...state.metrics,
      activeProposals: state.proposals.filter(p =>
        p.status !== PROPOSAL_STATUS.ACCEPTED &&
        p.status !== PROPOSAL_STATUS.REJECTED
      ).length,
      acceptanceRate: state.metrics.totalSent > 0
        ? Math.round((state.metrics.totalAccepted / state.metrics.totalSent) * 100)
        : 0,
    };
  }

  /**
   * Process a message with proposal context.
   * @param {object} message
   * @returns {Promise<object>}
   */
  async processMessage(message) {
    const metrics = this.getMetrics();
    const additionalContext = [
      `Active proposals: ${metrics.activeProposals}`,
      `Total generated: ${metrics.totalGenerated}`,
      `Acceptance rate: ${metrics.acceptanceRate}%`,
      `Avg turnaround: ${metrics.avgTurnaroundHours}h`,
    ].join('\n');

    return super.processMessage(message, additionalContext);
  }
}

const proposalBrain = new ProposalBrain();

export { proposalBrain, PROPOSAL_STATUS };
