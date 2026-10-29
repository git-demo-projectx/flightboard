import type { Pay } from '../api/types'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatMoney(amount: number): string {
  return money.format(amount)
}

export function formatCents(cents: number): string {
  return formatMoney(cents / 100)
}

/** formatPay renders pay terms the way the Flightboard shows them, e.g. "$65.00 / hr (4)". */
export function formatPay(pay: Pay): string {
  const rate = formatMoney(pay.rate)
  switch (pay.type) {
    case 'Fixed':
      return `${rate} fixed`
    case 'Hourly':
      return `${rate} / hr (${pay.hours ?? 0})`
    case 'PerDevice':
      return `${rate} / device (${pay.devices ?? 0})`
    case 'Blended':
      return `${rate} blended`
  }
}

export const PAY_TYPE_LABELS: Record<Pay['type'], string> = {
  Fixed: 'Fixed',
  Hourly: 'Hourly',
  PerDevice: 'Per Device',
  Blended: 'Blended',
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** formatSchedule renders a service window, e.g. "Thu, Oct 22 · 9:00 AM - 1:00 PM". */
export function formatSchedule(start: string, end: string): string {
  return `${formatDate(start)} · ${formatTime(start)} - ${formatTime(end)}`
}

/** minutesBetween returns whole minutes from a to b. */
export function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
