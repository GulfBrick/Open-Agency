/**
 * Marcus — CFO Brain
 *
 * Extends the base AgentBrain with financial domain logic.
 * Tracks revenue, expenses, cash flow, invoices, and budgets.
 * Escalates to Nikita for spend over threshold or anomalies.
 */

import { AgentBrain } from '../../core/agent-brain.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { messageBus, MESSAGE_TYPES, PRIORITY } from '../../core/message-bus.js';
import { taskQueue } from '../../core/task-queue.js';

const AGENT_ID = 'cfo';
const AGENT_DIR = 'cfo';

/** Financial escalation triggers */
const ESCALATION_TRIGGERS = [
  'over budget', 'budget overrun', 'overspend',
  'unexpected expense', 'unplanned cost',
  'payment dispute', 'refund',
  'cash flow shortfall', 'negative balance',
  'overdue invoice', 'write-off',
  'threshold', 'approval needed',
  'anomaly', 'discrepancy', 'fraud',
];

/** Default spending threshold — escalate above this */
const DEFAULT_SPEND_THRESHOLD = 500;

class CfoBrain extends AgentBrain {
  constructor() {
    super(AGENT_ID, AGENT_DIR, {
      escalationTriggers: ESCALATION_TRIGGERS,
    });
    this._initFinancialState();
  }

  /**
   * Initialise or load financial state from memory.
   */
  _initFinancialState() {
    if (!memory.has('cfo:financials')) {
      memory.set('cfo:financials', {
        revenue: { total: 0, byClient: {} },
        expenses: { total: 0, byCategory: {}, byDepartment: {} },
        invoices: { pending: [], paid: [], overdue: [] },
        cashPosition: 0,
        budgets: {},
        spendThreshold: DEFAULT_SPEND_THRESHOLD,
      });
    }
  }

  /**
   * Get current financial state.
   * @returns {object}
   */
  getFinancials() {
    return memory.get('cfo:financials');
  }

  /**
   * Record revenue.
   * @param {string} clientId
   * @param {number} amount
   * @param {string} description
   * @returns {object} Updated revenue state
   */
  recordRevenue(clientId, amount, description) {
    const fin = this.getFinancials();
    fin.revenue.total += amount;
    fin.revenue.byClient[clientId] = (fin.revenue.byClient[clientId] || 0) + amount;
    fin.cashPosition += amount;
    memory.set('cfo:financials', fin);

    logger.log(AGENT_ID, 'REVENUE_RECORDED', { clientId, amount, description });

    return fin.revenue;
  }

  /**
   * Record an expense. Escalates if over threshold.
   * @param {string} category
   * @param {string} department
   * @param {number} amount
   * @param {string} description
   * @returns {{ recorded: boolean, escalated: boolean }}
   */
  recordExpense(category, department, amount, description) {
    const fin = this.getFinancials();

    // Check threshold
    if (amount > fin.spendThreshold) {
      messageBus.send({
        from: AGENT_ID,
        to: 'nikita',
        type: MESSAGE_TYPES.ESCALATION,
        priority: PRIORITY.HIGH,
        payload: {
          event: 'EXPENSE_OVER_THRESHOLD',
          amount,
          threshold: fin.spendThreshold,
          category,
          department,
          description,
        },
      });
      logger.log(AGENT_ID, 'EXPENSE_ESCALATED', { amount, threshold: fin.spendThreshold });
      return { recorded: false, escalated: true };
    }

    fin.expenses.total += amount;
    fin.expenses.byCategory[category] = (fin.expenses.byCategory[category] || 0) + amount;
    fin.expenses.byDepartment[department] = (fin.expenses.byDepartment[department] || 0) + amount;
    fin.cashPosition -= amount;
    memory.set('cfo:financials', fin);

    logger.log(AGENT_ID, 'EXPENSE_RECORDED', { category, department, amount, description });

    return { recorded: true, escalated: false };
  }

  /**
   * Create an invoice.
   * @param {string} clientId
   * @param {number} amount
   * @param {string} description
   * @param {string} dueDate — ISO date string
   * @returns {object} The created invoice
   */
  createInvoice(clientId, amount, description, dueDate) {
    const fin = this.getFinancials();
    const invoice = {
      id: `INV-${Date.now()}`,
      clientId,
      amount,
      description,
      dueDate,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    fin.invoices.pending.push(invoice);
    memory.set('cfo:financials', fin);

    logger.log(AGENT_ID, 'INVOICE_CREATED', { invoiceId: invoice.id, clientId, amount });

    return invoice;
  }

  /**
   * Mark an invoice as paid.
   * @param {string} invoiceId
   * @returns {object|null} The updated invoice
   */
  markInvoicePaid(invoiceId) {
    const fin = this.getFinancials();
    const idx = fin.invoices.pending.findIndex(inv => inv.id === invoiceId);
    if (idx === -1) return null;

    const invoice = fin.invoices.pending.splice(idx, 1)[0];
    invoice.status = 'paid';
    invoice.paidAt = new Date().toISOString();
    fin.invoices.paid.push(invoice);

    // Record as revenue
    this.recordRevenue(invoice.clientId, invoice.amount, `Invoice ${invoice.id} paid`);

    memory.set('cfo:financials', fin);
    logger.log(AGENT_ID, 'INVOICE_PAID', { invoiceId, amount: invoice.amount });

    return invoice;
  }

  /**
   * Check for overdue invoices and escalate.
   * @returns {object[]} Overdue invoices
   */
  checkOverdueInvoices() {
    const fin = this.getFinancials();
    const now = new Date();
    const newlyOverdue = [];

    fin.invoices.pending = fin.invoices.pending.filter(inv => {
      if (new Date(inv.dueDate) < now) {
        inv.status = 'overdue';
        fin.invoices.overdue.push(inv);
        newlyOverdue.push(inv);
        return false;
      }
      return true;
    });

    if (newlyOverdue.length > 0) {
      memory.set('cfo:financials', fin);

      messageBus.send({
        from: AGENT_ID,
        to: 'nikita',
        type: MESSAGE_TYPES.ALERT,
        priority: PRIORITY.HIGH,
        payload: {
          event: 'INVOICES_OVERDUE',
          count: newlyOverdue.length,
          invoices: newlyOverdue.map(inv => ({
            id: inv.id,
            clientId: inv.clientId,
            amount: inv.amount,
            dueDate: inv.dueDate,
          })),
        },
      });

      logger.log(AGENT_ID, 'OVERDUE_INVOICES_FLAGGED', { count: newlyOverdue.length });
    }

    return newlyOverdue;
  }

  /**
   * Set or update a department budget.
   * @param {string} department
   * @param {number} amount
   */
  setBudget(department, amount) {
    const fin = this.getFinancials();
    fin.budgets[department] = {
      allocated: amount,
      spent: fin.expenses.byDepartment[department] || 0,
      remaining: amount - (fin.expenses.byDepartment[department] || 0),
      updatedAt: new Date().toISOString(),
    };
    memory.set('cfo:financials', fin);

    logger.log(AGENT_ID, 'BUDGET_SET', { department, amount });
  }

  /**
   * Check budget utilisation and flag overruns.
   * @returns {{ department: string, allocated: number, spent: number, remaining: number, overrun: boolean }[]}
   */
  checkBudgets() {
    const fin = this.getFinancials();
    const results = [];

    for (const [dept, budget] of Object.entries(fin.budgets)) {
      const spent = fin.expenses.byDepartment[dept] || 0;
      const remaining = budget.allocated - spent;
      const overrun = remaining < 0;

      results.push({ department: dept, allocated: budget.allocated, spent, remaining, overrun });

      if (overrun) {
        messageBus.send({
          from: AGENT_ID,
          to: 'nikita',
          type: MESSAGE_TYPES.ESCALATION,
          priority: PRIORITY.HIGH,
          payload: {
            event: 'BUDGET_OVERRUN',
            department: dept,
            allocated: budget.allocated,
            spent,
            overrun: Math.abs(remaining),
          },
        });
      }
    }

    return results;
  }

  /**
   * Generate the daily financial snapshot.
   * Reads financial state, computes key metrics, formats a summary,
   * logs the action, persists a timestamped snapshot, and reports to Nikita.
   * @returns {string} Formatted financial summary
   */
  generateDailySnapshot() {
    const fin = this.getFinancials();
    const overdue = this.checkOverdueInvoices();
    const budgets = this.checkBudgets();

    // Core calculations
    const revenue = fin.revenue.total;
    const expenses = fin.expenses.total;
    const profit = revenue - expenses;
    const cashPosition = fin.cashPosition;
    const profitMargin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0.0';

    // Invoice summary
    const pendingCount = fin.invoices.pending.length;
    const overdueCount = fin.invoices.overdue.length;
    const pendingValue = fin.invoices.pending.reduce((sum, inv) => sum + inv.amount, 0);
    const overdueValue = fin.invoices.overdue.reduce((sum, inv) => sum + inv.amount, 0);

    // Budget health
    const budgetLines = budgets.map(b => {
      const pct = b.allocated > 0 ? Math.round((b.spent / b.allocated) * 100) : 0;
      const flag = b.overrun ? ' [OVERRUN]' : (pct >= 80 ? ' [WARNING]' : '');
      return `  ${b.department}: £${b.spent.toLocaleString()} / £${b.allocated.toLocaleString()} (${pct}%)${flag}`;
    });

    // Top clients by revenue
    const topClients = Object.entries(fin.revenue.byClient)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([client, amount]) => `  ${client}: £${amount.toLocaleString()}`);

    // Top expense categories
    const topExpenses = Object.entries(fin.expenses.byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat, amount]) => `  ${cat}: £${amount.toLocaleString()}`);

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const summary = [
      `DAILY FINANCIAL SNAPSHOT — ${dateStr}`,
      `${'─'.repeat(50)}`,
      ``,
      `Cash Position: £${cashPosition.toLocaleString()}`,
      `Revenue:       £${revenue.toLocaleString()}`,
      `Expenses:      £${expenses.toLocaleString()}`,
      `Net Profit:    £${profit.toLocaleString()} (${profitMargin}% margin)`,
      ``,
      `INVOICES`,
      `  Pending: ${pendingCount} (£${pendingValue.toLocaleString()})`,
      `  Overdue: ${overdueCount} (£${overdueValue.toLocaleString()})`,
    ];

    if (budgetLines.length > 0) {
      summary.push(``, `BUDGET UTILISATION`, ...budgetLines);
    }

    if (topClients.length > 0) {
      summary.push(``, `TOP CLIENTS (Revenue)`, ...topClients);
    }

    if (topExpenses.length > 0) {
      summary.push(``, `TOP EXPENSE CATEGORIES`, ...topExpenses);
    }

    // Flags / action items
    const flags = [];
    if (overdueCount > 0) flags.push(`${overdueCount} overdue invoice(s) totalling £${overdueValue.toLocaleString()} — chase immediately`);
    if (budgets.some(b => b.overrun)) flags.push(`Budget overrun detected — review spend with Nikita`);
    if (cashPosition < 0) flags.push(`Negative cash position — escalate to Nikita`);
    if (profit < 0) flags.push(`Operating at a loss — review cost structure`);

    if (flags.length > 0) {
      summary.push(``, `ACTION ITEMS`, ...flags.map(f => `  ⚠ ${f}`));
    } else {
      summary.push(``, `STATUS: All clear — financials healthy`);
    }

    summary.push(``, `— Marcus, CFO`);

    const report = summary.join('\n');

    // Log and persist
    logger.log(AGENT_ID, 'DAILY_SNAPSHOT_GENERATED', {
      revenue, expenses, profit, cashPosition, pendingCount, overdueCount,
      flagCount: flags.length,
    });

    memory.set('cfo:lastSnapshot', {
      generatedAt: now.toISOString(),
      revenue, expenses, profit, cashPosition,
      pendingInvoices: pendingCount,
      overdueInvoices: overdueCount,
      report,
    });

    this.sendReportToNikita('daily-financial-snapshot', report);
    return report;
  }

  /**
   * Process a message with financial context.
   * @param {object} message
   * @returns {Promise<object>}
   */
  async processMessage(message) {
    const fin = this.getFinancials();
    const additionalContext = [
      `Cash position: ${fin.cashPosition}`,
      `Total revenue: ${fin.revenue.total}`,
      `Total expenses: ${fin.expenses.total}`,
      `Pending invoices: ${fin.invoices.pending.length}`,
      `Overdue invoices: ${fin.invoices.overdue.length}`,
    ].join('\n');

    return super.processMessage(message, additionalContext);
  }
}

const cfoBrain = new CfoBrain();

export { cfoBrain };
