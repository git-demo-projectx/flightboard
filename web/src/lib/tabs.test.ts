import { describe, expect, it } from 'vitest'
import { makeWorkOrder } from '../test/fixtures'
import { DEFAULT_TAB_ID, findTab, tabCounts, TABS } from './tabs'

describe('tabs', () => {
  const workOrders = [
    makeWorkOrder({ id: 1, status: 'Draft' }),
    makeWorkOrder({ id: 2, status: 'Published' }),
    makeWorkOrder({ id: 3, status: 'Routed' }),
    makeWorkOrder({ id: 4, status: 'Assigned' }),
    makeWorkOrder({ id: 5, status: 'Work Done' }),
    makeWorkOrder({ id: 6, status: 'Approved' }),
    makeWorkOrder({ id: 7, status: 'Paid' }),
    makeWorkOrder({ id: 8, status: 'Cancelled' }),
  ]

  it('counts work orders per tab', () => {
    expect(tabCounts(workOrders)).toEqual({
      'in-flight': 4,
      draft: 1,
      'published-routed': 2,
      assigned: 1,
      done: 1,
      approved: 2,
      all: 8,
    })
  })

  it('has unique tab ids', () => {
    expect(new Set(TABS.map((t) => t.id)).size).toBe(TABS.length)
  })

  it('falls back to the first tab for an unknown id', () => {
    expect(findTab('nope').id).toBe(TABS[0].id)
    expect(findTab(DEFAULT_TAB_ID).label).toBe('In-Flight')
  })
})
