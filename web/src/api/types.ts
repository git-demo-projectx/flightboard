// Types mirror the JSON from the Go API (api/internal/workorder) and the
// PHP pay service (pay/src/PayCalculator.php).

export const STATUSES = [
  'Draft',
  'Published',
  'Routed',
  'Assigned',
  'Work Done',
  'Approved',
  'Paid',
  'Cancelled',
] as const
export type Status = (typeof STATUSES)[number]

export const SUB_STATUSES = [
  'Start Time Set',
  'Confirmed',
  'On My Way',
  'Checked In',
  'Checked Out',
  'On Hold',
] as const
export type SubStatus = (typeof SUB_STATUSES)[number]

export type Health = 'On Track' | 'Review' | 'Alert'

export const PAY_TYPES = ['Fixed', 'Hourly', 'PerDevice', 'Blended'] as const
export type PayType = (typeof PAY_TYPES)[number]

export const TASK_GROUPS = ['Prep', 'On Site', 'Post'] as const
export type TaskGroup = (typeof TASK_GROUPS)[number]

export interface Pay {
  type: PayType
  rate: number
  hours?: number
  devices?: number
}

export type ExpenseCategory = 'Parts' | 'Mileage' | 'Tools' | 'Other'
export type ExpenseStatus = 'Pending' | 'Approved' | 'Rejected'

export interface Expense {
  id: string
  category: ExpenseCategory
  description: string
  amountCents: number
  status: ExpenseStatus
  createdAt: string
  reason?: string
}

export interface ExpenseTotals {
  pendingCents: number
  approvedCents: number
  rejectedCents: number
}

export interface Task {
  id: string
  group: TaskGroup
  title: string
  done: boolean
}

export interface Provider {
  id: string
  name: string
  score: number
  city: string
  state: string
}

export interface WorkOrder {
  id: number
  title: string
  typeOfWork: string
  status: Status
  subStatus?: SubStatus
  buyer: string
  providerId?: string
  provider: Provider | null
  location: { city: string; state: string }
  schedule?: { start: string; end: string }
  checkIn?: string
  checkOut?: string
  paidAt?: string
  pay: Pay
  expenseTotals: ExpenseTotals
  tasks: Task[]
  health: Health
}

/** One work order on the Schedule page, from GET /api/work-orders/week. */
export interface WeekWorkOrder {
  id: number
  title: string
  status: Status
  subStatus?: SubStatus
  health: Health
  start: string
  end: string
  location: { city: string; state: string }
  provider: { id: string; name: string } | null
}

export interface WeekDay {
  date: string
  total: number
  unassigned: number
  workOrders: WeekWorkOrder[]
}

/** The response of GET /api/work-orders/week. */
export interface WorkOrderWeek {
  start: string
  end: string
  total: number
  unassigned: number
  days: WeekDay[]
}

/** Body for POST /api/work-orders. */
export type NewWorkOrder = Pick<
  WorkOrder,
  'title' | 'typeOfWork' | 'buyer' | 'location' | 'pay' | 'tasks'
> & { status: 'Draft' | 'Published'; schedule?: WorkOrder['schedule'] }

export interface PayQuote {
  type: PayType
  lines: { label: string; amount: number }[]
  total: number
}

/** One work order in a POST /pay/quotes request. */
export interface PayRunQuoteItem {
  id: number
  pay: Pay
  approvedExpenseCents: number
}

/** One work order in a POST /pay/quotes response. */
export interface PayRunQuoteLine {
  id: number
  labor: number
  expenses: number
  total: number
}

/** The response of POST /pay/quotes. */
export interface PayRunQuote {
  items: PayRunQuoteLine[]
  count: number
  total: number
}

/** The response of POST /api/work-orders/pay-run. */
export interface PayRunResult {
  count: number
  paidAt: string
  workOrders: { id: number; title: string; status: Status; paidAt: string }[]
}
