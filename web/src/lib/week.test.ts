import { describe, expect, it } from 'vitest'
import { addDays, dayLabel, isISODate, toISODate, weekRangeLabel, weekStart } from './week'

describe('toISODate', () => {
  it.each([
    [new Date(2026, 0, 5, 8, 0), '2026-01-05'],
    [new Date(2026, 9, 19, 0, 5), '2026-10-19'],
    [new Date(2026, 9, 25, 23, 55), '2026-10-25'],
  ])('formats the local calendar date of %s', (date, want) => {
    expect(toISODate(date)).toBe(want)
  })
})

describe('weekStart', () => {
  it.each([
    [new Date(2026, 9, 23, 12, 0), '2026-10-19'],
    [new Date(2026, 9, 19, 0, 5), '2026-10-19'],
    [new Date(2026, 9, 25, 23, 55), '2026-10-19'],
    [new Date(2026, 9, 26, 9, 0), '2026-10-26'],
    [new Date(2027, 0, 3, 23, 55), '2026-12-28'],
    [new Date(2026, 2, 8, 12, 0), '2026-03-02'],
  ])('finds the local Monday for %s', (date, want) => {
    const originalTime = date.getTime()
    expect(weekStart(date)).toBe(want)
    expect(date.getTime()).toBe(originalTime)
  })
})

describe('addDays', () => {
  it.each([
    ['2026-10-19', 7, '2026-10-26'],
    ['2026-10-19', -7, '2026-10-12'],
    ['2026-10-26', 6, '2026-11-01'],
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-12-28', 6, '2027-01-03'],
    ['2026-03-08', 1, '2026-03-09'],
    ['2026-10-19', 0, '2026-10-19'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2026-03-01', -1, '2026-02-28'],
    ['0099-12-31', 1, '0100-01-01'],
  ])('adds %s by %i days', (iso, days, want) => {
    expect(addDays(iso, days)).toBe(want)
  })
})

describe('isISODate', () => {
  it.each([
    ['2026-10-19', true],
    ['2024-02-29', true],
    ['2000-02-29', true],
    ['0000-02-29', true],
    ['0099-01-01', true],
    ['2026-02-30', false],
    ['2026-02-29', false],
    ['1900-02-29', false],
    ['2026-13-01', false],
    ['2026-00-01', false],
    ['2026-10-00', false],
    ['2026-04-31', false],
    ['10/19/2026', false],
    ['', false],
    ['2026-10-19T00:00', false],
    ['2026-1-05', false],
    ['2026-01-5', false],
    [' 2026-10-19', false],
    ['2026-10-19\n', false],
  ])('validates %s as %s', (value, want) => {
    expect(isISODate(value)).toBe(want)
  })
})

describe('dayLabel', () => {
  it.each([
    ['2026-10-19', 'Mon, Oct 19'],
    ['2026-11-01', 'Sun, Nov 1'],
  ])('labels %s', (iso, want) => {
    expect(dayLabel(iso)).toBe(want)
  })
})

describe('weekRangeLabel', () => {
  it.each([
    ['2026-10-19', 'Oct 19 - Oct 25, 2026'],
    ['2026-10-26', 'Oct 26 - Nov 1, 2026'],
    ['2026-12-28', 'Dec 28, 2026 - Jan 3, 2027'],
  ])('labels the week starting %s', (start, want) => {
    expect(weekRangeLabel(start)).toBe(want)
  })
})
