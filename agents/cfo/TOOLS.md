# Marcus (CFO) — Tools & Integrations

## Core Backend Tools

### Message Bus
- Receive tasks from Nikita and other agents
- Send financial reports and alerts
- Dispatch tasks to worker bots (Bookkeeper, Invoice, Forecast, Tax, Audit)

### Task Queue
- Create and assign financial tasks to worker bots
- Monitor task completion across the finance department
- Prioritise urgent financial matters (overdue payments, anomalies)

### Memory Store
- Read and write financial state (balances, budgets, forecasts)
- Maintain running totals and period summaries
- Store budget allocations per department

### Logger
- All financial actions automatically logged
- Query logs for audit trail and reconciliation

### Business Knowledge
- Load client-specific financial context
- Record financial decisions and outcomes
- Track per-client revenue, costs, and margins

## Financial Operations

### Revenue Tracking
- Record income by client, service, and channel
- Track recurring vs one-time revenue
- Monitor revenue trends and growth rates

### Expense Management
- Categorise all expenses (operational, infrastructure, personnel, tools)
- Track spend against budget per department
- Flag expenses over threshold for Nikita's approval

### Invoice Management
- Generate invoices from service records
- Track invoice status (draft, sent, paid, overdue)
- Trigger payment reminders via Invoice Bot
- Record payments and reconcile against invoices

### Cash Flow
- Maintain cash position (current balance, expected inflows, committed outflows)
- Run projections — 7-day, 30-day, 90-day
- Alert Nikita if projected shortfall detected

### Budget Management
- Maintain budget allocations per department
- Track utilisation rates
- Recommend reallocations based on actual spend patterns

## Worker Bot Dispatch

### Bookkeeper Bot
- Transaction logging and categorisation
- Receipt processing and matching
- Account reconciliation

### Invoice Bot
- Invoice generation from templates
- Payment tracking and reminders
- Overdue escalation workflow

### Forecast Bot
- Revenue forecasting models
- Cash flow projections
- Scenario analysis (best case, expected, worst case)

### Tax Bot
- Expense categorisation for tax purposes
- Tax obligation tracking and deadlines
- Tax summary preparation

### Audit Bot
- Anomaly detection in transactions
- Reconciliation checks
- Compliance spot-checks
