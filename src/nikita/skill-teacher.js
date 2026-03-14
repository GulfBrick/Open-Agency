import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../core/logger.js';
import { messageBus, MESSAGE_TYPES } from '../core/message-bus.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const AGENTS_DIR = join(PROJECT_ROOT, 'agents');

const AGENT_ID = 'nikita';

class SkillTeacher {
  /**
   * Assess what skills an agent currently has.
   * @param {string} agentId
   * @returns {{ agentId: string, skills: object[], hasClaudeMd: boolean, hasSoul: boolean }}
   */
  assessAgentSkills(agentId) {
    const agentDir = join(AGENTS_DIR, agentId);
    const skillsDir = join(agentDir, 'skills');

    const assessment = {
      agentId,
      skills: [],
      hasClaudeMd: existsSync(join(agentDir, 'CLAUDE.md')),
      hasSoul: existsSync(join(agentDir, 'SOUL.md')),
      hasIdentity: existsSync(join(agentDir, 'IDENTITY.md')),
      hasTools: existsSync(join(agentDir, 'TOOLS.md')),
    };

    // Read existing skills
    if (existsSync(skillsDir)) {
      const files = readdirSync(skillsDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const skill = JSON.parse(readFileSync(join(skillsDir, file), 'utf-8'));
          assessment.skills.push(skill);
        } catch (err) {
          logger.log(AGENT_ID, 'SKILL_READ_ERROR', { agentId, file, error: err.message });
        }
      }
    }

    logger.log(AGENT_ID, 'AGENT_ASSESSED', {
      agentId,
      skillCount: assessment.skills.length,
    });

    return assessment;
  }

  /**
   * Identify if an agent has the skill for a given task.
   * @param {string} agentId
   * @param {string} taskDescription
   * @returns {{ hasSkill: boolean, matchedSkill: string|null, gap: string|null }}
   */
  identifyGap(agentId, taskDescription) {
    const assessment = this.assessAgentSkills(agentId);
    const taskLower = taskDescription.toLowerCase();

    // Check if any existing skill matches the task
    for (const skill of assessment.skills) {
      const nameLower = skill.name.toLowerCase();
      const descLower = (skill.description || '').toLowerCase();
      if (taskLower.includes(nameLower) || descLower.includes(taskLower)) {
        return { hasSkill: true, matchedSkill: skill.name, gap: null };
      }
    }

    // If no config files exist at all, that's a fundamental gap
    if (!assessment.hasClaudeMd) {
      return {
        hasSkill: false,
        matchedSkill: null,
        gap: `Agent ${agentId} has no CLAUDE.md — needs basic setup before skill teaching`,
      };
    }

    return {
      hasSkill: false,
      matchedSkill: null,
      gap: `Agent ${agentId} has no skill matching: ${taskDescription}`,
    };
  }

  /**
   * Teach a new skill to an agent by writing a skill file.
   * @param {string} agentId
   * @param {string} skillName
   * @param {{ description: string, instructions: string, examples?: string[] }} skillContent
   * @returns {object} The created skill object
   */
  teachSkill(agentId, skillName, skillContent) {
    const skillsDir = join(AGENTS_DIR, agentId, 'skills');
    mkdirSync(skillsDir, { recursive: true });

    const skill = {
      name: skillName,
      description: skillContent.description,
      instructions: skillContent.instructions,
      examples: skillContent.examples || [],
      createdBy: AGENT_ID,
      createdAt: new Date().toISOString(),
    };

    const fileName = skillName.toLowerCase().replace(/\s+/g, '-') + '.json';
    const filePath = join(skillsDir, fileName);

    writeFileSync(filePath, JSON.stringify(skill, null, 2));

    logger.log(AGENT_ID, 'SKILL_TAUGHT', { agentId, skillName, filePath });

    // Notify the agent via message bus
    messageBus.send({
      from: AGENT_ID,
      to: agentId,
      type: MESSAGE_TYPES.SKILL_UPDATE,
      priority: 'HIGH',
      payload: {
        action: 'NEW_SKILL',
        skillName,
        description: skillContent.description,
      },
    });

    return skill;
  }

  /**
   * Update an agent's CLAUDE.md with new capabilities.
   * @param {string} agentId
   * @param {string} additions - Text to append to their CLAUDE.md
   */
  updateAgentInstructions(agentId, additions) {
    const claudeMdPath = join(AGENTS_DIR, agentId, 'CLAUDE.md');

    // Create CLAUDE.md if it doesn't exist
    if (!existsSync(claudeMdPath)) {
      const agentDir = join(AGENTS_DIR, agentId);
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(claudeMdPath, `# ${agentId} — OpenClaw Session Instructions\n\n`);
    }

    const existing = readFileSync(claudeMdPath, 'utf-8');
    const updated = existing + '\n\n' + additions;
    writeFileSync(claudeMdPath, updated);

    logger.log(AGENT_ID, 'AGENT_INSTRUCTIONS_UPDATED', {
      agentId,
      additionsLength: additions.length,
    });

    // Notify the agent
    messageBus.send({
      from: AGENT_ID,
      to: agentId,
      type: MESSAGE_TYPES.SKILL_UPDATE,
      priority: 'HIGH',
      payload: {
        action: 'INSTRUCTIONS_UPDATED',
        summary: additions.slice(0, 100) + '...',
      },
    });
  }

  /**
   * List all skills an agent currently has.
   * @param {string} agentId
   * @returns {object[]} Array of skill objects
   */
  listAgentSkills(agentId) {
    const assessment = this.assessAgentSkills(agentId);
    return assessment.skills;
  }

  /**
   * Remove a skill from an agent.
   * @param {string} agentId
   * @param {string} skillName
   * @returns {boolean} True if removed
   */
  removeSkill(agentId, skillName) {
    const skillsDir = join(AGENTS_DIR, agentId, 'skills');
    const fileName = skillName.toLowerCase().replace(/\s+/g, '-') + '.json';
    const filePath = join(skillsDir, fileName);

    if (!existsSync(filePath)) return false;

    unlinkSync(filePath);

    logger.log(AGENT_ID, 'SKILL_REMOVED', { agentId, skillName });
    return true;
  }
}

const skillTeacher = new SkillTeacher();

export { skillTeacher };
