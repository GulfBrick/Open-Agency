import 'dotenv/config';
import { logger } from './core/logger.js';
import { memory } from './core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from './core/message-bus.js';
import { taskQueue, TASK_STATUS } from './core/task-queue.js';
import { nikitaBrain } from './nikita/brain.js';
import { skillTeacher } from './nikita/skill-teacher.js';
import { agentProfile, AGENT_STATUS } from './core/agent-profile.js';
import { experience, OUTCOME } from './core/experience.js';
import { promotion } from './core/promotion.js';
import { businessKnowledge } from './core/business-knowledge.js';
import { loadCSuiteAgents } from './core/agent-loader.js';
import { agentRegistry } from './core/agent-registry.js';
import { cfoBrain } from './agents/cfo/brain.js';
import { ctoBrain } from './agents/cto/brain.js';
import { cmoBrain } from './agents/cmo/brain.js';
import { devLeadBrain } from './agents/dev-team/brain.js';
import { architectBrain } from './agents/dev-team/architect-brain.js';
import { frontendBrain } from './agents/dev-team/frontend-brain.js';
import { backendBrain } from './agents/dev-team/backend-brain.js';
import { fullstackBrain } from './agents/dev-team/fullstack-brain.js';
import { qa } from './agents/dev-team/qa.js';
import { codeReviewer } from './agents/dev-team/code-review.js';
import { sprintManager } from './core/sprint.js';
import { salesLeadBrain } from './agents/sales/brain.js';
import { closerBrain } from './agents/sales/closer-brain.js';
import { leadQualifierBrain } from './agents/sales/lead-qualifier-brain.js';
import { followUpBrain } from './agents/sales/follow-up-brain.js';
import { proposalBrain } from './agents/sales/proposal-brain.js';
import { creativeDirectorBrain } from './agents/creative/director-brain.js';
import { designerBrain } from './agents/creative/designer-brain.js';
import { videoBrain } from './agents/creative/video-brain.js';
import { socialBrain } from './agents/creative/social-brain.js';
import { copywriterBrain } from './agents/creative/copywriter-brain.js';
import { brandVault } from './core/brand-vault.js';
import { contentCalendar } from './core/content-calendar.js';
import { scheduler } from './core/scheduler.js';
import { telegramNotifier } from './core/telegram-notifier.js';
import { nikitaGateway } from './core/nikita-gateway.js';
import { taskExecutor } from './core/task-executor.js';
import { createDashboardServer } from './dashboard/server.js';
import { agentPersonas } from './core/agent-personas.js';
import { agentConversation } from './core/agent-conversation.js';
import { workflowEngine } from './core/workflow-engine.js';
import { clientOnboarding } from './core/client-onboarding.js';
// telegramInbound disabled — OpenClaw handles Telegram polling; running a second poller causes 409 conflicts
// import { telegramInbound } from './core/telegram-inbound.js';

const AGENT_ID = 'nikita';

/**
 * Initialise Nikita via her gateway — she subscribes to the bus and starts listening.
 */
function initNikita() {
  nikitaGateway.start();
}

/**
 * Register Clearline Markets as the first client in the knowledge base.
 */
function initClients() {
  businessKnowledge.initClient('clearline-markets', {
    name: 'Clearline Markets',
    description: 'Financial services firm — our flagship client.',
    industry: 'Financial Services',
    contacts: ['harry'],
  });
  logger.log('system', 'CLIENT_REGISTERED', { clientId: 'clearline-markets' });
}

/**
 * Print a clean startup summary to the console.
 */
function printStartupSummary(bootCount, csuiteAgents = {}) {
  const agents = agentProfile.listAgents();
  const clients = businessKnowledge.listClients();
  const csuiteCount = Object.keys(csuiteAgents).length;

  console.log('');
  console.log('----------------------------------------');
  console.log('  Systems Online');
  console.log('----------------------------------------');
  console.log(`  Logger .............. OK`);
  console.log(`  Memory .............. OK  (boot #${bootCount})`);
  console.log(`  Message Bus ......... OK`);
  console.log(`  Task Queue .......... OK`);
  console.log(`  Agent Profiles ...... OK  (${agents.length} agents)`);
  console.log(`  Experience Tracker .. OK`);
  console.log(`  Promotion Engine .... OK`);
  console.log(`  Business Knowledge .. OK  (${clients.length} client${clients.length !== 1 ? 's' : ''})`);
  console.log(`  Skill Teacher ....... OK`);
  console.log(`  Nikita Brain ........ OK`);
  console.log(`  Nikita Gateway ...... OK  (listening)`);
  console.log(`  Task Executor ....... OK  (polling 30s)`);
  console.log(`  C-Suite Agents ...... OK  (${csuiteCount}/3 loaded)`);
  console.log(`  Brand Vault ......... OK`);
  console.log(`  Content Calendar .... OK`);
  console.log(`  Scheduler ........... OK  (${scheduler.listSchedules().length} schedules)`);
  console.log(`  Telegram Out ........ ${telegramNotifier.enabled ? 'OK' : 'OFF'}  (${telegramNotifier.enabled ? 'connected' : 'no token'})`);
  console.log(`  Telegram In ......... OFF  (disabled)`);
  console.log(`  Dashboard ........... OK  (port 3001)`);
  console.log(`  Agent Registry ...... OK  (${agentRegistry.list().length} registered)`);
  console.log(`  Agent Personas ...... OK  (${agentPersonas.listAgentIds().length} personas)`);
  console.log(`  Conversations ....... OK`);
  console.log(`  Workflow Engine ..... OK  (${workflowEngine.listTemplates().length} templates)`);
  console.log(`  Client Onboarding .. OK`);
  console.log('----------------------------------------');
  console.log('  C-Suite:');
  const csuiteNames = { cfo: 'Marcus (CFO)', cto: 'Zara (CTO)', cmo: 'Priya (CMO)' };
  for (const [id, name] of Object.entries(csuiteNames)) {
    const status = csuiteAgents[id] ? 'ONLINE' : 'OFFLINE';
    const inRegistry = agentRegistry.get(id) ? 'REG' : '---';
    console.log(`    ${name} ......... ${status}  [${inRegistry}]`);
  }
  console.log('----------------------------------------');
  console.log('  Dev Team:');
  const devTeamNames = {
    'dev-lead': 'Dev Lead',
    'architect': 'Architect',
    'frontend': 'Frontend Dev',
    'backend': 'Backend Dev',
    'fullstack': 'Fullstack Dev',
    'qa': 'QA Engineer',
    'code-review': 'Code Reviewer',
  };
  for (const [id, name] of Object.entries(devTeamNames)) {
    const inRegistry = agentRegistry.get(id) ? 'REG' : '---';
    console.log(`    ${name} ......... ONLINE  [${inRegistry}]`);
  }
  console.log('----------------------------------------');
  console.log('  Sales Team:');
  const salesTeamNames = {
    'sales-lead': 'Sales Lead',
    'closer': 'Closer Bot',
    'lead-qualifier': 'Lead Qualifier',
    'follow-up': 'Follow-Up Bot',
    'proposal': 'Proposal Bot',
  };
  for (const [id, name] of Object.entries(salesTeamNames)) {
    const inRegistry = agentRegistry.get(id) ? 'REG' : '---';
    console.log(`    ${name} ......... ONLINE  [${inRegistry}]`);
  }
  console.log('----------------------------------------');
  console.log('  Creative Team:');
  const creativeTeamNames = {
    'creative-director': 'Nova (Director)',
    'designer': 'Iris (Designer)',
    'video-editor': 'Finn (Video)',
    'social-media': 'Jade (Social)',
    'copywriter': 'Ash (Copy)',
  };
  for (const [id, name] of Object.entries(creativeTeamNames)) {
    const inRegistry = agentRegistry.get(id) ? 'REG' : '---';
    console.log(`    ${name} ......... ONLINE  [${inRegistry}]`);
  }
  console.log('----------------------------------------');
  console.log('  All Agents:');
  for (const agent of agents) {
    console.log(`    ${agent.agentId} — ${agent.rank} (${agent.department}) [${agent.status}]`);
  }
  console.log('----------------------------------------');
  console.log('');
}

/**
 * Boot the agency.
 */
async function boot() {
  console.log('');
  console.log('========================================');
  console.log('  Open Agency — Starting Up');
  console.log('========================================');
  console.log('');

  // Initialise core systems
  logger.log('system', 'BOOT', { phase: 'core_init' });

  // Load previous state
  const bootCount = (memory.get('bootCount') || 0) + 1;
  memory.set('bootCount', bootCount);
  memory.set('lastBoot', new Date().toISOString());

  logger.log('system', 'STATE_LOADED', { bootCount });

  // Initialise Nikita
  initNikita();
  logger.log(AGENT_ID, 'ONLINE', { model: 'claude-opus-4-6' });

  // Assess Nikita's own skills
  const nikitaSkills = skillTeacher.assessAgentSkills(AGENT_ID);
  logger.log(AGENT_ID, 'SELF_ASSESSMENT', {
    skillCount: nikitaSkills.skills.length,
    hasConfig: nikitaSkills.hasClaudeMd,
  });

  // Load C-Suite agents (CFO, CTO, CMO)
  const csuiteAgents = await loadCSuiteAgents();
  logger.log('system', 'CSUITE_LOADED', { count: Object.keys(csuiteAgents).length });

  // Register C-Suite brains in the agent registry
  agentRegistry.register('cfo', cfoBrain);
  agentRegistry.register('cto', ctoBrain);
  agentRegistry.register('cmo', cmoBrain);

  // Register Dev Team agents
  const devTeamAgents = {
    'dev-lead': devLeadBrain,
    'architect': architectBrain,
    'frontend': frontendBrain,
    'backend': backendBrain,
    'fullstack': fullstackBrain,
    'qa': qa,
    'code-review': codeReviewer,
  };
  for (const [id, brain] of Object.entries(devTeamAgents)) {
    agentRegistry.register(id, brain);
  }
  logger.log('system', 'DEV_TEAM_LOADED', { count: Object.keys(devTeamAgents).length });

  // Register Sales Team agents
  const salesTeamAgents = {
    'sales-lead': salesLeadBrain,
    'closer': closerBrain,
    'lead-qualifier': leadQualifierBrain,
    'follow-up': followUpBrain,
    'proposal': proposalBrain,
  };
  for (const [id, brain] of Object.entries(salesTeamAgents)) {
    agentRegistry.register(id, brain);
  }
  logger.log('system', 'SALES_TEAM_LOADED', { count: Object.keys(salesTeamAgents).length });

  // Register Creative Team agents
  const creativeTeamAgents = {
    'creative-director': creativeDirectorBrain,
    'designer': designerBrain,
    'video-editor': videoBrain,
    'social-media': socialBrain,
    'copywriter': copywriterBrain,
  };
  for (const [id, brain] of Object.entries(creativeTeamAgents)) {
    agentRegistry.register(id, brain);
  }
  logger.log('system', 'CREATIVE_TEAM_LOADED', { count: Object.keys(creativeTeamAgents).length });

  logger.log('system', 'REGISTRY_READY', { agents: agentRegistry.list() });

  // Register Nikita in the registry so scheduler can dispatch to her
  agentRegistry.register('nikita', nikitaBrain);

  // Register clients
  initClients();

  // Start the task executor — polls the queue and runs tasks through agents
  taskExecutor.start();
  logger.log('system', 'TASK_EXECUTOR_STARTED', { pollInterval: '30s' });

  // Start the scheduler
  scheduler.start();
  logger.log('system', 'SCHEDULER_STARTED', { schedules: scheduler.listSchedules().length });

  // Start the dashboard server
  const dashboard = createDashboardServer();
  await dashboard.start();
  logger.log('system', 'DASHBOARD_STARTED', { port: 3001 });

  // Print the startup summary
  printStartupSummary(bootCount, csuiteAgents);

  console.log(`  Nikita is online. Boot #${bootCount}.`);
  console.log('  Waiting for messages...');
  console.log('');

  // telegramInbound disabled — OpenClaw handles Telegram polling; running a second poller causes 409 conflicts

  // Notify Harry on Telegram that the agency is online
  const totalAgents = agentRegistry.list().length;
  telegramNotifier.notifyBoot(bootCount, totalAgents);

  // Generate a briefing if API key is available
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const briefing = await nikitaBrain.generateBriefing();
      console.log('--- Morning Briefing ---');
      console.log(briefing);
      console.log('------------------------');
    } catch (err) {
      logger.log(AGENT_ID, 'BRIEFING_SKIPPED', { reason: err.message });
      console.log('  (Briefing skipped — check API key)');
    }
  } else {
    console.log('  No ANTHROPIC_API_KEY set — running in offline mode.');
    console.log('  Set your key in .env to enable Nikita\'s brain.');
  }
}

// Expose systems for external use
export {
  messageBus, MESSAGE_TYPES, PRIORITY,
  taskQueue, TASK_STATUS,
  memory, logger,
  nikitaBrain, skillTeacher,
  agentProfile, AGENT_STATUS,
  experience, OUTCOME,
  promotion,
  businessKnowledge,
  agentRegistry,
  nikitaGateway,
  taskExecutor,
  devLeadBrain, architectBrain, frontendBrain, backendBrain, fullstackBrain,
  qa, codeReviewer,
  sprintManager,
  salesLeadBrain, closerBrain, leadQualifierBrain, followUpBrain, proposalBrain,
  scheduler,
  telegramNotifier,
  agentPersonas,
  agentConversation,
  workflowEngine,
  clientOnboarding,
};

// Boot
boot().catch(err => {
  console.error('Boot failed:', err);
  process.exit(1);
});
