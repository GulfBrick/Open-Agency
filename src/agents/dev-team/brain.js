/**
 * Dev Team Lead Brain
 *
 * Extends the base AgentBrain with software development management logic.
 * Manages sprints, assigns tasks to developer bots, tracks velocity,
 * coordinates code review and QA, and reports progress to Nikita and CTO.
 *
 * This is a GENERIC dev team — client context (tech stack, codebase,
 * conventions) is injected at runtime via business knowledge.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../../core/message-bus.js';
import { taskQueue } from '../../core/task-queue.js';
import { businessKnowledge } from '../../core/business-knowledge.js';

const AGENT_ID = 'dev-lead';
const AGENT_DIR = 'dev-team/lead';
const WORKER_MODEL = 'claude-sonnet-4-5-20250929';

/** Dev team escalation triggers */
const ESCALATION_TRIGGERS = [
  'deadline', 'timeline slip', 'behind schedule', 'delayed',
  'scope change', 'scope creep', 'requirement change',
  'blocked', 'blocker', 'dependency',
  'resource constraint', 'capacity', 'overloaded',
  'architecture change', 'breaking change',
  'security vulnerability', 'security issue',
  'production bug', 'critical bug', 'hotfix',
  'quality concern', 'test failure', 'coverage drop',
];

/** Sprint status values */
const SPRINT_STATUS = {
  PLANNING: 'PLANNING',
  ACTIVE: 'ACTIVE',
  REVIEW: 'REVIEW',
  COMPLETED: 'COMPLETED',
};

/** Task status within a sprint */
const DEV_TASK_STATUS = {
  BACKLOG: 'BACKLOG',
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  IN_REVIEW: 'IN_REVIEW',
  QA: 'QA',
  DONE: 'DONE',
  BLOCKED: 'BLOCKED',
};

/** Developer bot IDs and their specialities */
const DEV_BOTS = {
  'architect': { name: 'Architect Bot', speciality: 'design', dir: 'dev-team/architect' },
  'frontend-dev': { name: 'Frontend Dev Bot', speciality: 'frontend', dir: 'dev-team/frontend' },
  'backend-dev': { name: 'Backend Dev Bot', speciality: 'backend', dir: 'dev-team/backend' },
  'fullstack-dev': { name: 'Fullstack Dev Bot', speciality: 'fullstack', dir: 'dev-team/fullstack' },
  'mobile-dev': { name: 'Mobile Dev Bot', speciality: 'mobile', dir: 'dev-team/mobile' },
  'qa': { name: 'QA Engineer Bot', speciality: 'testing', dir: 'dev-team/qa' },
  'code-review': { name: 'Code Review Bot', speciality: 'review', dir: 'dev-team/code-review' },
};

class DevLeadBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      model: WORKER_MODEL,
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initDevState();
  }

  // ─── State Management ───────────────────────────────────────

  /**
   * Initialise or load dev team state from memory.
   */
  _initDevState() {
    if (!memory.has('dev-lead:state')) {
      memory.set('dev-lead:state', {
        currentSprint: null,
        sprintHistory: [],
        backlog: [],
        activeProject: null,
        teamWorkload: this._initWorkload(),
        velocity: {
          sprints: [],
          average: 0,
        },
        standards: {
          minTestCoverage: 80,
          requiredReviews: 1,
          branchingStrategy: 'feature-branches',
        },
      });
    }
  }

  /**
   * Build initial workload tracking for all dev bots.
   * @returns {Record<string, { activeTasks: number, completedThisSprint: number, blocked: number }>}
   */
  _initWorkload() {
    const workload = {};
    for (const [botId, bot] of Object.entries(DEV_BOTS)) {
      workload[botId] = {
        name: bot.name,
        speciality: bot.speciality,
        activeTasks: 0,
        completedThisSprint: 0,
        blocked: 0,
      };
    }
    return workload;
  }

  /**
   * Get current dev team state.
   * @returns {object}
   */
  getDevState() {
    return memory.get('dev-lead:state');
  }

  // ─── Sprint Management ──────────────────────────────────────

  /**
   * Start a new sprint.
   * @param {string} name — sprint name (e.g. 'Sprint 12')
   * @param {string} clientId — which client this sprint is for
   * @param {string} startDate — ISO date
   * @param {string} endDate — ISO date
   * @param {string[]} [goals] — sprint goals
   * @returns {object} The new sprint
   */
  startSprint(name, clientId, startDate, endDate, goals = []) {
    const state = this.getDevState();

    // Close current sprint if one exists
    if (state.currentSprint && state.currentSprint.status === SPRINT_STATUS.ACTIVE) {
      this.completeSprint();
    }

    const sprint = {
      id: `SPRINT-${Date.now()}`,
      name,
      clientId,
      startDate,
      endDate,
      goals,
      status: SPRINT_STATUS.ACTIVE,
      tasks: [],
      metrics: {
        totalTasks: 0,
        completed: 0,
        blocked: 0,
        inProgress: 0,
        testCoverage: null,
        reviewsCompleted: 0,
      },
      createdAt: new Date().toISOString(),
    };

    state.currentSprint = sprint;
    state.activeProject = clientId;
    state.teamWorkload = this._initWorkload();
    memory.set('dev-lead:state', state);

    logger.log(AGENT_ID, 'SPRINT_STARTED', {
      sprintId: sprint.id,
      name,
      clientId,
      taskCount: 0,
    });

    // Notify Nikita and CTO
    messageBus.send({
      from: AGENT_ID,
      to: 'nikita',
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.MEDIUM,
      payload: {
        event: 'SPRINT_STARTED',
        sprint: { id: sprint.id, name, clientId, startDate, endDate, goals },
      },
    });

    messageBus.send({
      from: AGENT_ID,
      to: 'cto',
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.LOW,
      payload: {
        event: 'SPRINT_STARTED',
        sprint: { id: sprint.id, name, clientId, startDate, endDate, goals },
      },
    });

    return sprint;
  }

  /**
   * Complete the current sprint and record velocity.
   * @returns {object|null} The completed sprint, or null if no active sprint
   */
  completeSprint() {
    const state = this.getDevState();
    const sprint = state.currentSprint;
    if (!sprint) return null;

    sprint.status = SPRINT_STATUS.COMPLETED;
    sprint.completedAt = new Date().toISOString();

    // Calculate velocity
    const velocity = sprint.metrics.completed;
    state.velocity.sprints.push({
      sprintId: sprint.id,
      name: sprint.name,
      velocity,
      completedAt: sprint.completedAt,
    });

    // Rolling average over last 5 sprints
    const recent = state.velocity.sprints.slice(-5);
    state.velocity.average = Math.round(
      recent.reduce((sum, s) => sum + s.velocity, 0) / recent.length
    );

    state.sprintHistory.push(sprint);
    state.currentSprint = null;
    memory.set('dev-lead:state', state);

    logger.log(AGENT_ID, 'SPRINT_COMPLETED', {
      sprintId: sprint.id,
      velocity,
      avgVelocity: state.velocity.average,
    });

    // Report to Nikita
    messageBus.send({
      from: AGENT_ID,
      to: 'nikita',
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.MEDIUM,
      payload: {
        event: 'SPRINT_COMPLETED',
        sprint: {
          id: sprint.id,
          name: sprint.name,
          metrics: sprint.metrics,
          velocity,
          avgVelocity: state.velocity.average,
        },
      },
    });

    return sprint;
  }

  // ─── Task Management ────────────────────────────────────────

  /**
   * Add a task to the current sprint (or backlog if no active sprint).
   * @param {string} title
   * @param {string} description
   * @param {string} type — 'design', 'frontend', 'backend', 'fullstack', 'mobile', 'testing', 'review'
   * @param {string} priority — 'HIGH', 'MEDIUM', 'LOW'
   * @param {string} [assignTo] — bot ID to assign to, or auto-assign based on type
   * @param {{ acceptanceCriteria?: string[], estimatedHours?: number, dependsOn?: string[] }} [opts]
   * @returns {object} The created task
   */
  addTask(title, description, type, priority, assignTo, opts = {}) {
    const state = this.getDevState();

    const task = {
      id: `TASK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      description,
      type,
      priority,
      status: DEV_TASK_STATUS.TODO,
      assignedTo: assignTo || this._autoAssign(type),
      acceptanceCriteria: opts.acceptanceCriteria || [],
      estimatedHours: opts.estimatedHours || null,
      dependsOn: opts.dependsOn || [],
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      reviewedBy: null,
      testedBy: null,
    };

    if (state.currentSprint) {
      state.currentSprint.tasks.push(task);
      state.currentSprint.metrics.totalTasks++;
    } else {
      state.backlog.push(task);
    }

    // Update workload
    if (task.assignedTo && state.teamWorkload[task.assignedTo]) {
      state.teamWorkload[task.assignedTo].activeTasks++;
    }

    memory.set('dev-lead:state', state);

    // Dispatch to the task queue for the assigned bot
    taskQueue.enqueue({
      assignedTo: task.assignedTo,
      createdBy: AGENT_ID,
      type: MESSAGE_TYPES.TASK,
      priority: task.priority,
      description: `[${task.id}] ${task.title}: ${task.description}`,
    });

    logger.log(AGENT_ID, 'TASK_CREATED', {
      taskId: task.id,
      type,
      assignedTo: task.assignedTo,
      priority,
    });

    return task;
  }

  /**
   * Auto-assign a task to the most appropriate bot based on type.
   * @param {string} type
   * @returns {string} Bot ID
   */
  _autoAssign(type) {
    const typeToBot = {
      'design': 'architect',
      'frontend': 'frontend-dev',
      'backend': 'backend-dev',
      'fullstack': 'fullstack-dev',
      'mobile': 'mobile-dev',
      'testing': 'qa',
      'review': 'code-review',
    };

    const botId = typeToBot[type];
    if (botId) return botId;

    // Default: assign to fullstack as the most versatile
    return 'fullstack-dev';
  }

  /**
   * Update a task's status.
   * @param {string} taskId
   * @param {string} newStatus — a DEV_TASK_STATUS value
   * @returns {object|null} Updated task
   */
  updateTaskStatus(taskId, newStatus) {
    const state = this.getDevState();
    const sprint = state.currentSprint;
    if (!sprint) return null;

    const task = sprint.tasks.find(t => t.id === taskId);
    if (!task) return null;

    const previousStatus = task.status;
    task.status = newStatus;

    if (newStatus === DEV_TASK_STATUS.IN_PROGRESS && !task.startedAt) {
      task.startedAt = new Date().toISOString();
    }

    if (newStatus === DEV_TASK_STATUS.DONE) {
      task.completedAt = new Date().toISOString();
      sprint.metrics.completed++;

      if (task.assignedTo && state.teamWorkload[task.assignedTo]) {
        state.teamWorkload[task.assignedTo].activeTasks--;
        state.teamWorkload[task.assignedTo].completedThisSprint++;
      }
    }

    if (newStatus === DEV_TASK_STATUS.BLOCKED) {
      sprint.metrics.blocked++;
      if (task.assignedTo && state.teamWorkload[task.assignedTo]) {
        state.teamWorkload[task.assignedTo].blocked++;
      }
    }

    if (newStatus === DEV_TASK_STATUS.IN_PROGRESS) {
      sprint.metrics.inProgress++;
    }

    // Unblock: restore from blocked
    if (previousStatus === DEV_TASK_STATUS.BLOCKED && newStatus !== DEV_TASK_STATUS.BLOCKED) {
      sprint.metrics.blocked--;
      if (task.assignedTo && state.teamWorkload[task.assignedTo]) {
        state.teamWorkload[task.assignedTo].blocked--;
      }
    }

    memory.set('dev-lead:state', state);

    logger.log(AGENT_ID, 'TASK_STATUS_UPDATED', {
      taskId,
      from: previousStatus,
      to: newStatus,
    });

    // If task is blocked, alert
    if (newStatus === DEV_TASK_STATUS.BLOCKED) {
      messageBus.send({
        from: AGENT_ID,
        to: 'nikita',
        type: MESSAGE_TYPES.ALERT,
        priority: PRIORITY.MEDIUM,
        payload: {
          event: 'TASK_BLOCKED',
          taskId,
          title: task.title,
          assignedTo: task.assignedTo,
        },
      });
    }

    return task;
  }

  /**
   * Submit a task for code review.
   * @param {string} taskId
   * @returns {object|null} Updated task
   */
  submitForReview(taskId) {
    const task = this.updateTaskStatus(taskId, DEV_TASK_STATUS.IN_REVIEW);
    if (!task) return null;

    // Create a review task for Code Review Bot
    taskQueue.enqueue({
      assignedTo: 'code-review',
      createdBy: AGENT_ID,
      type: MESSAGE_TYPES.TASK,
      priority: task.priority,
      description: `Review PR for [${taskId}] ${task.title}`,
    });

    logger.log(AGENT_ID, 'TASK_SUBMITTED_FOR_REVIEW', { taskId });

    return task;
  }

  /**
   * Submit a task for QA testing.
   * @param {string} taskId
   * @returns {object|null} Updated task
   */
  submitForQA(taskId) {
    const task = this.updateTaskStatus(taskId, DEV_TASK_STATUS.QA);
    if (!task) return null;

    // Create a QA task
    taskQueue.enqueue({
      assignedTo: 'qa',
      createdBy: AGENT_ID,
      type: MESSAGE_TYPES.TASK,
      priority: task.priority,
      description: `Test [${taskId}] ${task.title}`,
    });

    logger.log(AGENT_ID, 'TASK_SUBMITTED_FOR_QA', { taskId });

    return task;
  }

  // ─── Team & Workload ────────────────────────────────────────

  /**
   * Get the current workload distribution across the team.
   * @returns {Record<string, object>}
   */
  getTeamWorkload() {
    return this.getDevState().teamWorkload;
  }

  /**
   * Find the least loaded bot for a given speciality.
   * @param {string} speciality
   * @returns {string|null} Bot ID
   */
  findLeastLoadedBot(speciality) {
    const workload = this.getTeamWorkload();
    let bestBot = null;
    let lowestLoad = Infinity;

    for (const [botId, data] of Object.entries(workload)) {
      if (data.speciality === speciality && data.activeTasks < lowestLoad) {
        bestBot = botId;
        lowestLoad = data.activeTasks;
      }
    }

    return bestBot;
  }

  // ─── Task-Callable Methods ──────────────────────────────────

  /**
   * Create a sprint for a client with a set of tasks. Returns a formatted
   * sprint plan saved to memory.
   * @param {string} clientId
   * @param {string[]|object[]} tasks — task descriptions or objects
   * @returns {string} Formatted sprint plan
   */
  createSprint(clientId, tasks = []) {
    const now = new Date();
    const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sprintName = `Sprint ${(this.getDevState().sprintHistory?.length || 0) + 1}`;

    const sprint = this.startSprint(
      sprintName,
      clientId,
      now.toISOString().slice(0, 10),
      endDate.toISOString().slice(0, 10),
      [`Deliver ${tasks.length} tasks for ${clientId}`],
    );

    const createdTasks = [];
    for (const task of tasks) {
      const title = typeof task === 'string' ? task : (task.title || task.description || 'Unnamed task');
      const type = typeof task === 'object' && task.type ? task.type : 'fullstack';
      const priority = typeof task === 'object' && task.priority ? task.priority : 'MEDIUM';

      const created = this.addTask(title, title, type, priority);
      createdTasks.push(created);
    }

    const result = [
      `SPRINT PLAN: ${sprintName}`,
      `─────────────────────────────────────`,
      `Client:     ${clientId}`,
      `Duration:   ${now.toISOString().slice(0, 10)} → ${endDate.toISOString().slice(0, 10)}`,
      `Tasks:      ${createdTasks.length}`,
      `Sprint ID:  ${sprint.id}`,
      ``,
      `TASK BREAKDOWN`,
      ...createdTasks.map((t, i) => `  ${i + 1}. [${t.priority}] ${t.title} → ${t.assignedTo}`),
      ``,
      `STATUS: Sprint active. Tasks dispatched to agents.`,
      `— Kai, Dev Lead`,
    ].join('\n');

    memory.set('dev-lead:lastSprint', {
      sprintId: sprint.id, sprintName, clientId,
      taskCount: createdTasks.length, generatedAt: now.toISOString(), report: result,
    });

    return result;
  }

  /**
   * Assign a task to a specific agent. Creates and dispatches the task.
   * @param {string} agentId — the bot to assign to
   * @param {string|object} task — task description or object
   * @returns {string} Formatted assignment confirmation
   */
  assignTask(agentId, task) {
    const title = typeof task === 'string' ? task : (task.title || task.description || 'Unnamed task');
    const type = typeof task === 'object' && task.type ? task.type : 'fullstack';
    const priority = typeof task === 'object' && task.priority ? task.priority : 'MEDIUM';

    const created = this.addTask(title, title, type, priority, agentId);

    const result = [
      `TASK ASSIGNED`,
      `─────────────────────────────────────`,
      `Task:       ${title}`,
      `Task ID:    ${created.id}`,
      `Assigned:   ${agentId}`,
      `Type:       ${type}`,
      `Priority:   ${priority}`,
      `Status:     ${created.status}`,
      ``,
      `Task dispatched to ${agentId} via task queue.`,
      `— Kai, Dev Lead`,
    ].join('\n');

    return result;
  }

  /**
   * Get the current sprint status for a client. Returns formatted progress.
   * @param {string} clientId
   * @returns {string} Formatted sprint status
   */
  getSprintStatus(clientId) {
    const progress = this.getSprintProgress();
    const state = this.getDevState();

    if (!progress) {
      return `No active sprint${clientId ? ` for ${clientId}` : ''}. Use createSprint to start one.`;
    }

    const sprint = state.currentSprint;
    const tasksByStatus = {};
    for (const task of sprint.tasks) {
      tasksByStatus[task.status] = tasksByStatus[task.status] || [];
      tasksByStatus[task.status].push(task);
    }

    const lines = [
      `SPRINT STATUS: ${progress.sprintName}`,
      `─────────────────────────────────────`,
      `Client:       ${progress.clientId}`,
      `Duration:     ${progress.startDate} → ${progress.endDate}`,
      `Progress:     ${progress.completionPercent}%`,
      ``,
      `TASK SUMMARY`,
      `  Total:       ${progress.totalTasks}`,
      `  Done:        ${progress.completed}`,
      `  In Progress: ${progress.inProgress}`,
      `  In Review:   ${progress.inReview}`,
      `  In QA:       ${progress.inQA}`,
      `  Todo:        ${progress.todo}`,
      `  Blocked:     ${progress.blocked}`,
      ``,
    ];

    for (const [status, tasks] of Object.entries(tasksByStatus)) {
      if (tasks.length > 0) {
        lines.push(`${status}:`);
        for (const t of tasks) {
          lines.push(`  • ${t.title} → ${t.assignedTo}`);
        }
      }
    }

    lines.push(``, `Velocity avg: ${state.velocity.average} tasks/sprint`, `— Kai, Dev Lead`);

    const result = lines.join('\n');

    memory.set('dev-lead:lastStatus', {
      sprintId: progress.sprintId, progress, generatedAt: new Date().toISOString(),
    });

    return result;
  }

  // ─── Reporting ──────────────────────────────────────────────

  /**
   * Get the current sprint progress summary.
   * @returns {object|null}
   */
  getSprintProgress() {
    const state = this.getDevState();
    const sprint = state.currentSprint;
    if (!sprint) return null;

    const total = sprint.metrics.totalTasks;
    const done = sprint.metrics.completed;
    const blocked = sprint.metrics.blocked;
    const inProgress = sprint.tasks.filter(t => t.status === DEV_TASK_STATUS.IN_PROGRESS).length;
    const inReview = sprint.tasks.filter(t => t.status === DEV_TASK_STATUS.IN_REVIEW).length;
    const inQA = sprint.tasks.filter(t => t.status === DEV_TASK_STATUS.QA).length;
    const todo = sprint.tasks.filter(t => t.status === DEV_TASK_STATUS.TODO).length;

    return {
      sprintId: sprint.id,
      sprintName: sprint.name,
      clientId: sprint.clientId,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      goals: sprint.goals,
      totalTasks: total,
      completed: done,
      inProgress,
      inReview,
      inQA,
      todo,
      blocked,
      completionPercent: total > 0 ? Math.round((done / total) * 100) : 0,
      testCoverage: sprint.metrics.testCoverage,
    };
  }

  /**
   * Generate the daily sprint report.
   * @returns {Promise<string>}
   */
  async generateDailyReport() {
    const progress = this.getSprintProgress();
    const state = this.getDevState();

    const report = await this.generateReport('daily-sprint-report', {
      sprintProgress: progress,
      teamWorkload: state.teamWorkload,
      velocity: state.velocity,
      blockedTasks: state.currentSprint
        ? state.currentSprint.tasks.filter(t => t.status === DEV_TASK_STATUS.BLOCKED)
        : [],
    });

    this.sendReportToNikita('daily-sprint-report', report);

    // Also send to CTO
    messageBus.send({
      from: AGENT_ID,
      to: 'cto',
      type: MESSAGE_TYPES.REPORT,
      priority: PRIORITY.LOW,
      payload: {
        reportType: 'daily-sprint-report',
        content: report,
        progress,
      },
    });

    return report;
  }

  /**
   * Process a message with dev team context.
   * @param {object} message
   * @returns {Promise<object>}
   */
  async processMessage(message) {
    const progress = this.getSprintProgress();
    const state = this.getDevState();

    const contextParts = [];

    if (progress) {
      contextParts.push(
        `Sprint: ${progress.sprintName} (${progress.completionPercent}% complete)`,
        `Tasks: ${progress.completed}/${progress.totalTasks} done, ${progress.inProgress} in progress, ${progress.blocked} blocked`,
      );
    } else {
      contextParts.push('No active sprint');
    }

    contextParts.push(`Average velocity: ${state.velocity.average} tasks/sprint`);

    // Inject client context if available
    if (state.activeProject) {
      const clientContext = businessKnowledge.getClientContext(state.activeProject);
      if (clientContext) {
        contextParts.push(`Client: ${state.activeProject}`, `Client context available: yes`);
      }
    }

    return super.processMessage(message, contextParts.join('\n'));
  }
}

const devLeadBrain = new DevLeadBrain();

export { devLeadBrain, SPRINT_STATUS, DEV_TASK_STATUS, DEV_BOTS };
