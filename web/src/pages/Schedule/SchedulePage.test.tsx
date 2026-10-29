import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api/client'
import type { WeekWorkOrder, WorkOrderWeek } from '../../api/types'
import { addDays, dayLabel, weekStart } from '../../lib/week'
import { makeWorkOrder, provider } from '../../test/fixtures'
import { renderAt } from '../../test/render'
import { SchedulePage } from './SchedulePage'

vi.mock('../../api/client', () => ({ api: { getWeek: vi.fn(), listProviders: vi.fn() } }))

const assigned = makeWorkOrder({
  schedule: { start: '2026-10-19T14:00:00Z', end: '2026-10-19T18:00:00Z' },
})
const unassigned = makeWorkOrder({
  id: 1000002, title: 'Install desk phones', status: 'Published', provider: null,
})

function weekFixture(start = '2026-10-19'): WorkOrderWeek {
  return {
    start, end: addDays(start, 6), total: 2, unassigned: 1,
    days: Array.from({ length: 7 }, (_, index) => {
      const order = index === 0 ? assigned : index === 3 ? unassigned : null
      const workOrders: WeekWorkOrder[] = order ? [{
        ...order, start: order.schedule!.start, end: order.schedule!.end,
      }] : []
      return { date: addDays(start, index), total: workOrders.length, unassigned: index === 3 ? 1 : 0, workOrders }
    }),
  }
}

function Location() {
  return <output aria-label="Current address">{useLocation().search}</output>
}

beforeEach(() => {
  vi.mocked(api.getWeek).mockReset().mockImplementation(async (start) => weekFixture(start))
  vi.mocked(api.listProviders).mockReset().mockResolvedValue([
    { ...provider, id: 'p-101', name: 'Dana Whitfield', score: 99 },
    { ...provider, id: 'p-102', name: 'Marcus Oyelaran', score: 98 },
  ])
})

describe('SchedulePage', () => {
  it('lists providers in API order and filters the week when one is selected', async () => {
    renderAt(<><SchedulePage /><Location /></>, {
      path: '/schedule', url: '/schedule?start=2026-10-19&other=kept',
    })
    await screen.findAllByRole('region')
    const combobox = screen.getByRole('combobox', { name: 'Provider' })
    expect(combobox).toHaveTextContent('All providers')
    await userEvent.click(combobox)
    expect(screen.getAllByRole('option').map((option) => option.textContent))
      .toEqual(['All providers', 'Dana Whitfield', 'Marcus Oyelaran'])
    await userEvent.click(screen.getByRole('option', { name: 'Dana Whitfield' }))

    await waitFor(() => expect(api.getWeek).toHaveBeenLastCalledWith('2026-10-19', 'p-101'))
    expect(combobox).toHaveTextContent('Dana Whitfield')
    expect(screen.getByLabelText('Current address'))
      .toHaveTextContent('?start=2026-10-19&other=kept&providerId=p-101')

    await userEvent.click(screen.getByRole('button', { name: 'Next week' }))
    await waitFor(() => expect(api.getWeek).toHaveBeenLastCalledWith('2026-10-26', 'p-101'))
  })

  it('removes the provider filter while keeping the week and other parameters', async () => {
    renderAt(<><SchedulePage /><Location /></>, {
      path: '/schedule', url: '/schedule?start=2026-10-19&providerId=p-101&other=kept',
    })
    await screen.findAllByRole('region')
    await userEvent.click(screen.getByRole('combobox', { name: 'Provider' }))
    await userEvent.click(screen.getByRole('option', { name: 'All providers' }))

    await waitFor(() => expect(api.getWeek).toHaveBeenLastCalledWith('2026-10-19', undefined))
    expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveTextContent('All providers')
    expect(screen.getByLabelText('Current address').textContent).toBe('?start=2026-10-19&other=kept')
  })

  it('loads the provider from the address on the first request', async () => {
    renderAt(<SchedulePage />, {
      path: '/schedule', url: '/schedule?start=2026-10-19&providerId=p-102',
    })
    await screen.findAllByRole('region')

    expect(api.getWeek).toHaveBeenCalledExactlyOnceWith('2026-10-19', 'p-102')
    expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveTextContent('Marcus Oyelaran')
  })

  it.each([
    ['Next week', '2026-10-26'],
    ['Previous week', '2026-10-12'],
    ['This week', weekStart(new Date())],
  ])('keeps the selected provider when navigating with %s', async (button, start) => {
    renderAt(<><SchedulePage /><Location /></>, {
      path: '/schedule', url: '/schedule?start=2026-10-19&providerId=p-102',
    })
    await screen.findAllByRole('region')
    await userEvent.click(screen.getByRole('button', { name: button }))

    await waitFor(() => expect(api.getWeek).toHaveBeenLastCalledWith(start, 'p-102'))
    expect(screen.getByLabelText('Current address').textContent).toBe(`?start=${start}&providerId=p-102`)
    expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveTextContent('Marcus Oyelaran')
    expect(api.listProviders).toHaveBeenCalledTimes(1)
  })

  it('keeps the week visible and offers only All providers if providers fail to load', async () => {
    vi.mocked(api.listProviders).mockRejectedValue(new Error('providers unavailable'))
    renderAt(<SchedulePage />, { path: '/schedule', url: '/schedule?start=2026-10-19' })
    expect(await screen.findAllByRole('region')).toHaveLength(7)
    expect(screen.getByText(/2 work orders/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: 'Provider' }))

    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option', { name: 'All providers' })).toBeInTheDocument()
  })

  it.each([
    ['Next week', '2026-10-26', 'Oct 26 - Nov 1, 2026'],
    ['Previous week', '2026-10-12', 'Oct 12 - Oct 18, 2026'],
    ['This week', weekStart(new Date()), null],
  ])('navigates with %s and preserves other search parameters', async (button, start, label) => {
    renderAt(<><SchedulePage /><Location /></>, {
      path: '/schedule', url: '/schedule?start=2026-10-19&other=kept',
    })
    await screen.findAllByRole('region')
    await userEvent.click(screen.getByRole('button', { name: button }))

    await waitFor(() => expect(api.getWeek).toHaveBeenLastCalledWith(start, undefined))
    expect(screen.getByLabelText('Current address')).toHaveTextContent(`?start=${start}&other=kept`)
    if (label) expect(screen.getByText(label)).toBeInTheDocument()
  })

  it.each(['', '?start=soon', '?start=2026-02-30'])('defaults to this week without changing the address %s', async (search) => {
    renderAt(<><SchedulePage /><Location /></>, { path: '/schedule', url: `/schedule${search}` })
    await screen.findAllByRole('region')

    expect(api.getWeek).toHaveBeenCalledExactlyOnceWith(weekStart(new Date()), undefined)
    expect(screen.getByLabelText('Current address').textContent).toBe(search)
  })

  it('shows loading until the first request finishes', async () => {
    let resolve!: (week: WorkOrderWeek) => void
    vi.mocked(api.getWeek).mockReturnValue(new Promise((done) => { resolve = done }))
    renderAt(<SchedulePage />, { path: '/schedule', url: '/schedule?start=2026-10-19' })

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    resolve(weekFixture())
    await screen.findAllByRole('region')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows the request error', async () => {
    vi.mocked(api.getWeek).mockRejectedValue(new Error('boom'))
    renderAt(<SchedulePage />, { path: '/schedule', url: '/schedule?start=2026-10-19' })

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the schedule: boom')
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('uses the singular summary and omits zero unassigned', async () => {
    const week = weekFixture()
    week.total = 1
    week.unassigned = 0
    week.days[3] = { ...week.days[3], total: 0, unassigned: 0, workOrders: [] }
    vi.mocked(api.getWeek).mockResolvedValue(week)
    renderAt(<SchedulePage />, { path: '/schedule', url: '/schedule?start=2026-10-19' })

    expect(await screen.findByText('1 work order')).toBeInTheDocument()
    expect(screen.queryByText(/unassigned/i)).not.toBeInTheDocument()
  })

  it('shows the requested week, summary, and cards in seven day regions', async () => {
    renderAt(<SchedulePage />, { path: '/schedule', url: '/schedule?start=2026-10-19' })
    const regions = await screen.findAllByRole('region')

    expect(api.getWeek).toHaveBeenCalledExactlyOnceWith('2026-10-19', undefined)
    expect(screen.getByText('Oct 19 - Oct 25, 2026')).toBeInTheDocument()
    expect(screen.getByText(/2 work orders/)).toHaveTextContent('2 work orders \u00b7 1 unassigned')
    expect(regions.map((region) => region.getAttribute('aria-label')))
      .toEqual(Array.from({ length: 7 }, (_, index) => dayLabel(addDays('2026-10-19', index))))
    expect(screen.getAllByText('No work orders.')).toHaveLength(5)
    const monday = within(screen.getByRole('region', { name: 'Mon, Oct 19' }))
    expect(monday.getByRole('link', { name: `WO ${assigned.id} ${assigned.title}` }))
      .toHaveAttribute('href', `/work-orders/${assigned.id}`)
    expect(monday.getByText('1')).toBeInTheDocument()
    const thursday = within(screen.getByRole('region', { name: 'Thu, Oct 22' }))
    expect(thursday.getByRole('link', { name: `WO ${unassigned.id} ${unassigned.title}` })).toBeInTheDocument()
    expect(thursday.getByText('Unassigned')).toBeInTheDocument()
  })
})
