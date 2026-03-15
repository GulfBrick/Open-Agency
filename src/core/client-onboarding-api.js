/**
 * Client Onboarding API
 *
 * Adds onboarding endpoints to the dashboard Express server.
 *
 * Endpoints:
 *   POST /api/clients/onboard     — triggers the full onboarding flow
 *   GET  /api/clients/:id/team    — shows assigned agents
 *   GET  /api/clients/:id/status  — shows current work status
 */

import { clientOnboarding } from './client-onboarding.js';
import { logger } from './logger.js';

/**
 * Mount onboarding routes onto an Express app.
 *
 * @param {import('express').Application} app — the Express app instance
 */
function mountOnboardingRoutes(app) {

  // ─── POST /api/clients/onboard ────────────────────────────
  //
  // Triggers the full onboarding pipeline for a new client.
  //
  // Request body:
  // {
  //   clientId: string,          — unique slug (e.g. "acme-corp")
  //   companyName: string,       — required
  //   industry: string,
  //   size: string,
  //   website: string,
  //   mainChallenges: string[],
  //   goals: string[],
  //   budget: { monthly: number, currency: string },
  //   timeline: string,
  //   currentTools: string[],
  //   contacts: [{ name, email, role }]
  // }
  //
  app.post('/api/clients/onboard', (req, res) => {
    const { clientId, ...brief } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }
    if (!brief.companyName) {
      return res.status(400).json({ error: 'companyName is required' });
    }

    // Slugify the clientId: lowercase, replace spaces/special chars with hyphens
    const slug = clientId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    logger.log('dashboard', 'ONBOARDING_API_REQUEST', {
      clientId: slug,
      companyName: brief.companyName,
    });

    try {
      const result = clientOnboarding.runFullOnboarding(slug, brief);

      res.json({
        success: true,
        clientId: slug,
        companyName: brief.companyName,
        onboardingStatus: 'complete',
        teamSize: result.team.allAgents.length,
        taskCount: result.tasks.length,
        team: result.team.allAgents.map(a => ({
          agentId: a.agentId,
          name: a.name,
          role: a.role,
        })),
        tasks: result.tasks.map(t => ({
          taskId: t.id,
          assignedTo: t.assignedTo,
          priority: t.priority,
          status: t.status,
        })),
        welcomeReport: result.welcomeReport.report,
      });
    } catch (err) {
      logger.log('dashboard', 'ONBOARDING_API_ERROR', {
        clientId: slug,
        error: err.message,
      });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─── GET /api/clients/:id/team ────────────────────────────
  //
  // Returns the agent team assigned to this client.
  //
  app.get('/api/clients/:id/team', (req, res) => {
    const clientId = req.params.id;

    try {
      const team = clientOnboarding.getClientTeam(clientId);

      if (!team) {
        return res.status(404).json({
          error: `No team found for client '${clientId}'`,
        });
      }

      res.json({
        clientId,
        agents: team.allAgents?.map(a => ({
          agentId: a.agentId,
          name: a.name,
          role: a.role,
        })) || [],
        teams: {
          core: (team.coreTeam || []).map(a => a.agentId),
          dev: (team.devTeam || []).map(a => a.agentId),
          sales: (team.salesTeam || []).map(a => a.agentId),
          creative: (team.creativeTeam || []).map(a => a.agentId),
        },
      });
    } catch (err) {
      logger.log('dashboard', 'TEAM_API_ERROR', {
        clientId,
        error: err.message,
      });
      res.status(500).json({ error: err.message });
    }
  });

  // ─── GET /api/clients/:id/status ──────────────────────────
  //
  // Returns the current onboarding and work status for a client.
  //
  app.get('/api/clients/:id/status', (req, res) => {
    const clientId = req.params.id;

    try {
      const status = clientOnboarding.getOnboardingStatus(clientId);

      if (!status) {
        return res.status(404).json({
          error: `Client '${clientId}' not found`,
        });
      }

      res.json(status);
    } catch (err) {
      logger.log('dashboard', 'STATUS_API_ERROR', {
        clientId,
        error: err.message,
      });
      res.status(500).json({ error: err.message });
    }
  });

  logger.log('dashboard', 'ONBOARDING_ROUTES_MOUNTED', {
    routes: [
      'POST /api/clients/onboard',
      'GET /api/clients/:id/team',
      'GET /api/clients/:id/status',
    ],
  });
}

export { mountOnboardingRoutes };
