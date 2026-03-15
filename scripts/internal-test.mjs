/**
 * Open Agency — Internal End-to-End Test
 *
 * Tests whether the agency machinery actually works:
 *   1. Client onboarding (brief → team → tasks → welcome report)
 *   2. C-Suite brain outputs (CFO, CTO, CMO daily reports)
 *   3. Task queue state
 *
 * Run: node scripts/internal-test.mjs
 */

import 'dotenv/config';
import { clientOnboarding } from '../src/core/client-onboarding.js';
import { cfoBrain } from '../src/agents/cfo/brain.js';
import { ctoBrain } from '../src/agents/cto/brain.js';
import { cmoBrain } from '../src/agents/cmo/brain.js';
import { taskQueue, TASK_STATUS } from '../src/core/task-queue.js';
import { agentRegistry } from '../src/core/agent-registry.js';

// ── Helpers ──────────────────────────────────────────────────

const results = [];

function test(name, fn) {
  try {
    const result = fn();
    results.push({ name, status: 'PASS', result });
    console.log(`  ✅ PASS — ${name}`);
    return result;
  } catch (err) {
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`  ❌ FAIL — ${name}`);
    console.log(`           ${err.message}`);
    return null;
  }
}

function divider(title) {
  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  ${title}`);
  console.log('════════════════════════════════════════════════════════════');
  console.log('');
}

// ── Register agents in the registry (needed for task executor lookups) ───

agentRegistry.register('cfo', cfoBrain);
agentRegistry.register('cto', ctoBrain);
agentRegistry.register('cmo', cmoBrain);

// ══════════════════════════════════════════════════════════════
//  TEST RUN START
// ══════════════════════════════════════════════════════════════

console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║      OPEN AGENCY — INTERNAL END-TO-END TEST             ║');
console.log('║      Testing the full agency machinery                  ║');
console.log('╚══════════════════════════════════════════════════════════╝');

// ── Step 1: Collect Client Brief ─────────────────────────────

divider('STEP 1 — Collect Client Brief');

const clientId = 'test-co';
const brief = {
  companyName: 'Test Co',
  industry: 'E-commerce',
  size: '10-50',
  website: 'https://testco.example.com',
  mainChallenges: [
    'Website is slow and needs a rebuild',
    'No social media presence',
    'Low conversion rate on the online store',
    'Need a content marketing strategy',
  ],
  goals: [
    'Increase online sales by 40% in 6 months',
    'Launch a new mobile-friendly website',
    'Build brand awareness on social media',
    'Grow customer acquisition pipeline',
  ],
  budget: { monthly: 8000, currency: 'GBP' },
  timeline: '6 months',
  currentTools: ['Shopify', 'Mailchimp', 'Google Analytics'],
  contacts: [
    { name: 'Sarah Chen', email: 'sarah@testco.com', role: 'CEO' },
    { name: 'Dave Patel', email: 'dave@testco.com', role: 'Marketing Manager' },
  ],
};

const profile = test('collectClientBrief()', () => {
  const result = clientOnboarding.collectClientBrief(clientId, brief);
  if (!result || !result.clientId) throw new Error('No profile returned');
  if (result.companyName !== 'Test Co') throw new Error(`Expected 'Test Co', got '${result.companyName}'`);
  if (result.onboardingStatus !== 'brief_collected') throw new Error(`Status should be 'brief_collected', got '${result.onboardingStatus}'`);
  console.log(`           Company: ${result.companyName}`);
  console.log(`           Industry: ${result.industry}`);
  console.log(`           Challenges: ${result.mainChallenges.length}`);
  console.log(`           Goals: ${result.goals.length}`);
  console.log(`           Budget: ${result.budget.monthly} ${result.budget.currency}/mo`);
  return result;
});

// ── Step 2: Assign Agent Team ────────────────────────────────

divider('STEP 2 — Assign Agent Team');

const team = test('assignAgentTeam()', () => {
  const result = clientOnboarding.assignAgentTeam(clientId);
  if (!result || !result.allAgents) throw new Error('No team assignment returned');
  if (result.allAgents.length === 0) throw new Error('No agents assigned');
  if (!result.coreTeam || result.coreTeam.length !== 3) throw new Error('Core team should have 3 members');
  console.log(`           Total agents: ${result.allAgents.length}`);
  console.log(`           Core team: ${result.coreTeam.map(a => a.name).join(', ')}`);
  console.log(`           Dev team: ${result.devTeam ? result.devTeam.length + ' agents' : 'NOT ASSIGNED'}`);
  console.log(`           Sales team: ${result.salesTeam ? result.salesTeam.length + ' agents' : 'NOT ASSIGNED'}`);
  console.log(`           Creative team: ${result.creativeTeam ? result.creativeTeam.length + ' agents' : 'NOT ASSIGNED'}`);
  return result;
});

// ── Step 3: Create Onboarding Tasks ──────────────────────────

divider('STEP 3 — Create Onboarding Tasks');

const tasks = test('createOnboardingTasks()', () => {
  const result = clientOnboarding.createOnboardingTasks(clientId);
  if (!result || !Array.isArray(result)) throw new Error('No tasks array returned');
  if (result.length === 0) throw new Error('No tasks created');
  console.log(`           Tasks created: ${result.length}`);
  for (const task of result) {
    const shortDesc = task.description.replace(/\[ONBOARDING\]\s*/, '').split('.')[0];
    console.log(`           [${task.priority}] ${task.assignedTo} — ${shortDesc}`);
  }
  return result;
});

// ── Step 4: Generate Welcome Report ──────────────────────────

divider('STEP 4 — Generate Welcome Report');

const welcomeReport = test('generateWelcomeReport()', () => {
  const result = clientOnboarding.generateWelcomeReport(clientId);
  if (!result || !result.report) throw new Error('No welcome report returned');
  if (!result.report.includes('Test Co')) throw new Error('Report does not mention client name');
  if (!result.report.includes('YOUR TEAM')) throw new Error('Report is missing team section');
  console.log('');
  console.log(result.report);
  return result;
});

// ── Step 5: CFO Daily Snapshot ───────────────────────────────

divider('STEP 5 — CFO Daily Snapshot');

const cfoReport = test('cfoBrain.generateDailySnapshot()', () => {
  const result = cfoBrain.generateDailySnapshot();
  if (!result || typeof result !== 'string') throw new Error('No snapshot returned');
  if (result.length < 50) throw new Error(`Snapshot too short (${result.length} chars)`);
  console.log('');
  console.log(result);
  return result;
});

// ── Step 6: CTO Daily Report ─────────────────────────────────

divider('STEP 6 — CTO Daily Report');

const ctoReport = test('ctoBrain.generateDailyReport()', () => {
  const result = ctoBrain.generateDailyReport();
  if (!result || typeof result !== 'string') throw new Error('No report returned');
  if (result.length < 50) throw new Error(`Report too short (${result.length} chars)`);
  console.log('');
  console.log(result);
  return result;
});

// ── Step 7: CMO Daily Report ─────────────────────────────────

divider('STEP 7 — CMO Daily Report');

const cmoReport = test('cmoBrain.generateDailyReport()', () => {
  const result = cmoBrain.generateDailyReport();
  if (!result || typeof result !== 'string') throw new Error('No report returned');
  if (result.length < 50) throw new Error(`Report too short (${result.length} chars)`);
  console.log('');
  console.log(result);
  return result;
});

// ── Step 8: Check Task Queue ─────────────────────────────────

divider('STEP 8 — Task Queue Status');

test('Task queue has pending tasks', () => {
  const pending = taskQueue.getAll(TASK_STATUS.PENDING);
  const inProgress = taskQueue.getAll(TASK_STATUS.IN_PROGRESS);
  const completed = taskQueue.getAll(TASK_STATUS.COMPLETED);
  const allTasks = taskQueue.getAll();

  console.log(`           Total tasks: ${allTasks.length}`);
  console.log(`           Pending: ${pending.length}`);
  console.log(`           In Progress: ${inProgress.length}`);
  console.log(`           Completed: ${completed.length}`);

  if (pending.length === 0) throw new Error('Expected pending tasks from onboarding, found none');

  console.log('');
  console.log('           Pending tasks:');
  for (const task of pending) {
    const shortDesc = task.description.replace(/\[ONBOARDING\]\s*/, '').split('.')[0];
    console.log(`             [${task.priority}] ${task.assignedTo}: ${shortDesc}`);
  }

  return { total: allTasks.length, pending: pending.length, inProgress: inProgress.length, completed: completed.length };
});

// ── Step 9: Verify agent registry ────────────────────────────

divider('STEP 9 — Agent Registry Check');

test('Agent registry has C-Suite agents', () => {
  const registered = agentRegistry.list();
  console.log(`           Registered agents: ${registered.join(', ')}`);

  if (!registered.includes('cfo')) throw new Error('CFO not registered');
  if (!registered.includes('cto')) throw new Error('CTO not registered');
  if (!registered.includes('cmo')) throw new Error('CMO not registered');

  return registered;
});

// ══════════════════════════════════════════════════════════════
//  FINAL SUMMARY
// ══════════════════════════════════════════════════════════════

divider('FINAL RESULTS');

const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
const total = results.length;

for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  const detail = r.status === 'FAIL' ? ` — ${r.error}` : '';
  console.log(`  ${icon} ${r.name}${detail}`);
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log(`  ${passed}/${total} PASSED    ${failed}/${total} FAILED`);
console.log('────────────────────────────────────────────────────────────');

if (failed === 0) {
  console.log('');
  console.log('  🟢 ALL TESTS PASSED — The agency machinery works end to end.');
  console.log('');
} else {
  console.log('');
  console.log('  🔴 SOME TESTS FAILED — See above for details.');
  console.log('');
  process.exit(1);
}
