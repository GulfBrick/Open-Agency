import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { logger } from '../core/logger.js';
import { memory } from '../core/memory.js';
import { taskQueue, TASK_STATUS } from '../core/task-queue.js';
import { messageBus, MESSAGE_TYPES } from '../core/message-bus.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const AGENTS_DIR = join(PROJECT_ROOT, 'agents', 'nikita');

const AGENT_ID = 'nikita';
const MODEL = 'claude-opus-4-5';

// Load Nikita's persona files
function loadPersona() {
  const soul = readFileSync(join(AGENTS_DIR, 'SOUL.md'), 'utf-8');
  const identity = readFileSync(join(AGENTS_DIR, 'IDENTITY.md'), 'utf-8');
  const instructions = readFileSync(join(AGENTS_DIR, 'CLAUDE.md'), 'utf-8');
  return { soul, identity, instructions };
}

// Escalation keywords/patterns that suggest Harry needs to be involved
const ESCALATION_TRIGGERS = [
  'spend', 'budget', 'cost', 'payment', 'invoice',
  'hire', 'fire', 'terminate', 'contract',
  'legal', 'compliance', 'liability', 'lawsuit',
  'client complaint', 'reputation', 'public',
  'not sure', 'uncertain', 'unsure', 'don\'t know',
];

class NikitaBrain {
  constructor() {
    this.client = new Anthropic();
    this.persona = loadPersona();
  }

  /**
   * Build the system prompt from Nikita's persona files.
   */
  getSystemPrompt() {
    return [
      this.persona.soul,
      '---',
      this.persona.identity,
      '---',
      this.persona.instructions,
    ].join('\n\n');
  }

  /**
   * Process an incoming message and decide what to do.
   * @param {object} message - A message bus message
   * @returns {object} Decision: { action, response, escalate, tasks }
   */
  async processMessage(message) {
    const context = this._buildContext(message);

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: this.getSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: `You have received a message. Decide what to do.\n\nContext:\n${context}\n\nMessage:\nFrom: ${message.from}\nType: ${message.type}\nPriority: ${message.priority}\nContent: ${JSON.stringify(message.payload)}\n\nRespond with a JSON object:\n{\n  "action": "respond|delegate|escalate|acknowledge",\n  "response": "your response text",\n  "escalate": true/false,\n  "escalationReason": "reason if escalating",\n  "tasks": [{ "assignTo": "agentId", "description": "task description", "priority": "HIGH|MEDIUM|LOW" }]\n}`,
        },
      ],
    });

    const responseText = response.content[0].text;
    let decision;
    try {
      // Try to parse as JSON, handle markdown code blocks
      const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      decision = JSON.parse(cleaned);
    } catch {
      decision = {
        action: 'respond',
        response: responseText,
        escalate: false,
        tasks: [],
      };
    }

    logger.log(AGENT_ID, 'DECISION_MADE', {
      messageId: message.id,
      action: decision.action,
      escalate: decision.escalate,
      taskCount: decision.tasks?.length || 0,
    });

    // Execute tasks if any
    if (decision.tasks?.length > 0) {
      for (const task of decision.tasks) {
        taskQueue.enqueue({
          assignedTo: task.assignTo,
          createdBy: AGENT_ID,
          type: message.type,
          priority: task.priority || 'MEDIUM',
          description: task.description,
        });
      }
    }

    return decision;
  }

  /**
   * Check if a message or text requires escalation to Harry.
   * @param {string} text
   * @returns {{ shouldEscalate: boolean, triggers: string[] }}
   */
  detectEscalation(text) {
    const lower = text.toLowerCase();
    const triggers = ESCALATION_TRIGGERS.filter(t => lower.includes(t));
    return {
      shouldEscalate: triggers.length > 0,
      triggers,
    };
  }

  /**
   * Generate a daily briefing from current state.
   * @returns {string} The briefing text
   */
  async generateBriefing() {
    const activeTasks = taskQueue.getAll(TASK_STATUS.IN_PROGRESS);
    const pendingTasks = taskQueue.getAll(TASK_STATUS.PENDING);
    const completedTasks = taskQueue.getAll(TASK_STATUS.COMPLETED);
    const recentLogs = logger.getRecentLogs(20);
    const state = memory.getAll();

    const briefingContext = {
      activeTasks: activeTasks.length,
      pendingTasks: pendingTasks.length,
      completedToday: completedTasks.length,
      recentActivity: recentLogs.slice(-5).map(l => `${l.agentId}: ${l.action}`),
      businessState: state,
    };

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: this.getSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: `Generate a morning briefing for Harry. Be concise, lead with what matters most.\n\nCurrent state:\n${JSON.stringify(briefingContext, null, 2)}\n\nFormat: Start with a greeting, then bullet points for key items, end with action items.`,
        },
      ],
    });

    const briefing = response.content[0].text;

    logger.log(AGENT_ID, 'BRIEFING_GENERATED', {
      activeTasks: activeTasks.length,
      pendingTasks: pendingTasks.length,
    });

    memory.set('lastBriefing', {
      text: briefing,
      generatedAt: new Date().toISOString(),
    });

    return briefing;
  }

  /**
   * Detect skill gaps — checks if an agent seems unable to handle a task type.
   * @param {string} agentId
   * @param {string} taskDescription
   * @returns {Promise<{ hasGap: boolean, gap: string|null, recommendation: string|null }>}
   */
  async detectSkillGap(agentId, taskDescription) {
    const agentTasks = taskQueue.getByAgent(agentId);
    const failedTasks = agentTasks.filter(t => t.status === TASK_STATUS.FAILED);
    const agentLogs = logger.getAgentLogs(agentId, 20);

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: 'You are analysing an agent\'s capability. Respond with JSON only.',
      messages: [
        {
          role: 'user',
          content: `Agent: ${agentId}\nNew task: ${taskDescription}\nRecent failed tasks: ${JSON.stringify(failedTasks.map(t => t.description))}\nRecent activity: ${JSON.stringify(agentLogs.slice(-5).map(l => l.action))}\n\nDoes this agent likely have a skill gap for this task?\n\n{\n  "hasGap": true/false,\n  "gap": "description of the missing skill or null",\n  "recommendation": "what skill to teach or null"\n}`,
        },
      ],
    });

    try {
      const cleaned = response.content[0].text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const result = JSON.parse(cleaned);
      if (result.hasGap) {
        logger.log(AGENT_ID, 'SKILL_GAP_DETECTED', { agentId, gap: result.gap });
      }
      return result;
    } catch {
      return { hasGap: false, gap: null, recommendation: null };
    }
  }

  /**
   * Speak text aloud using ElevenLabs TTS.
   * @param {string} text - The text to speak
   * @returns {Promise<string>} Path to the generated audio file
   */
  async speak(text) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY environment variable is not set');
    }

    const voiceId = 'pFZP5JQG7iQjIQuC4Bku';
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs TTS failed (${response.status}): ${error}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const filePath = join(tmpdir(), `nikita-${Date.now()}.mp3`);
    writeFileSync(filePath, audioBuffer);

    logger.log(AGENT_ID, 'TTS_GENERATED', { filePath, textLength: text.length });

    exec(`powershell -c "Invoke-Item '${filePath}'"`, (err) => {
      if (err) {
        logger.log(AGENT_ID, 'TTS_PLAYBACK_ERROR', { error: err.message });
      }
    });

    return filePath;
  }

  /**
   * Build context string for decision making.
   * @private
   */
  _buildContext(message) {
    const activeTasks = taskQueue.getAll(TASK_STATUS.IN_PROGRESS);
    const escalation = this.detectEscalation(
      typeof message.payload === 'string' ? message.payload : JSON.stringify(message.payload),
    );

    return [
      `Active tasks: ${activeTasks.length}`,
      `Escalation check: ${escalation.shouldEscalate ? `YES (${escalation.triggers.join(', ')})` : 'No'}`,
      `Time: ${new Date().toISOString()}`,
    ].join('\n');
  }
}

const nikitaBrain = new NikitaBrain();

export { nikitaBrain };
