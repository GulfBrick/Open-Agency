/**
 * Sprint Manager
 *
 * Manages sprint lifecycle: creation, backlog, task flow, blockers, reporting.
 * Persists sprint data to data/sprints/[clientId]/[sprintId].json.
 */

import { v4 as uuidv4 } from 'uuid';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const DATA_ROOT = join(process.cwd(), 'data', 'sprints');

const STATUS = { PLANNING: 'PLANNING', ACTIVE: 'ACTIVE', COMPLETE: 'COMPLETE' };

function createSprint(clientId, durationDays) {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + durationDays);

  return {
    id: uuidv4(),
    clientId,
    startDate: now.toISOString(),
    endDate: end.toISOString(),
    status: STATUS.PLANNING,
    backlog: [],
    inProgress: [],
    done: [],
    blockers: [],
  };
}

function sprintPath(clientId, sprintId) {
  return join(DATA_ROOT, clientId, `${sprintId}.json`);
}

async function save(sprint) {
  const dir = join(DATA_ROOT, sprint.clientId);
  await mkdir(dir, { recursive: true });
  await writeFile(sprintPath(sprint.clientId, sprint.id), JSON.stringify(sprint, null, 2));
}

async function load(clientId, sprintId) {
  const raw = await readFile(sprintPath(clientId, sprintId), 'utf-8');
  return JSON.parse(raw);
}

class SprintManager {
  async createSprint(clientId, durationDays) {
    const sprint = createSprint(clientId, durationDays);
    await save(sprint);
    return sprint;
  }

  async addToBacklog(sprintId, task) {
    const sprint = await this._load(sprintId, task.clientId ?? this._lastClientId);
    sprint.backlog.push({ id: uuidv4(), ...task, createdAt: new Date().toISOString() });
    await save(sprint);
    return sprint;
  }

  async startTask(sprintId, taskId, agentId) {
    const sprint = await this._findSprint(sprintId);
    const idx = sprint.backlog.findIndex(t => t.id === taskId);
    if (idx === -1) throw new Error(`Task ${taskId} not in backlog`);

    const [task] = sprint.backlog.splice(idx, 1);
    task.agentId = agentId;
    task.startedAt = new Date().toISOString();
    sprint.inProgress.push(task);
    sprint.status = STATUS.ACTIVE;
    await save(sprint);
    return sprint;
  }

  async completeTask(sprintId, taskId, output) {
    const sprint = await this._findSprint(sprintId);
    const idx = sprint.inProgress.findIndex(t => t.id === taskId);
    if (idx === -1) throw new Error(`Task ${taskId} not in progress`);

    const [task] = sprint.inProgress.splice(idx, 1);
    task.output = output;
    task.completedAt = new Date().toISOString();
    sprint.done.push(task);

    if (sprint.backlog.length === 0 && sprint.inProgress.length === 0) {
      sprint.status = STATUS.COMPLETE;
    }
    await save(sprint);
    return sprint;
  }

  async addBlocker(sprintId, taskId, blocker) {
    const sprint = await this._findSprint(sprintId);
    sprint.blockers.push({ taskId, blocker, createdAt: new Date().toISOString() });
    await save(sprint);
    return sprint;
  }

  async getSprintReport(sprintId) {
    const sprint = await this._findSprint(sprintId);
    return {
      id: sprint.id,
      clientId: sprint.clientId,
      status: sprint.status,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      backlogCount: sprint.backlog.length,
      inProgressCount: sprint.inProgress.length,
      doneCount: sprint.done.length,
      blockerCount: sprint.blockers.length,
      tasks: { backlog: sprint.backlog, inProgress: sprint.inProgress, done: sprint.done },
      blockers: sprint.blockers,
    };
  }

  // ─── Internal ──────────────────────────────────────────────

  /** Cache last clientId so addToBacklog can work without it. */
  _lastClientId = null;

  async _load(sprintId, clientId) {
    if (clientId) this._lastClientId = clientId;
    return load(clientId, sprintId);
  }

  async _findSprint(sprintId) {
    // Search all client dirs for the sprint file
    const { readdir } = await import('node:fs/promises');
    let clients;
    try { clients = await readdir(DATA_ROOT); } catch { return null; }

    for (const clientDir of clients) {
      try {
        const sprint = await load(clientDir, sprintId);
        this._lastClientId = sprint.clientId;
        return sprint;
      } catch { /* not in this dir */ }
    }
    throw new Error(`Sprint ${sprintId} not found`);
  }
}

const sprintManager = new SprintManager();
export { sprintManager, SprintManager, STATUS };
