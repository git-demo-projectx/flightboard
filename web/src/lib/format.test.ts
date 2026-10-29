import { describe, expect, it } from 'vitest'
import { formatDuration, formatMoney, formatPay, minutesBetween } from './format'
import { scoreLabel } from './score'

describe('formatPay', () => {
  it.each([
    [{ type: 'Fixed', rate: 250 }, '$250.00 fixed'],
    [{ type: 'Hourly', rate: 65, hours: 4 }, '$65.00 / hr (4)'],
    [{ type: 'PerDevice', rate: 45, devices: 6 }, '$45.00 / device (6)'],
  ] as const)('formats %o', (pay, want) => {
    expect(formatPay(pay)).toBe(want)
  })
})

describe('money and time helpers', () => {
  it('formats dollars with cents and separators', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50')
  })

  it('measures minutes between two times', () => {
    expect(minutesBetween('2026-10-22T14:00:00Z', '2026-10-22T16:30:00Z')).toBe(150)
  })

  it('formats durations', () => {
    expect(formatDuration(150)).toBe('2h 30m')
    expect(formatDuration(45)).toBe('45m')
  })
})

describe('scoreLabel', () => {
  it.each([
    [97, 'Excellent'],
    [93, 'Excellent'],
    [90, 'Very good'],
    [85, 'Good'],
    [60, 'Fair'],
  ])('labels %i as %s', (score, label) => {
    expect(scoreLabel(score)).toBe(label)
  })
})
