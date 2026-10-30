import type { Provider, WorkOrder } from '../api/types'

export const provider: Provider = {
  id: 'p-1',
  name: 'Alex Test',
  score: 95,
  city: 'Minneapolis',
  state: 'MN',
}

/** makeWorkOrder returns a valid assigned work order; override any field. */
export function makeWorkOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: 1000001,
    title: 'Replace network switch',
    typeOfWork: 'Networking',
    status: 'Assigned',
    subStatus: 'Confirmed',
    buyer: 'Acme Test Co',
    providerId: provider.id,
    provider,
    location: { city: 'Minneapolis', state: 'MN' },
    schedule: { start: '2026-10-22T14:00:00Z', end: '2026-10-22T18:00:00Z' },
    pay: { type: 'Hourly', rate: 65, hours: 4 },
    expenseTotals: { pendingCents: 0, approvedCents: 0, rejectedCents: 0 },
    adjustmentTotals: { count: 0, bonusCents: 0, deductionCents: 0 },
    tasks: [
      { id: 't1', group: 'Prep', title: 'Set start time', done: true },
      { id: 't2', group: 'On Site', title: 'Check in', done: false },
      { id: 't3', group: 'On Site', title: 'Check out', done: false },
      { id: 't4', group: 'Post', title: 'Enter closeout notes', done: false },
    ],
    health: 'On Track',
    ...overrides,
  }
}
