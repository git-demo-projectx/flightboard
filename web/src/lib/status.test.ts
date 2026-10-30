import { describe, expect, it } from 'vitest'
import { STATUSES } from '../api/types'
import { canAdjustPay, healthChip, statusChip } from './status'

describe('canAdjustPay', () => {
  it.each(STATUSES)('allows adjustments only on completed or approved work: %s', (status) => {
    expect(canAdjustPay(status)).toBe(status === 'Work Done' || status === 'Approved')
  })
})

describe('statusChip', () => {
  it('shows Published in green', () => {
    expect(statusChip('Published')).toMatchObject({ label: 'Published', bg: '#038350' })
  })

  it.each(['Draft', 'Assigned', 'Work Done', 'Approved', 'Paid', 'Cancelled'] as const)(
    'labels %s with its own name',
    (status) => {
      expect(statusChip(status).label).toBe(status)
    },
  )
})

describe('healthChip', () => {
  it.each(['On Track', 'Review', 'Alert'] as const)('labels %s', (health) => {
    expect(healthChip(health).label).toBe(health)
  })

  it('uses the alert colours for Alert', () => {
    expect(healthChip('Alert').bg).toBe('#F6D2BC')
  })
})
