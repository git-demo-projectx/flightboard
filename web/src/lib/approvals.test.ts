import { describe, expect, it } from 'vitest'
import { makeWorkOrder } from '../test/fixtures'
import { approvableWorkOrders, approveButtonLabel } from './approvals'

describe('approvals', () => {
  it('approvableWorkOrders keeps Work Done work orders sorted by id', () => {
    const list = [
      makeWorkOrder({ id: 9631820, status: 'Work Done' }),
      makeWorkOrder({ id: 9631821, status: 'Approved' }),
      makeWorkOrder({ id: 9631818, status: 'Work Done' }),
      makeWorkOrder({ id: 9631810, status: 'Assigned' }),
      makeWorkOrder({ id: 9631819, status: 'Work Done' }),
    ]
    expect(approvableWorkOrders(list).map((wo) => wo.id)).toEqual([9631818, 9631819, 9631820])
    expect(list.map((wo) => wo.id)).toEqual([9631820, 9631821, 9631818, 9631810, 9631819])
  })

  it('approveButtonLabel counts work orders', () => {
    expect(approveButtonLabel(0)).toBe('Approve 0 work orders')
    expect(approveButtonLabel(1)).toBe('Approve 1 work order')
    expect(approveButtonLabel(3)).toBe('Approve 3 work orders')
  })
})
