import type { Status, WorkOrder } from '../api/types'

/** A status tab on the Flightboard. */
export interface FlightboardTab {
  id: string
  label: string
  matches: (wo: WorkOrder) => boolean
}

const hasStatus =
  (...statuses: Status[]) =>
  (wo: WorkOrder) =>
    statuses.includes(wo.status)

/** TABS lists the Flightboard tabs in display order. */
export const TABS: FlightboardTab[] = [
  {
    id: 'in-flight',
    label: 'In-Flight',
    matches: hasStatus('Published', 'Routed', 'Assigned', 'Work Done'),
  },
  { id: 'draft', label: 'Draft', matches: hasStatus('Draft') },
  { id: 'published-routed', label: 'Published/Routed', matches: hasStatus('Published', 'Routed') },
  { id: 'assigned', label: 'Assigned', matches: hasStatus('Assigned') },
  { id: 'done', label: 'Done', matches: hasStatus('Work Done') },
  { id: 'approved', label: 'Approved', matches: hasStatus('Approved', 'Paid') },
  { id: 'all', label: 'All', matches: () => true },
]

export const DEFAULT_TAB_ID = 'in-flight'

export function findTab(id: string): FlightboardTab {
  return TABS.find((t) => t.id === id) ?? TABS[0]
}

/** tabCounts returns the number of work orders in each tab, keyed by tab id. */
export function tabCounts(workOrders: WorkOrder[]): Record<string, number> {
  return Object.fromEntries(TABS.map((t) => [t.id, workOrders.filter(t.matches).length]))
}
