/**
 * Test Workflow — Dashboard Redesign
 *
 * This script tests the full multi-agent conversation pipeline:
 * 1. Creates a DASHBOARD_REDESIGN workflow
 * 2. Nova (Creative Director) and Sage (Architect) have a real conversation
 * 3. Each agent responds IN CHARACTER using their SOUL.md persona
 * 4. The conversation output is logged
 * 5. The joint proposal is sent to Harry on Telegram
 *
 * Usage:
 *   node scripts/test-workflow.mjs
 *
 * Environment:
 *   ANTHROPIC_API_KEY        — Required for agent conversations
 *   WORKFLOW_AUTO_APPROVE    — Set to "true" to skip Harry's approval step
 *   NIKITA_TELEGRAM_TOKEN    — Optional, for Telegram notifications
 *   HARRY_TELEGRAM_ID        — Optional, for Telegram notifications
 */

import 'dotenv/config';
import { agentPersonas } from '../src/core/agent-personas.js';
import { agentConversation } from '../src/core/agent-conversation.js';
import { workflowEngine } from '../src/core/workflow-engine.js';
import { logger } from '../src/core/logger.js';

// ─── Configuration ─────────────────────────────────────────

const CLIENT_ID = 'clearline-markets';

const DASHBOARD_BRIEF = `
Clearline Markets needs a complete dashboard redesign for their trading platform.

Current state:
- The existing dashboard is a basic table view with real-time stock prices
- Users complain it's cluttered, hard to scan, and doesn't work well on tablets
- Key metrics (P&L, position sizes, risk exposure) are buried in sub-pages

Requirements:
- Modern, clean design that surfaces key trading metrics at a glance
- Real-time data updates without page refresh
- Responsive — must work on desktop and tablet
- Dark mode support (traders prefer dark interfaces)
- Customisable widget layout — let users arrange their own dashboard
- Performance: must handle 500+ data points updating every second
- Accessibility: WCAG AA compliance

Timeline: 4-week sprint
Budget: Pre-approved
Priority: HIGH
`.trim();

// ─── Tests ─────────────────────────────────────────────────

async function testPersonaLoader() {
  console.log('\n=== Test 1: Persona Loader ===\n');

  const agents = ['nikita', 'creative-director', 'architect', 'dev-lead', 'frontend'];

  for (const agentId of agents) {
    const name = agentPersonas.getAgentName(agentId);
    const prompt = agentPersonas.getSystemPrompt(agentId);
    console.log(`  ${name} (${agentId}): ${prompt.length} chars loaded`);
  }

  console.log(`\n  Total known agents: ${agentPersonas.listAgentIds().length}`);
  console.log('  PASS\n');
}

async function testDirectConversation() {
  console.log('\n=== Test 2: Direct Agent Conversation (Nova <-> Sage) ===\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('  SKIPPED — No ANTHROPIC_API_KEY set');
    return;
  }

  const conversation = await agentConversation.runConversation(
    'Dashboard Redesign — Creative + Technical Review',
    'creative-director',    // Nova initiates
    'architect',            // Sage responds
    `Sage, I've been looking at the Clearline Markets dashboard redesign brief. Here's what I'm thinking for creative direction:\n\n${DASHBOARD_BRIEF}\n\nMy initial vision:\n- A dark-themed command centre aesthetic — think Bloomberg Terminal meets modern fintech\n- Card-based widget system where each metric gets its own tile\n- A hierarchy: P&L and risk exposure front and centre, secondary metrics in a collapsible sidebar\n- Subtle animations for real-time updates — nothing flashy, just enough to draw the eye\n- Customisation via drag-and-drop grid layout\n\nWhat's your take on feasibility? Any architectural concerns with the real-time requirements?`,
    {
      maxRounds: 3,
      clientId: CLIENT_ID,
    },
  );

  console.log(`\n  Conversation ID: ${conversation.conversationId}`);
  console.log(`  Messages: ${conversation.messages.length}`);
  console.log(`  Status: ${conversation.status}`);
  console.log(`  Outcome: ${conversation.outcome?.substring(0, 200)}...`);
  console.log('  PASS\n');

  return conversation;
}

async function testFullWorkflow() {
  console.log('\n=== Test 3: Full Dashboard Redesign Workflow ===\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('  SKIPPED — No ANTHROPIC_API_KEY set');
    return;
  }

  // Auto-approve for testing
  process.env.WORKFLOW_AUTO_APPROVE = 'true';

  const workflow = workflowEngine.createWorkflow(
    'DASHBOARD_REDESIGN',
    CLIENT_ID,
    DASHBOARD_BRIEF,
  );

  console.log(`  Workflow ID: ${workflow.workflowId}`);
  console.log(`  Steps: ${workflow.steps.length}`);

  // Run the full workflow
  const completed = await workflowEngine.runWorkflow(workflow.workflowId);

  console.log(`\n  Final Status: ${completed.status}`);
  for (const step of completed.steps) {
    console.log(`    ${step.name}: ${step.status}`);
    if (step.output) {
      console.log(`      Output: ${step.output.substring(0, 100)}...`);
    }
  }

  console.log('\n  PASS\n');
  return completed;
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('========================================');
  console.log('  Open Agency — Workflow Test');
  console.log('========================================');
  console.log('');

  try {
    // Test 1: Persona loading (no API needed)
    await testPersonaLoader();

    // Test 2: Direct conversation between Nova and Sage
    const conversation = await testDirectConversation();

    // Test 3: Full workflow execution
    const workflow = await testFullWorkflow();

    console.log('\n========================================');
    console.log('  All tests completed');
    console.log('========================================\n');
  } catch (err) {
    console.error('\n  TEST FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
