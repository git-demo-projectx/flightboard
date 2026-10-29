import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, payApi } from '../../api/client'
import { makeWorkOrder } from '../../test/fixtures'
import { renderAt } from '../../test/render'
import { FlightboardPage } from './FlightboardPage'

vi.mock('../../api/client', () => ({
  api: { listWorkOrders: vi.fn(), nearbyProviders: vi.fn() },
  payApi: { quote: vi.fn() },
}))

const workOrders = [
  makeWorkOrder({ id: 1000003, title: 'Fix kiosk', status: 'Assigned', health: 'Alert', checkIn: '2026-10-22T14:05:00Z' }),
  makeWorkOrder({ id: 1000002, title: 'Mount screens', status: 'Published', provider: null, health: 'Review' }),
  makeWorkOrder({ id: 1000001, title: 'Draft job', status: 'Draft', provider: null }),
]

beforeEach(() => {
  vi.mocked(api.nearbyProviders).mockReset().mockResolvedValue([])
  vi.mocked(api.listWorkOrders).mockResolvedValue(workOrders)
  vi.mocked(payApi.quote).mockResolvedValue({
    type: 'Hourly',
    lines: [{ label: 'Labor - Hourly pay (4 hr x $65.00)', amount: 260 }],
    total: 260,
  })
})

describe('FlightboardPage', () => {
  it('links to the Approvals page', async () => {
    renderAt(<FlightboardPage />)
    await screen.findByText('Fix kiosk')

    expect(screen.getByRole('link', { name: 'Approvals' })).toHaveAttribute('href', '/work-orders/approvals')
  })

  it('links to the Pay run page', async () => {
    renderAt(<FlightboardPage />)
    await screen.findByText('Fix kiosk')

    expect(screen.getByRole('link', { name: 'Pay run' })).toHaveAttribute('href', '/work-orders/pay-run')
  })

  it('shows tab counts and the In-Flight work orders by default', async () => {
    renderAt(<FlightboardPage />)

    expect(await screen.findByText('Fix kiosk')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'In-Flight (2)' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Draft (1)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'All (3)' })).toBeInTheDocument()
    expect(screen.queryByText('Draft job')).not.toBeInTheDocument()
  })

  it('switches tabs', async () => {
    renderAt(<FlightboardPage />)
    await screen.findByText('Fix kiosk')

    await userEvent.click(screen.getByRole('tab', { name: 'Draft (1)' }))

    expect(screen.getByText('Draft job')).toBeInTheDocument()
    expect(screen.queryByText('Fix kiosk')).not.toBeInTheDocument()
  })

  it('tints alert rows', async () => {
    renderAt(<FlightboardPage />)
    const row = (await screen.findByText('Fix kiosk')).closest('tr')!

    expect(row).toHaveAttribute('data-health', 'Alert')
    expect(within(row).getByText('Alert')).toBeInTheDocument()
  })

  it('filters by search text and updates counts', async () => {
    renderAt(<FlightboardPage />)
    await screen.findByText('Fix kiosk')

    await userEvent.type(screen.getByRole('textbox', { name: 'Search work orders' }), 'mount')

    expect(screen.getByRole('tab', { name: 'In-Flight (1)' })).toBeInTheDocument()
    expect(screen.queryByText('Fix kiosk')).not.toBeInTheDocument()
  })

  it('filters by type of work without regard to case and updates counts', async () => {
    vi.mocked(api.listWorkOrders).mockResolvedValue([
      makeWorkOrder({ id: 1000002, title: 'Mount projector', typeOfWork: 'Audio Visual', status: 'Assigned' }),
      makeWorkOrder({ id: 1000001, title: 'Fix kiosk', status: 'Assigned' }),
    ])
    renderAt(<FlightboardPage />)
    await screen.findByText('Mount projector')
    expect(screen.getByText('Fix kiosk')).toBeInTheDocument()

    const search = screen.getByRole('textbox', { name: 'Search work orders' })
    for (const query of ['audio', 'AUDIO', '  audio  ']) {
      await userEvent.clear(search)
      await userEvent.type(search, query)

      expect(screen.getByText('Mount projector')).toBeInTheDocument()
      expect(screen.queryByText('Fix kiosk')).not.toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'In-Flight (1)' })).toBeInTheDocument()
    }
  })

  it('opens the detail panel with check-in and total cost on row click', async () => {
    renderAt(<FlightboardPage />)
    await userEvent.click(await screen.findByText('Fix kiosk'))

    const panel = screen.getByRole('complementary', { name: 'Work order 1000003 summary' })
    expect(within(panel).getByText('Check in')).toBeInTheDocument()
    expect(within(panel).getByText('On Site')).toBeInTheDocument()
    expect(within(panel).getByText('On Time')).toBeInTheDocument()
    await waitFor(() => expect(within(panel).getByTestId('total-cost')).toHaveTextContent('$260.00'))
    expect(payApi.quote).toHaveBeenCalledWith({ type: 'Hourly', rate: 65, hours: 4 })

    await userEvent.click(within(panel).getByRole('button', { name: 'Close summary' }))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('shows an error when the API fails', async () => {
    vi.mocked(api.listWorkOrders).mockRejectedValue(new Error('boom'))
    renderAt(<FlightboardPage />)

    expect(await screen.findByText(/Could not load work orders: boom/)).toBeInTheDocument()
  })

  it('shows nearby providers only for an unassigned work order', async () => {
    renderAt(<FlightboardPage />)
    await userEvent.click(await screen.findByText('Mount screens'))

    expect(screen.getByRole('region', { name: 'Nearby providers' })).toBeInTheDocument()
    expect(api.nearbyProviders).toHaveBeenCalledWith(1000002)

    await userEvent.click(screen.getByText('Fix kiosk'))

    expect(screen.queryByRole('region', { name: 'Nearby providers' })).not.toBeInTheDocument()
    expect(api.nearbyProviders).not.toHaveBeenCalledWith(1000003)
  })
})
