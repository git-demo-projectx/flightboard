function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function utcDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, 0, 1))
  // setUTCFullYear avoids Date.UTC's special handling of years 00 through 99.
  date.setUTCFullYear(year, month - 1, day)
  return date
}

export function toISODate(date: Date): string {
  return isoDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

export function weekStart(date: Date): string {
  return addDays(toISODate(date), -((date.getDay() + 6) % 7))
}

export function addDays(iso: string, days: number): string {
  const date = utcDate(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

export function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && addDays(value, 0) === value
}

export function dayLabel(iso: string): string {
  return utcDate(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function weekRangeLabel(start: string): string {
  const first = utcDate(start)
  const last = utcDate(addDays(start, 6))
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }
  const firstLabel = first.toLocaleDateString('en-US', {
    ...options,
    ...(first.getUTCFullYear() !== last.getUTCFullYear() ? { year: 'numeric' } : {}),
  })
  const lastLabel = last.toLocaleDateString('en-US', { ...options, year: 'numeric' })
  return `${firstLabel} - ${lastLabel}`
}
