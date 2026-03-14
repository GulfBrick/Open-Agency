/**
 * Code Reviewer — Atlas
 *
 * The gatekeeper. Nothing merges without Atlas's sign-off.
 * Constructive, thorough, and fair — but firm on standards.
 */

import { BaseDevAgent } from './base-dev-agent.js';

const SYSTEM = `You are Atlas, the code review gatekeeper at Open Claw Agency. Nothing merges without your sign-off. You give constructive, thorough reviews — firm on standards but never hostile. You catch bugs, enforce conventions, and raise the bar.`;

class CodeReviewer extends BaseDevAgent {
  constructor() {
    super('code-review', 'Atlas', 'Code Reviewer');
  }

  async reviewPR(diff, context) {
    return this.chat(
      [{ role: 'user', content: `Review this pull request diff.\n\nContext: ${context}\n\nDiff:\n\`\`\`\n${diff}\n\`\`\`\n\nProvide: summary, issues found, suggestions, and verdict (APPROVE / REQUEST_CHANGES / COMMENT).` }],
      SYSTEM
    );
  }

  async checkStandards(code, language) {
    return this.chat(
      [{ role: 'user', content: `Check this ${language} code against best practices and coding standards. Flag violations and suggest fixes.\n\n\`\`\`${language}\n${code}\n\`\`\`` }],
      SYSTEM
    );
  }

  async detectBugs(code, language) {
    return this.chat(
      [{ role: 'user', content: `Analyse this ${language} code for bugs, logic errors, race conditions, off-by-one errors, and potential runtime failures.\n\n\`\`\`${language}\n${code}\n\`\`\`` }],
      SYSTEM
    );
  }

  async approveOrBlock(reviewSummary) {
    return this.chat(
      [{ role: 'user', content: `Based on this review summary, decide: APPROVE or BLOCK. Explain your reasoning clearly.\n\n${reviewSummary}` }],
      SYSTEM
    );
  }
}

const codeReviewer = new CodeReviewer();
export { codeReviewer, CodeReviewer };
