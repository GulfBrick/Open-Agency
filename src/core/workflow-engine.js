/**
 * Workflow Engine
 *
 * Orchestrates multi-step agent workflows. A workflow is a series of agent
 * conversations that happen in sequence, with dependencies and approval gates.
 *
 * Persisted to data/workflows/[workflowId].json
 */

import { randomUUID } from 'crypto';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from './message-bus.js';
import { agentConversation } from './agent-conversation.js';
import { agentPersonas } from './agent-personas.js';
import { telegramNotifier } from './telegram-notifier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const WORKFLOWS_DIR = join(PROJECT_ROOT, 'data', 'workflows');

mkdirSync(WORKFLOWS_DIR, { recursive: true });

const WORKFLOW_STATUS = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  WAITING_APPROVAL: 'WAITING_APPROVAL',
  DONE: 'DONE',
  FAILED: 'FAILED',
};

const STEP_STATUS = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  WAITING_APPROVAL: 'WAITING_APPROVAL',
  DONE: 'DONE',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
};

// ─── Workflow Templates ────────────────────────────────────────

const WORKFLOW_TEMPLATES = {

  DASHBOARD_REDESIGN: {
    name: 'Dashboard Redesign',
    steps: [
      {
        stepId: 'creative-tech-review',
        name: 'Creative + Technical Review',
        type: 'conversation',
        agents: ['creative-director', 'architect'],
        dependsOn: [],
        description: 'Nova (Creative Director) and Sage (Architect) discuss the brief. Nova proposes creative direction. Sage assesses technical feasibility. They reach agreement on a joint proposal.',
        conversationConfig: {
          initiatorPrompt: (brief) => `I've been briefed on a dashboard redesign project. Here's the brief:\n\n${brief}\n\nAs Creative Director, here's my initial creative direction. I want to discuss feasibility with you before we take this to Nikita.\n\nLet me lay out what I'm thinking for the visual direction, user experience, and key design decisions.`,
          maxRounds: 3,
        },
      },
      {
        stepId: 'nikita-review',
        name: 'Nikita Reviews Joint Proposal',
        type: 'conversation',
        agents: ['nikita', 'creative-director'],
        dependsOn: ['creative-tech-review'],
        description: 'Nova presents the joint proposal to Nikita. Nikita reviews and decides whether to escalate to Harry for approval.',
        conversationConfig: {
          initiatorPrompt: (brief, prevOutput) => `Nikita, Sage and I have reviewed the dashboard redesign brief and reached agreement. Here's our joint proposal:\n\n${prevOutput}\n\nI'd like your sign-off before we proceed, or if this needs Harry's approval, let me know.`,
          initiator: 'creative-director',
          maxRounds: 2,
        },
      },
      {
        stepId: 'harry-approval',
        name: 'Harry Approval',
        type: 'approval',
        agents: [],
        dependsOn: ['nikita-review'],
        approvalRequired: true,
        description: 'Nikita presents the proposal to Harry via Telegram and waits for go/no-go.',
      },
      {
        stepId: 'dev-briefing',
        name: 'Dev Team Briefing',
        type: 'conversation',
        agents: ['nikita', 'dev-lead'],
        dependsOn: ['harry-approval'],
        description: 'Nikita briefs Kai (Dev Lead) to run the sprint. Kai assigns Luna (Frontend) to build it.',
        conversationConfig: {
          initiatorPrompt: (brief, prevOutput) => `Kai, Harry's approved the dashboard redesign. Here's the approved proposal:\n\n${prevOutput}\n\nI need you to run this as a sprint. Assign Luna for the frontend build. What's your plan and timeline?`,
          initiator: 'nikita',
          maxRounds: 2,
        },
      },
      {
        stepId: 'build-and-review',
        name: 'Build + Code Review',
        type: 'conversation',
        agents: ['dev-lead', 'frontend'],
        dependsOn: ['dev-briefing'],
        description: 'Kai briefs Luna on the build. Luna executes. Atlas reviews the code. Kai reports completion to Nikita.',
        conversationConfig: {
          initiatorPrompt: (brief, prevOutput) => `Luna, we've got an approved dashboard redesign to build. Here's the full brief and approved proposal:\n\n${prevOutput}\n\nI need you to outline your implementation plan — components, state management, API integration, and timeline. Then we'll get Atlas to review.`,
          initiator: 'dev-lead',
          maxRounds: 2,
        },
      },
      {
        stepId: 'completion-report',
        name: 'Completion Report',
        type: 'notification',
        agents: ['nikita'],
        dependsOn: ['build-and-review'],
        description: 'Nikita notifies Harry that the dashboard redesign is complete.',
      },
    ],
  },

  CLIENT_ONBOARDING: {
    name: 'Client Onboarding',
    steps: [
      {
        stepId: 'sales-qualification',
        name: 'Lead Qualification',
        type: 'conversation',
        agents: ['sales-lead', 'lead-qualifier'],
        dependsOn: [],
        description: 'Jordan and Sam discuss the new client lead and qualification criteria.',
        conversationConfig: {
          initiatorPrompt: (brief) => `We have a new potential client to qualify. Here's what we know:\n\n${brief}\n\nLet's run through our qualification criteria. What's your initial assessment?`,
          maxRounds: 2,
        },
      },
      {
        stepId: 'proposal-creation',
        name: 'Proposal Creation',
        type: 'conversation',
        agents: ['sales-lead', 'proposal'],
        dependsOn: ['sales-qualification'],
        description: 'Jordan briefs Leo on creating the proposal based on qualified lead info.',
        conversationConfig: {
          initiatorPrompt: (brief, prevOutput) => `Leo, we've qualified a new lead. Here's the qualification summary:\n\n${prevOutput}\n\nI need you to draft a proposal. What do you need from me to get started?`,
          initiator: 'sales-lead',
          maxRounds: 2,
        },
      },
      {
        stepId: 'nikita-review',
        name: 'Nikita Reviews Proposal',
        type: 'conversation',
        agents: ['nikita', 'sales-lead'],
        dependsOn: ['proposal-creation'],
        description: 'Jordan presents the proposal to Nikita for approval.',
        conversationConfig: {
          initiatorPrompt: (brief, prevOutput) => `Nikita, we've qualified a lead and drafted a proposal. Here's the summary:\n\n${prevOutput}\n\nReady for your review before we send it to the client.`,
          initiator: 'sales-lead',
          maxRounds: 2,
        },
      },
      {
        stepId: 'harry-approval',
        name: 'Harry Approval',
        type: 'approval',
        agents: [],
        dependsOn: ['nikita-review'],
        approvalRequired: true,
        description: 'Harry reviews and approves the client proposal.',
      },
    ],
  },

  CONTENT_CAMPAIGN: {
    name: 'Content Campaign',
    steps: [
      {
        stepId: 'strategy-review',
        name: 'CMO + Creative Strategy',
        type: 'conversation',
        agents: ['cmo', 'creative-director'],
        dependsOn: [],
        description: 'Priya and Nova align on campaign strategy and creative direction.',
        conversationConfig: {
          initiatorPrompt: (brief) => `Nova, I've got a new content campaign brief. Here's what we're working with:\n\n${brief}\n\nLet me lay out the marketing strategy and target metrics. I want your creative vision before we brief the team.`,
          maxRounds: 3,
        },
      },
      {
        stepId: 'nikita-review',
        name: 'Nikita Reviews Campaign',
        type: 'conversation',
        agents: ['nikita', 'cmo'],
        dependsOn: ['strategy-review'],
        description: 'Priya presents the campaign plan to Nikita.',
        conversationConfig: {
          initiatorPrompt: (brief, prevOutput) => `Nikita, Nova and I have aligned on a content campaign strategy. Here's our plan:\n\n${prevOutput}\n\nReady for your review.`,
          initiator: 'cmo',
          maxRounds: 2,
        },
      },
      {
        stepId: 'creative-execution',
        name: 'Creative Execution',
        type: 'conversation',
        agents: ['creative-director', 'copywriter'],
        dependsOn: ['nikita-review'],
        description: 'Nova briefs Ash on the copy and creative assets needed.',
        conversationConfig: {
          initiatorPrompt: (brief, prevOutput) => `Ash, we've got an approved content campaign. Here's the brief and strategy:\n\n${prevOutput}\n\nI need you to draft the copy. Let me set the creative guardrails.`,
          initiator: 'creative-director',
          maxRounds: 2,
        },
      },
    ],
  },
};

// ─── Workflow Engine ───────────────────────────────────────────

class WorkflowEngine {
  constructor() {
    /** @type {Map<string, object>} */
    this.workflows = new Map();
    /** @type {Map<string, function>} Pending approval resolvers */
    this._approvalResolvers = new Map();
  }

  /**
   * Create a workflow from a template.
   * @param {string} templateName — key from WORKFLOW_TEMPLATES
   * @param {string} clientId
   * @param {string} brief — the project brief / description
   * @param {string} [createdBy='nikita']
   * @returns {object} The workflow object
   */
  createWorkflow(templateName, clientId, brief, createdBy = 'nikita') {
    const template = WORKFLOW_TEMPLATES[templateName];
    if (!template) {
      throw new Error(`Unknown workflow template: ${templateName}. Available: ${Object.keys(WORKFLOW_TEMPLATES).join(', ')}`);
    }

    const workflow = {
      workflowId: randomUUID(),
      name: template.name,
      templateName,
      clientId,
      brief,
      steps: template.steps.map(step => ({
        ...step,
        status: STEP_STATUS.PENDING,
        output: null,
        conversationId: null,
        startedAt: null,
        completedAt: null,
      })),
      status: WORKFLOW_STATUS.PENDING,
      createdBy,
      approvalRequired: template.steps.some(s => s.approvalRequired),
      approvedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.workflows.set(workflow.workflowId, workflow);
    this._persist(workflow);

    logger.log(createdBy, 'WORKFLOW_CREATED', {
      workflowId: workflow.workflowId,
      template: templateName,
      clientId,
      stepCount: workflow.steps.length,
    });

    return workflow;
  }

  /**
   * Execute a workflow — runs steps in order, respecting dependencies.
   * Pauses at approval gates and waits for approveWorkflow() to be called.
   *
   * @param {string} workflowId
   * @returns {Promise<object>} The completed workflow
   */
  async runWorkflow(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

    workflow.status = WORKFLOW_STATUS.RUNNING;
    workflow.updatedAt = new Date().toISOString();
    this._persist(workflow);

    logger.log('system', 'WORKFLOW_STARTED', {
      workflowId,
      name: workflow.name,
      stepCount: workflow.steps.length,
    });

    console.log(`\n========================================`);
    console.log(`  WORKFLOW: ${workflow.name}`);
    console.log(`  Client: ${workflow.clientId}`);
    console.log(`  Steps: ${workflow.steps.length}`);
    console.log(`========================================\n`);

    // Run steps in dependency order
    for (const step of workflow.steps) {
      // Check dependencies are met
      const depsOk = step.dependsOn.every(depId => {
        const dep = workflow.steps.find(s => s.stepId === depId);
        return dep && dep.status === STEP_STATUS.DONE;
      });

      if (!depsOk) {
        logger.log('system', 'WORKFLOW_STEP_DEPS_NOT_MET', {
          workflowId,
          stepId: step.stepId,
          dependsOn: step.dependsOn,
        });
        step.status = STEP_STATUS.SKIPPED;
        continue;
      }

      console.log(`\n--- Step: ${step.name} ---`);
      console.log(`Type: ${step.type} | Agents: ${step.agents.join(', ') || 'none'}`);

      step.status = STEP_STATUS.RUNNING;
      step.startedAt = new Date().toISOString();
      workflow.updatedAt = new Date().toISOString();
      this._persist(workflow);

      try {
        if (step.type === 'conversation') {
          await this._executeConversationStep(workflow, step);
        } else if (step.type === 'approval') {
          await this._executeApprovalStep(workflow, step);
        } else if (step.type === 'notification') {
          await this._executeNotificationStep(workflow, step);
        }

        step.status = STEP_STATUS.DONE;
        step.completedAt = new Date().toISOString();

        logger.log('system', 'WORKFLOW_STEP_DONE', {
          workflowId,
          stepId: step.stepId,
          name: step.name,
        });
      } catch (err) {
        step.status = STEP_STATUS.FAILED;
        step.output = `Error: ${err.message}`;
        workflow.status = WORKFLOW_STATUS.FAILED;
        workflow.updatedAt = new Date().toISOString();
        this._persist(workflow);

        logger.log('system', 'WORKFLOW_STEP_FAILED', {
          workflowId,
          stepId: step.stepId,
          error: err.message,
        });

        // Workflow failure goes to dashboard logs, not Telegram

        return workflow;
      }

      workflow.updatedAt = new Date().toISOString();
      this._persist(workflow);
    }

    workflow.status = WORKFLOW_STATUS.DONE;
    workflow.completedAt = new Date().toISOString();
    workflow.updatedAt = new Date().toISOString();
    this._persist(workflow);

    logger.log('system', 'WORKFLOW_COMPLETED', {
      workflowId,
      name: workflow.name,
    });

    console.log(`\n========================================`);
    console.log(`  WORKFLOW COMPLETE: ${workflow.name}`);
    console.log(`========================================\n`);

    return workflow;
  }

  /**
   * Approve a workflow step that's waiting for human approval.
   * @param {string} workflowId
   * @param {string} approvedBy — 'harry' or agent ID
   * @returns {boolean}
   */
  approveWorkflow(workflowId, approvedBy = 'harry') {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return false;

    workflow.approvedBy = approvedBy;

    const resolver = this._approvalResolvers.get(workflowId);
    if (resolver) {
      resolver(approvedBy);
      this._approvalResolvers.delete(workflowId);
    }

    logger.log(approvedBy, 'WORKFLOW_APPROVED', { workflowId });
    return true;
  }

  /**
   * Get full workflow status.
   * @param {string} workflowId
   * @returns {object|null}
   */
  getWorkflowStatus(workflowId) {
    return this.workflows.get(workflowId) || null;
  }

  /**
   * List all workflows, optionally filtered by client.
   * @param {string} [clientId]
   * @returns {object[]}
   */
  listWorkflows(clientId) {
    const all = Array.from(this.workflows.values());
    if (clientId) return all.filter(w => w.clientId === clientId);
    return all;
  }

  /**
   * Get available workflow template names.
   * @returns {string[]}
   */
  listTemplates() {
    return Object.keys(WORKFLOW_TEMPLATES);
  }

  // ─── Step Executors ──────────────────────────────────────

  /**
   * Execute a conversation step — two agents talk about the topic.
   */
  async _executeConversationStep(workflow, step) {
    const config = step.conversationConfig;
    const [agentA, agentB] = step.agents;

    // Determine initiator — default to first agent
    const initiator = config.initiator || agentA;
    const responder = initiator === agentA ? agentB : agentA;

    // Build the opening prompt with brief and previous step output
    const prevOutput = this._getPreviousOutput(workflow, step);
    const openingPrompt = config.initiatorPrompt(workflow.brief, prevOutput);

    const conversation = await agentConversation.runConversation(
      `${workflow.name}: ${step.name}`,
      initiator,
      responder,
      openingPrompt,
      {
        maxRounds: config.maxRounds || 3,
        clientId: workflow.clientId,
      },
    );

    step.output = conversation.outcome;
    step.conversationId = conversation.conversationId;
  }

  /**
   * Execute an approval step — notify Harry and wait.
   */
  async _executeApprovalStep(workflow, step) {
    const prevOutput = this._getPreviousOutput(workflow, step);

    // Send the proposal to Harry via Telegram
    const proposalText = [
      `*Workflow Approval Required*`,
      ``,
      `*Workflow:* ${workflow.name}`,
      `*Client:* ${workflow.clientId}`,
      `*Step:* ${step.name}`,
      ``,
      `*Proposal:*`,
      prevOutput ? prevOutput.substring(0, 1500) : 'No details available',
      ``,
      `Reply with "approve ${workflow.workflowId.substring(0, 8)}" to approve.`,
    ].join('\n');

    await telegramNotifier.sendMessage(proposalText);

    workflow.status = WORKFLOW_STATUS.WAITING_APPROVAL;
    this._persist(workflow);

    logger.log('system', 'WORKFLOW_WAITING_APPROVAL', {
      workflowId: workflow.workflowId,
      stepId: step.stepId,
    });

    console.log(`\n[WAITING] Approval required from Harry for: ${step.name}`);
    console.log(`Workflow ID: ${workflow.workflowId}`);

    // Wait for approval (with a timeout for test mode)
    const approved = await this._waitForApproval(workflow.workflowId);
    step.output = `Approved by ${approved}`;

    workflow.status = WORKFLOW_STATUS.RUNNING;
    this._persist(workflow);
  }

  /**
   * Execute a notification step — tell Harry the result.
   */
  async _executeNotificationStep(workflow, step) {
    const prevOutput = this._getPreviousOutput(workflow, step);

    // Workflow completion goes to dashboard, not Telegram
    step.output = prevOutput ? prevOutput.substring(0, 2000) : 'Workflow completed successfully.';

    logger.log('system', 'WORKFLOW_NOTIFICATION_SENT', {
      workflowId: workflow.workflowId,
      stepId: step.stepId,
    });
  }

  // ─── Helpers ──────────────────────────────────────────────

  /**
   * Get the output from the most recent completed dependency step.
   */
  _getPreviousOutput(workflow, step) {
    if (step.dependsOn.length === 0) return null;

    // Get the last dependency's output
    const lastDepId = step.dependsOn[step.dependsOn.length - 1];
    const lastDep = workflow.steps.find(s => s.stepId === lastDepId);
    return lastDep?.output || null;
  }

  /**
   * Wait for workflow approval. Returns a promise that resolves when
   * approveWorkflow() is called, or auto-approves in test mode.
   */
  _waitForApproval(workflowId) {
    // If WORKFLOW_AUTO_APPROVE is set, auto-approve after a short delay
    if (process.env.WORKFLOW_AUTO_APPROVE === 'true') {
      return new Promise(resolve => {
        setTimeout(() => {
          this.approveWorkflow(workflowId, 'auto-approved');
          resolve('auto-approved');
        }, 1000);
      });
    }

    return new Promise(resolve => {
      this._approvalResolvers.set(workflowId, resolve);
    });
  }

  /**
   * Persist workflow to disk.
   */
  _persist(workflow) {
    const filePath = join(WORKFLOWS_DIR, `${workflow.workflowId}.json`);
    // Strip non-serialisable fields before saving
    const serialisable = { ...workflow };
    serialisable.steps = workflow.steps.map(s => {
      const { conversationConfig, ...rest } = s;
      return rest;
    });
    writeFileSync(filePath, JSON.stringify(serialisable, null, 2));
  }

  /**
   * Load a workflow from disk.
   */
  loadWorkflow(workflowId) {
    const filePath = join(WORKFLOWS_DIR, `${workflowId}.json`);
    if (!existsSync(filePath)) return null;
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    this.workflows.set(workflowId, data);
    return data;
  }
}

const workflowEngine = new WorkflowEngine();

export { workflowEngine, WORKFLOW_STATUS, STEP_STATUS, WORKFLOW_TEMPLATES };
