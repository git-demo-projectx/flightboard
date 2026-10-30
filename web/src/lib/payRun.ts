import type { PayRunQuote, PayRunQuoteItem, WorkOrder } from '../api/types'

export function payableWorkOrders(list: WorkOrder[]): WorkOrder[] {
  return list.filter((wo) => wo.status === 'Approved').sort((a, b) => a.id - b.id)
}

export function toQuoteItems(list: WorkOrder[]): PayRunQuoteItem[] {
  return list.map((wo) => ({
    id: wo.id,
    pay: wo.pay,
    approvedExpenseCents: wo.expenseTotals.approvedCents,
    adjustmentCents: wo.adjustmentTotals.bonusCents - wo.adjustmentTotals.deductionCents,
  }))
}

export function selectedTotal(quote: PayRunQuote, selected: ReadonlySet<number>): number {
  const sum = quote.items.reduce((total, item) => total + (selected.has(item.id) ? item.total : 0), 0)
  return Math.round(sum * 100) / 100
}

export function workOrderCount(n: number): string {
  return `${n} work ${n === 1 ? 'order' : 'orders'}`
}

export function payButtonLabel(n: number): string {
  return `Pay ${workOrderCount(n)}`
}
