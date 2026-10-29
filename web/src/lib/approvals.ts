import type { WorkOrder } from '../api/types'
import { workOrderCount } from './payRun'

export function approvableWorkOrders(list: WorkOrder[]): WorkOrder[] {
  return list.filter((wo) => wo.status === 'Work Done').sort((a, b) => a.id - b.id)
}

export function approveButtonLabel(n: number): string {
  return `Approve ${workOrderCount(n)}`
}
