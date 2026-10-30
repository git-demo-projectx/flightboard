import { describe, expect, it } from 'vitest'
import { STATUSES, type PayRunQuote } from '../api/types'
import { makeWorkOrder } from '../test/fixtures'
import { payButtonLabel, payableWorkOrders, selectedTotal, toQuoteItems, workOrderCount } from './payRun'

describe('payableWorkOrders', () => {
  it('returns approved work orders by ascending id without changing the input', () => {
    const list = [
      makeWorkOrder({ id: 3, status: 'Approved' }),
      makeWorkOrder({ id: 1, status: 'Paid' }),
      makeWorkOrder({ id: 2, status: 'Approved' }),
      makeWorkOrder({ id: 4, status: 'Work Done' }),
    ]
    const original = [...list]

    expect(payableWorkOrders(list)).toEqual([list[2], list[0]])
    expect(list).toEqual(original)
  })

  it('excludes every status other than Approved', () => {
    const list = STATUSES.map((status, id) => makeWorkOrder({ id, status }))

    expect(payableWorkOrders(list)).toEqual(list.filter((wo) => wo.status === 'Approved'))
  })

  it('returns an empty list when there are no work orders', () => {
    expect(payableWorkOrders([])).toEqual([])
  })
})

describe('toQuoteItems', () => {
  it('maps pay, approved expenses and net adjustments for each work order in input order', () => {
    const list = [
      makeWorkOrder({
        id: 9631821,
        pay: { type: 'Fixed', rate: 140 },
        expenseTotals: { pendingCents: 0, approvedCents: 1800, rejectedCents: 0 },
        adjustmentTotals: { count: 2, bonusCents: 5000, deductionCents: 1500 },
      }),
      makeWorkOrder({
        id: 9631822,
        pay: { type: 'Hourly', rate: 54, hours: 4 },
        expenseTotals: { pendingCents: 500, approvedCents: 0, rejectedCents: 100 },
      }),
    ]

    expect(toQuoteItems(list)).toEqual([
      { id: 9631821, pay: { type: 'Fixed', rate: 140 }, approvedExpenseCents: 1800, adjustmentCents: 3500 },
      { id: 9631822, pay: { type: 'Hourly', rate: 54, hours: 4 }, approvedExpenseCents: 0, adjustmentCents: 0 },
    ])
  })

  it('returns an empty list when there are no work orders', () => {
    expect(toQuoteItems([])).toEqual([])
  })
})

describe('selectedTotal', () => {
  const quote: PayRunQuote = {
    items: [
      { id: 9631821, labor: 140, expenses: 0, adjustments: 0, total: 140 },
      { id: 9631822, labor: 216, expenses: 0, adjustments: 0, total: 216 },
    ],
    count: 2,
    total: 356,
  }

  it.each([
    [[9631821, 9631822], 356],
    [[9631821], 140],
    [[], 0],
    [[9999999], 0],
  ] as const)('sums only the selected ids %o', (ids, expected) => {
    const selected: ReadonlySet<number> = new Set(ids)
    expect(selectedTotal(quote, selected)).toBe(expected)
  })

  it('rounds the sum to cents', () => {
    const fractionalQuote: PayRunQuote = {
      items: [1, 2, 3].map((id) => ({ id, labor: 0.1, expenses: 0, adjustments: 0, total: 0.1 })),
      count: 3,
      total: 0.3,
    }

    expect(selectedTotal(fractionalQuote, new Set([1, 2, 3]))).toBe(0.3)
  })

  it('uses line totals including expenses', () => {
    const expenseQuote: PayRunQuote = {
      items: [{ id: 1, labor: 140, expenses: 18, adjustments: 0, total: 158 }],
      count: 1,
      total: 158,
    }

    expect(selectedTotal(expenseQuote, new Set([1]))).toBe(158)
  })

  it('returns zero for an empty quote', () => {
    expect(selectedTotal({ items: [], count: 0, total: 0 }, new Set([1]))).toBe(0)
  })
})

describe('pay run labels', () => {
  it.each([
    [0, '0 work orders', 'Pay 0 work orders'],
    [1, '1 work order', 'Pay 1 work order'],
    [2, '2 work orders', 'Pay 2 work orders'],
  ])('formats a count of %i', (n, count, label) => {
    expect(workOrderCount(n)).toBe(count)
    expect(payButtonLabel(n)).toBe(label)
  })
})
