import type { Expense, NewWorkOrder, Pay, PayQuote, PayRunQuote, PayRunQuoteItem, PayRunResult, Provider, Status, WorkOrder, WorkOrderWeek } from './types'

/** ApiError carries the HTTP status and the server's error message. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? res.statusText)
  }
  return body as T
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })

// Work orders and providers come from the Go API (/api).
export const api = {
  listWorkOrders: () => request<WorkOrder[]>('/api/work-orders'),
  getWorkOrder: (id: number) => request<WorkOrder>(`/api/work-orders/${id}`),
  getWeek: (start: string, providerId?: string) =>
    request<WorkOrderWeek>(
      `/api/work-orders/week?${new URLSearchParams(providerId ? { start, providerId } : { start })}`,
    ),
  createWorkOrder: (wo: NewWorkOrder) => post<WorkOrder>('/api/work-orders', wo),
  setStatus: (id: number, status: Status) =>
    post<WorkOrder>(`/api/work-orders/${id}/status`, { status }),
  payRun: (ids: number[]) => post<PayRunResult>('/api/work-orders/pay-run', { ids }),
  setTaskDone: (id: number, taskId: string, done: boolean) =>
    request<WorkOrder>(`/api/work-orders/${id}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ done }),
    }),
  listExpenses: (workOrderId: number) =>
    request<Expense[]>(`/api/work-orders/${workOrderId}/expenses`),
  addExpense: (
    workOrderId: number,
    expense: Pick<Expense, 'category' | 'description' | 'amountCents'>,
  ) => post<Expense>(`/api/work-orders/${workOrderId}/expenses`, expense),
  approveExpense: (workOrderId: number, expenseId: string) =>
    post<Expense>(`/api/work-orders/${workOrderId}/expenses/${expenseId}/approve`, {}),
  rejectExpense: (workOrderId: number, expenseId: string, reason: string) =>
    post<Expense>(`/api/work-orders/${workOrderId}/expenses/${expenseId}/reject`, { reason }),
  listProviders: () => request<Provider[]>('/api/providers'),
  nearbyProviders: (workOrderId: number) =>
    request<Provider[]>(`/api/work-orders/${workOrderId}/nearby-providers`),
}

// Pay quotes come from the PHP pay service (/pay), called directly by the web.
export const payApi = {
  quote: (pay: Pay, expenses?: Expense[]) => post<PayQuote>('/pay/quote', { ...pay, expenses }),
  quotes: (items: PayRunQuoteItem[]) => post<PayRunQuote>('/pay/quotes', { items }),
}
