/**
 * Client Onboarding System
 *
 * Handles the full onboarding process when a new client signs up:
 *   1. Collect and store the client brief
 *   2. Assign the right agent team based on client needs
 *   3. Create the first sprint of onboarding tasks
 *   4. Generate a welcome report
 *
 * Integrates with: businessKnowledge, agentProfile, taskQueue, messageBus, memory, logger
 */

import { randomUUID } from 'crypto';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { businessKnowledge } from './business-knowledge.js';
import { agentProfile } from './agent-profile.js';
import { taskQueue, PRIORITY } from './task-queue.js';
import { messageBus, MESSAGE_TYPES } from './message-bus.js';
import { memory } from './memory.js';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const CLIENTS_DIR = join(PROJECT_ROOT, 'data', 'clients');

// Agent team definitions — who does what
const CORE_TEAM = [
  { agentId: 'cfo', name: 'Marcus (CFO)', role: 'Financial Oversight' },
  { agentId: 'cto', name: 'Zara (CTO)', role: 'Technology Strategy' },
  { agentId: 'cmo', name: 'Priya (CMO)', role: 'Marketing & Brand Strategy' },
];

const DEV_TEAM = [
  { agentId: 'dev-lead', name: 'Kai (Dev Lead)', role: 'Development Management' },
  { agentId: 'architect', name: 'Architect Bot', role: 'Technical Architecture' },
  { agentId: 'frontend', name: 'Frontend Dev', role: 'Frontend Development' },
  { agentId: 'backend', name: 'Backend Dev', role: 'Backend Development' },
  { agentId: 'qa', name: 'QA Engineer', role: 'Quality Assurance' },
];

const SALES_TEAM = [
  { agentId: 'sales-lead', name: 'Jordan (Sales)', role: 'Sales Strategy' },
  { agentId: 'closer', name: 'Closer Bot', role: 'Deal Closing' },
  { agentId: 'proposal', name: 'Proposal Bot', role: 'Proposal Writing' },
];

const CREATIVE_TEAM = [
  { agentId: 'creative-director', name: 'Nova (Creative)', role: 'Creative Direction' },
  { agentId: 'designer', name: 'Iris (Designer)', role: 'Visual Design' },
  { agentId: 'copywriter', name: 'Ash (Copy)', role: 'Copywriting' },
  { agentId: 'social-media', name: 'Jade (Social)', role: 'Social Media' },
];

// Keywords that signal a client needs specific teams
const NEED_SIGNALS = {
  dev: [
    'website', 'app', 'software', 'platform', 'api', 'saas', 'mobile',
    'development', 'tech build', 'mvp', 'prototype', 'migration', 'infrastructure',
    'database', 'backend', 'frontend', 'full-stack', 'fullstack', 'deployment',
  ],
  sales: [
    'sales', 'revenue', 'growth', 'leads', 'pipeline', 'conversion', 'outbound',
    'inbound', 'acquisition', 'customers', 'market expansion', 'partnerships',
    'deal flow', 'b2b', 'b2c', 'enterprise sales',
  ],
  creative: [
    'brand', 'branding', 'design', 'content', 'social media', 'creative',
    'video', 'copy', 'marketing materials', 'visual identity', 'logo',
    'campaign', 'advertising', 'media', 'rebrand',
  ],
};

class ClientOnboarding {
  /**
   * Step 1: Collect and store the client brief.
   *
   * Takes a structured brief object and persists it as both
   * business knowledge and a dedicated client profile.
   *
   * @param {string} clientId — unique slug (e.g. "acme-corp")
   * @param {object} brief
   * @param {string} brief.companyName
   * @param {string} brief.industry
   * @param {string} [brief.size] — company size (e.g. "50-100", "startup", "enterprise")
   * @param {string} [brief.website]
   * @param {string[]} [brief.mainChallenges]
   * @param {string[]} [brief.goals]
   * @param {object} [brief.budget] — { monthly, currency }
   * @param {string} [brief.timeline] — e.g. "3 months", "Q2 2026"
   * @param {string[]} [brief.currentTools]
   * @param {object[]} [brief.contacts] — [{ name, email, role }]
   * @returns {object} The full client profile
   */
  collectClientBrief(clientId, brief) {
    if (!clientId || !brief || !brief.companyName) {
      throw new Error('clientId and brief.companyName are required');
    }

    logger.log('nikita', 'ONBOARDING_BRIEF_RECEIVED', {
      clientId,
      companyName: brief.companyName,
    });

    // Initialise in business knowledge
    businessKnowledge.initClient(clientId, {
      name: brief.companyName,
      description: `${brief.companyName} — ${brief.industry || 'Unknown industry'}. ${brief.size ? `Size: ${brief.size}.` : ''} ${brief.mainChallenges?.length ? `Challenges: ${brief.mainChallenges.join(', ')}.` : ''}`,
      industry: brief.industry || null,
      contacts: brief.contacts?.map(c => c.name || c.email) || [],
    });

    // Store client preferences from the brief
    businessKnowledge.updatePreferences(clientId, {
      budget: brief.budget || null,
      timeline: brief.timeline || null,
      currentTools: brief.currentTools || [],
      goals: brief.goals || [],
      mainChallenges: brief.mainChallenges || [],
    });

    // Build the full client profile and persist it
    const clientProfile = {
      clientId,
      companyName: brief.companyName,
      industry: brief.industry || null,
      size: brief.size || null,
      website: brief.website || null,
      mainChallenges: brief.mainChallenges || [],
      goals: brief.goals || [],
      budget: brief.budget || null,
      timeline: brief.timeline || null,
      currentTools: brief.currentTools || [],
      contacts: brief.contacts || [],
      onboardingStatus: 'brief_collected',
      assignedTeam: [],
      onboardingTasks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Persist the full profile to data/clients/[clientId]/
    const clientDir = join(CLIENTS_DIR, clientId);
    mkdirSync(clientDir, { recursive: true });
    writeFileSync(
      join(clientDir, 'profile.json'),
      JSON.stringify(clientProfile, null, 2),
    );

    // Store reference in memory for quick access
    memory.set(`client:${clientId}:profile`, clientProfile);

    // Record the onboarding decision
    businessKnowledge.recordDecision(
      clientId,
      `Client onboarding initiated for ${brief.companyName}`,
      'Brief collected and stored',
      'nikita',
    );

    logger.log('nikita', 'ONBOARDING_BRIEF_STORED', {
      clientId,
      companyName: brief.companyName,
      industry: brief.industry,
      challengeCount: brief.mainChallenges?.length || 0,
      goalCount: brief.goals?.length || 0,
    });

    return clientProfile;
  }

  /**
   * Step 2: Assign the right agent team based on client needs.
   *
   * Always assigns core C-suite (CFO, CTO, CMO).
   * Conditionally assigns dev, sales, and creative teams based on
   * keywords found in the client's challenges, goals, and industry.
   *
   * @param {string} clientId
   * @returns {object} Assignment summary: { clientId, coreTeam, devTeam, salesTeam, creativeTeam, allAgents }
   */
  assignAgentTeam(clientId) {
    const profile = this._getProfile(clientId);
    if (!profile) {
      throw new Error(`Client '${clientId}' not found. Run collectClientBrief first.`);
    }

    logger.log('nikita', 'ONBOARDING_TEAM_ASSIGNMENT', { clientId });

    // Build searchable text from the client's brief
    const searchText = [
      ...(profile.mainChallenges || []),
      ...(profile.goals || []),
      profile.industry || '',
      profile.companyName || '',
      ...(profile.currentTools || []),
    ].join(' ').toLowerCase();

    // Always assign core team
    const assignment = {
      clientId,
      coreTeam: [...CORE_TEAM],
      devTeam: null,
      salesTeam: null,
      creativeTeam: null,
      allAgents: [],
    };

    // Check if dev team is needed
    const needsDev = NEED_SIGNALS.dev.some(kw => searchText.includes(kw));
    if (needsDev) {
      assignment.devTeam = [...DEV_TEAM];
    }

    // Check if sales team is needed
    const needsSales = NEED_SIGNALS.sales.some(kw => searchText.includes(kw));
    if (needsSales) {
      assignment.salesTeam = [...SALES_TEAM];
    }

    // Check if creative team is needed
    const needsCreative = NEED_SIGNALS.creative.some(kw => searchText.includes(kw));
    if (needsCreative) {
      assignment.creativeTeam = [...CREATIVE_TEAM];
    }

    // Flatten all assigned agents
    assignment.allAgents = [
      ...assignment.coreTeam,
      ...(assignment.devTeam || []),
      ...(assignment.salesTeam || []),
      ...(assignment.creativeTeam || []),
    ];

    // Register each agent against the client via agentProfile
    for (const agent of assignment.allAgents) {
      agentProfile.assignToClient(agent.agentId, clientId);
    }

    // Update the client profile
    profile.assignedTeam = assignment.allAgents.map(a => ({
      agentId: a.agentId,
      name: a.name,
      role: a.role,
    }));
    profile.onboardingStatus = 'team_assigned';
    profile.updatedAt = new Date().toISOString();
    this._saveProfile(clientId, profile);

    // Store assignment in memory
    memory.set(`client:${clientId}:team`, assignment);

    // Notify on the message bus
    messageBus.send({
      from: 'nikita',
      to: 'nikita',
      type: MESSAGE_TYPES.BRIEFING,
      priority: 'HIGH',
      payload: {
        event: 'team_assigned',
        clientId,
        agentCount: assignment.allAgents.length,
        teams: {
          core: true,
          dev: !!assignment.devTeam,
          sales: !!assignment.salesTeam,
          creative: !!assignment.creativeTeam,
        },
      },
    });

    // Record the decision
    const teamNames = ['Core (CFO, CTO, CMO)'];
    if (assignment.devTeam) teamNames.push('Dev Team');
    if (assignment.salesTeam) teamNames.push('Sales Team');
    if (assignment.creativeTeam) teamNames.push('Creative Team');

    businessKnowledge.recordDecision(
      clientId,
      `Assigned teams: ${teamNames.join(', ')}`,
      `${assignment.allAgents.length} agents assigned based on client needs analysis`,
      'nikita',
    );

    logger.log('nikita', 'ONBOARDING_TEAM_ASSIGNED', {
      clientId,
      totalAgents: assignment.allAgents.length,
      hasDev: !!assignment.devTeam,
      hasSales: !!assignment.salesTeam,
      hasCreative: !!assignment.creativeTeam,
    });

    return assignment;
  }

  /**
   * Step 3: Create the first sprint of onboarding tasks.
   *
   * Queues initial assessment tasks for the C-suite:
   *   - CFO: financial health assessment
   *   - CTO: tech stack audit
   *   - CMO: brand and market assessment
   *
   * If dev/sales/creative teams are assigned, adds their kickoff tasks too.
   *
   * @param {string} clientId
   * @returns {object[]} Array of created tasks
   */
  createOnboardingTasks(clientId) {
    const profile = this._getProfile(clientId);
    if (!profile) {
      throw new Error(`Client '${clientId}' not found. Run collectClientBrief first.`);
    }

    const team = memory.get(`client:${clientId}:team`);
    if (!team) {
      throw new Error(`No team assigned to '${clientId}'. Run assignAgentTeam first.`);
    }

    logger.log('nikita', 'ONBOARDING_TASKS_CREATING', { clientId });

    const tasks = [];
    const companyName = profile.companyName;

    // CFO: Financial health assessment
    tasks.push(taskQueue.enqueue({
      assignedTo: 'cfo',
      createdBy: 'nikita',
      type: MESSAGE_TYPES.TASK,
      priority: PRIORITY.HIGH,
      description: `[ONBOARDING] Initial financial health assessment for ${companyName}. Review budget (${JSON.stringify(profile.budget || 'not specified')}), establish financial tracking, set spending thresholds, and create initial financial plan. Client ID: ${clientId}`,
    }));

    // CTO: Tech stack audit
    tasks.push(taskQueue.enqueue({
      assignedTo: 'cto',
      createdBy: 'nikita',
      type: MESSAGE_TYPES.TASK,
      priority: PRIORITY.HIGH,
      description: `[ONBOARDING] Tech stack audit for ${companyName}. Review current tools: ${(profile.currentTools || []).join(', ') || 'none listed'}. Assess technical infrastructure, identify gaps, and recommend improvements. Client ID: ${clientId}`,
    }));

    // CMO: Brand and market assessment
    tasks.push(taskQueue.enqueue({
      assignedTo: 'cmo',
      createdBy: 'nikita',
      type: MESSAGE_TYPES.TASK,
      priority: PRIORITY.HIGH,
      description: `[ONBOARDING] Brand and market assessment for ${companyName}. Industry: ${profile.industry || 'not specified'}. Evaluate current brand positioning, assess market landscape, identify opportunities. Website: ${profile.website || 'not provided'}. Client ID: ${clientId}`,
    }));

    // Dev team kickoff (if assigned)
    if (team.devTeam) {
      tasks.push(taskQueue.enqueue({
        assignedTo: 'dev-lead',
        createdBy: 'nikita',
        type: MESSAGE_TYPES.TASK,
        priority: PRIORITY.MEDIUM,
        description: `[ONBOARDING] Development kickoff for ${companyName}. Review technical challenges: ${(profile.mainChallenges || []).join(', ')}. Plan initial sprint, assess team capacity, and identify priority deliverables. Client ID: ${clientId}`,
      }));
    }

    // Sales team kickoff (if assigned)
    if (team.salesTeam) {
      tasks.push(taskQueue.enqueue({
        assignedTo: 'sales-lead',
        createdBy: 'nikita',
        type: MESSAGE_TYPES.TASK,
        priority: PRIORITY.MEDIUM,
        description: `[ONBOARDING] Sales strategy kickoff for ${companyName}. Goals: ${(profile.goals || []).join(', ')}. Assess current sales pipeline, identify growth opportunities, and create initial outreach plan. Client ID: ${clientId}`,
      }));
    }

    // Creative team kickoff (if assigned)
    if (team.creativeTeam) {
      tasks.push(taskQueue.enqueue({
        assignedTo: 'creative-director',
        createdBy: 'nikita',
        type: MESSAGE_TYPES.TASK,
        priority: PRIORITY.MEDIUM,
        description: `[ONBOARDING] Creative kickoff for ${companyName}. Establish brand guidelines, review existing visual identity, plan content calendar, and identify immediate creative needs. Website: ${profile.website || 'not provided'}. Client ID: ${clientId}`,
      }));
    }

    // Update profile with task references
    profile.onboardingTasks = tasks.map(t => ({
      taskId: t.id,
      assignedTo: t.assignedTo,
      description: t.description.split('.')[0], // First sentence only
      status: t.status,
    }));
    profile.onboardingStatus = 'tasks_created';
    profile.updatedAt = new Date().toISOString();
    this._saveProfile(clientId, profile);

    // Store tasks reference in memory
    memory.set(`client:${clientId}:onboarding-tasks`, tasks.map(t => t.id));

    // Notify agents on the bus
    for (const task of tasks) {
      messageBus.send({
        from: 'nikita',
        to: task.assignedTo,
        type: MESSAGE_TYPES.TASK,
        priority: task.priority,
        payload: {
          event: 'onboarding_task',
          clientId,
          taskId: task.id,
          description: task.description,
        },
      });
    }

    logger.log('nikita', 'ONBOARDING_TASKS_CREATED', {
      clientId,
      taskCount: tasks.length,
      taskIds: tasks.map(t => t.id),
    });

    return tasks;
  }

  /**
   * Step 4: Generate a formatted welcome report.
   *
   * Produces a structured document summarising:
   *   - Who their assigned team is
   *   - What the first sprint covers
   *   - What they can expect in week 1
   *
   * @param {string} clientId
   * @returns {object} { clientId, report (string), generatedAt }
   */
  generateWelcomeReport(clientId) {
    const profile = this._getProfile(clientId);
    if (!profile) {
      throw new Error(`Client '${clientId}' not found. Run collectClientBrief first.`);
    }

    const team = memory.get(`client:${clientId}:team`);
    const taskIds = memory.get(`client:${clientId}:onboarding-tasks`) || [];

    logger.log('nikita', 'ONBOARDING_REPORT_GENERATING', { clientId });

    // Retrieve task details
    const onboardingTasks = taskIds
      .map(id => taskQueue.getById(id))
      .filter(Boolean);

    // Build the report
    const lines = [];

    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push(`  WELCOME TO OPEN AGENCY — ${profile.companyName.toUpperCase()}`);
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`  Client: ${profile.companyName}`);
    lines.push(`  Industry: ${profile.industry || 'Not specified'}`);
    lines.push(`  Company Size: ${profile.size || 'Not specified'}`);
    if (profile.website) lines.push(`  Website: ${profile.website}`);
    lines.push(`  Onboarded: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`);
    lines.push('');

    // Your Team
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('  YOUR TEAM');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('');
    lines.push('  You have been assigned the following team members:');
    lines.push('');

    // Core team (always present)
    lines.push('  Core Leadership:');
    for (const agent of (team?.coreTeam || CORE_TEAM)) {
      lines.push(`    • ${agent.name} — ${agent.role}`);
    }
    lines.push('');

    if (team?.devTeam) {
      lines.push('  Development Team:');
      for (const agent of team.devTeam) {
        lines.push(`    • ${agent.name} — ${agent.role}`);
      }
      lines.push('');
    }

    if (team?.salesTeam) {
      lines.push('  Sales Team:');
      for (const agent of team.salesTeam) {
        lines.push(`    • ${agent.name} — ${agent.role}`);
      }
      lines.push('');
    }

    if (team?.creativeTeam) {
      lines.push('  Creative Team:');
      for (const agent of team.creativeTeam) {
        lines.push(`    • ${agent.name} — ${agent.role}`);
      }
      lines.push('');
    }

    const totalAgents = team?.allAgents?.length || CORE_TEAM.length;
    lines.push(`  Total: ${totalAgents} agents assigned to your account.`);
    lines.push('');

    // First Sprint
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('  FIRST SPRINT — ONBOARDING ASSESSMENTS');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('');

    if (onboardingTasks.length > 0) {
      for (const task of onboardingTasks) {
        const shortDesc = task.description
          .replace(/\[ONBOARDING\]\s*/, '')
          .split('.')[0];
        lines.push(`  [${task.priority}] ${task.assignedTo.toUpperCase()}: ${shortDesc}`);
        lines.push(`         Status: ${task.status}`);
      }
    } else {
      lines.push('  Tasks are being prepared. Run createOnboardingTasks first.');
    }
    lines.push('');

    // Week 1 Expectations
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('  WHAT TO EXPECT — WEEK 1');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('');
    lines.push('  Day 1-2: Initial assessments begin');
    lines.push('    • CFO Marcus reviews your financials and sets up tracking');
    lines.push('    • CTO Zara audits your tech stack and infrastructure');
    lines.push('    • CMO Priya evaluates your brand and market position');
    lines.push('');

    if (team?.devTeam) {
      lines.push('  Day 2-3: Development kickoff');
      lines.push('    • Dev Lead Kai plans the initial sprint');
      lines.push('    • Architect reviews technical requirements');
      lines.push('');
    }

    if (team?.salesTeam) {
      lines.push('  Day 2-3: Sales strategy');
      lines.push('    • Sales Lead Jordan maps your growth opportunities');
      lines.push('    • Pipeline setup and initial outreach planning');
      lines.push('');
    }

    if (team?.creativeTeam) {
      lines.push('  Day 2-3: Creative setup');
      lines.push('    • Creative Director Nova establishes brand guidelines');
      lines.push('    • Content calendar planning begins');
      lines.push('');
    }

    lines.push('  Day 4-5: Consolidated report');
    lines.push('    • Nikita (that\'s me) compiles findings from all teams');
    lines.push('    • You receive a comprehensive strategy document');
    lines.push('    • We align on priorities and next steps');
    lines.push('');

    // Challenges & Goals Recap
    if (profile.mainChallenges?.length || profile.goals?.length) {
      lines.push('───────────────────────────────────────────────────────────────');
      lines.push('  YOUR PRIORITIES (as we understand them)');
      lines.push('───────────────────────────────────────────────────────────────');
      lines.push('');

      if (profile.mainChallenges?.length) {
        lines.push('  Challenges:');
        for (const challenge of profile.mainChallenges) {
          lines.push(`    • ${challenge}`);
        }
        lines.push('');
      }

      if (profile.goals?.length) {
        lines.push('  Goals:');
        for (const goal of profile.goals) {
          lines.push(`    • ${goal}`);
        }
        lines.push('');
      }
    }

    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('  CONTACT');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('');
    lines.push('  Your account is managed by Nikita, Owner & CEO of Open Agency.');
    lines.push('  All communications flow through me. I\'ll keep you updated on');
    lines.push('  progress and escalate anything that needs your attention.');
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('  Welcome aboard. Let\'s build something brilliant.');
    lines.push('═══════════════════════════════════════════════════════════════');

    const report = lines.join('\n');

    // Persist the welcome report
    const clientDir = join(CLIENTS_DIR, clientId);
    mkdirSync(clientDir, { recursive: true });
    writeFileSync(join(clientDir, 'welcome-report.txt'), report);

    // Update profile status
    profile.onboardingStatus = 'complete';
    profile.welcomeReportGeneratedAt = new Date().toISOString();
    profile.updatedAt = new Date().toISOString();
    this._saveProfile(clientId, profile);

    // Store in memory
    const result = {
      clientId,
      report,
      generatedAt: new Date().toISOString(),
    };
    memory.set(`client:${clientId}:welcome-report`, result);

    // Notify Nikita on the bus
    messageBus.send({
      from: 'nikita',
      to: 'nikita',
      type: MESSAGE_TYPES.REPORT,
      priority: 'HIGH',
      payload: {
        event: 'onboarding_complete',
        clientId,
        companyName: profile.companyName,
        teamSize: team?.allAgents?.length || CORE_TEAM.length,
        taskCount: onboardingTasks.length,
      },
    });

    logger.log('nikita', 'ONBOARDING_COMPLETE', {
      clientId,
      companyName: profile.companyName,
      teamSize: team?.allAgents?.length || CORE_TEAM.length,
      taskCount: onboardingTasks.length,
    });

    return result;
  }

  /**
   * Run the full onboarding pipeline in sequence.
   *
   * @param {string} clientId
   * @param {object} brief — see collectClientBrief for structure
   * @returns {object} { profile, team, tasks, welcomeReport }
   */
  runFullOnboarding(clientId, brief) {
    logger.log('nikita', 'ONBOARDING_FULL_START', {
      clientId,
      companyName: brief.companyName,
    });

    const profile = this.collectClientBrief(clientId, brief);
    const team = this.assignAgentTeam(clientId);
    const tasks = this.createOnboardingTasks(clientId);
    const welcomeReport = this.generateWelcomeReport(clientId);

    logger.log('nikita', 'ONBOARDING_FULL_COMPLETE', {
      clientId,
      companyName: brief.companyName,
      teamSize: team.allAgents.length,
      taskCount: tasks.length,
    });

    return { profile, team, tasks, welcomeReport };
  }

  /**
   * Get the current onboarding status for a client.
   *
   * @param {string} clientId
   * @returns {object|null} Status summary
   */
  getOnboardingStatus(clientId) {
    const profile = this._getProfile(clientId);
    if (!profile) return null;

    const team = memory.get(`client:${clientId}:team`);
    const taskIds = memory.get(`client:${clientId}:onboarding-tasks`) || [];
    const tasks = taskIds.map(id => taskQueue.getById(id)).filter(Boolean);

    const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
    const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS').length;
    const pendingTasks = tasks.filter(t => t.status === 'PENDING').length;

    return {
      clientId,
      companyName: profile.companyName,
      onboardingStatus: profile.onboardingStatus,
      team: team?.allAgents?.map(a => ({
        agentId: a.agentId,
        name: a.name,
        role: a.role,
      })) || [],
      tasks: {
        total: tasks.length,
        completed: completedTasks,
        inProgress: inProgressTasks,
        pending: pendingTasks,
        details: tasks.map(t => ({
          taskId: t.id,
          assignedTo: t.assignedTo,
          status: t.status,
          priority: t.priority,
          description: t.description.replace(/\[ONBOARDING\]\s*/, '').split('.')[0],
        })),
      },
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  /**
   * Get the assigned team for a client.
   *
   * @param {string} clientId
   * @returns {object|null} Team assignment
   */
  getClientTeam(clientId) {
    const team = memory.get(`client:${clientId}:team`);
    if (team) return team;

    // Fall back to profile data
    const profile = this._getProfile(clientId);
    if (!profile || !profile.assignedTeam?.length) return null;

    return {
      clientId,
      allAgents: profile.assignedTeam,
    };
  }

  // ─── Internal Helpers ──────────────────────────────────────

  /**
   * Load the client profile from disk.
   * @param {string} clientId
   * @returns {object|null}
   * @private
   */
  _getProfile(clientId) {
    // Try memory first
    const cached = memory.get(`client:${clientId}:profile`);
    if (cached) return cached;

    // Fall back to disk
    const filePath = join(CLIENTS_DIR, clientId, 'profile.json');
    if (!existsSync(filePath)) return null;

    try {
      const profile = JSON.parse(readFileSync(filePath, 'utf-8'));
      memory.set(`client:${clientId}:profile`, profile);
      return profile;
    } catch {
      return null;
    }
  }

  /**
   * Save the client profile to disk and memory.
   * @param {string} clientId
   * @param {object} profile
   * @private
   */
  _saveProfile(clientId, profile) {
    const clientDir = join(CLIENTS_DIR, clientId);
    mkdirSync(clientDir, { recursive: true });
    writeFileSync(join(clientDir, 'profile.json'), JSON.stringify(profile, null, 2));
    memory.set(`client:${clientId}:profile`, profile);
  }
}

const clientOnboarding = new ClientOnboarding();

export { clientOnboarding };
