import 'dotenv/config';
import { nikitaBrain } from '../src/nikita/brain.js';

const nikita = nikitaBrain;

const response = await nikita.processMessage({
  from: 'harry',
  type: 'TASK',
  priority: 'HIGH',
  payload: `Harry wants the agency dashboard redesigned. This is the first real internal project for Open Agency.

Current dashboard: src/dashboard/index.html — functional but needs to be world-class.

Harry's direction: use the agency to build it. You are the CEO — brief the team and get it done.

The dashboard should show:
- All 21 agents with live status, rank, tasks completed
- Pipeline overview (hot/warm/cold leads)
- Active sprints per client
- Financial summary
- Content calendar
- Live activity feed (agent actions in real time)
- Quick action buttons to trigger tasks

Make it premium — dark theme, glassmorphism, smooth animations, real-time data. This is the agency's shopfront.

Brief Nova on the design, Sage on the tech spec, Luna to build it, Atlas to review.`
});

console.log('\n=== NIKITA\'S RESPONSE ===\n');
console.log(response);
process.exit(0);
