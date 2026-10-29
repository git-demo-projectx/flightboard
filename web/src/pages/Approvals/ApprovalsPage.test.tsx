import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../App'
import { api } from '../../api/client'
import type { WorkOrder } from '../../api/types'
import { formatPay, formatTime } from '../../lib/format'
import { makeWorkOrder } from '../../test/fixtures'
import { renderAt } from '../../test/render'
import { ApprovalsPage } from './ApprovalsPage'

vi.mock('../../api/client', () => ({
  api: { listWorkOrders: vi.fn(), setStatus: vi.fn() },
}))

const orders = [
  makeWorkOrder({ id: 9631820, title: 'Finished printer work', status: 'Work Done', provider: null }),
  makeWorkOrder({ id: 9631818, title: 'Finished network work', status: 'Work Done', checkOut: '2026-10-22T18:00:00Z' }),
  makeWorkOrder({ id: 9631819, title: 'Finished phone work', status: 'Work Done' }),
  makeWorkOrder({ id: 9631810, title: 'Assigned work', status: 'Assigned' }),
  makeWorkOrder({ id: 9631821, title: 'Approved work', status: 'Approved' }),
]

beforeEach(() => {
  vi.mocked(api.listWorkOrders).mockReset().mockResolvedValue(orders)
  vi.mocked(api.setStatus).mockReset().mockResolvedValue(orders[0])
})

describe('ApprovalsPage', () => {
  it('opens at the Approvals route', async () => {
    renderAt(<AppRoutes />, { path: '*', url: '/work-orders/approvals' })
    expect(screen.getByRole('heading', { name: 'Approvals' })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Work Done work orders' })).toBeInTheDocument()
  })

  it('lists Work Done work orders by id with all selected', async () => {
    renderAt(<ApprovalsPage />)
    const table = await screen.findByRole('table', { name: 'Work Done work orders' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getByRole('link').textContent)).toEqual(['9631818', '9631819', '9631820'])
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeChecked()
    expect(screen.getByRole('button', { name: 'Approve 3 work orders' })).toBeEnabled()
    expect(screen.queryByText('Assigned work')).not.toBeInTheDocument()
    expect(screen.queryByText('Approved work')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '9631818' })).toHaveAttribute('href', '/work-orders/9631818')
    expect(screen.getByRole('link', { name: 'Back to Flightboard' })).toHaveAttribute('href', '/')
    expect(screen.getByText('Work Done work orders waiting for approval.')).toBeInTheDocument()
    expect(within(rows[0]).getByText(orders[1].title)).toBeInTheDocument()
    expect(within(rows[0]).getByText(`${orders[1].typeOfWork} \u00b7 ${orders[1].buyer}`)).toBeInTheDocument()
    expect(within(rows[0]).getByText(orders[1].provider!.name)).toBeInTheDocument()
    expect(within(rows[0]).getByText(formatTime(orders[1].checkOut!))).toBeInTheDocument()
    expect(within(rows[0]).getByText(formatPay(orders[1].pay))).toBeInTheDocument()
    expect(within(rows[2]).getByText('Unassigned')).toBeInTheDocument()
    expect(within(rows[2]).getByText('--')).toBeInTheDocument()
  })

  it('updates the selection', async () => {
    renderAt(<ApprovalsPage />)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select WO 9631819' }))
    expect(screen.getByText('2 of 3 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve 2 work orders' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toHaveAttribute('data-indeterminate', 'true')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    expect(screen.getByText('3 of 3 selected')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    expect(screen.getByText('0 of 3 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve 0 work orders' })).toBeDisabled()
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).not.toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select WO 9631819' }))
    expect(screen.getByRole('button', { name: 'Approve 1 work order' })).toBeEnabled()
  })

  it('approves the selected work orders in id order', async () => {
    vi.mocked(api.listWorkOrders).mockResolvedValueOnce(orders).mockResolvedValueOnce([
      orders[2], ...orders.filter((wo) => wo.id !== 9631819).map((wo) => ({ ...wo, status: 'Approved' as const })),
    ])
    renderAt(<ApprovalsPage />)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select WO 9631819' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve 2 work orders' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Approved 2 work orders')
    expect(api.setStatus).toHaveBeenCalledTimes(2)
    expect(api.setStatus).toHaveBeenNthCalledWith(1, 9631818, 'Approved')
    expect(api.setStatus).toHaveBeenNthCalledWith(2, 9631820, 'Approved')
    expect(await screen.findByText('1 of 1 selected')).toBeInTheDocument()
    expect(api.listWorkOrders).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('checkbox', { name: 'Select WO 9631819' })).toBeChecked()
    expect(screen.queryByRole('link', { name: '9631818' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '9631820' })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Approved 2 work orders')
  })

  it('reports work orders that were not approved', async () => {
    vi.mocked(api.setStatus).mockImplementation(async (id) => {
      if (id === 9631819) throw new Error('approve or reject the pending expenses first')
      return makeWorkOrder({ id, status: 'Approved' })
    })
    vi.mocked(api.listWorkOrders).mockResolvedValueOnce(orders).mockResolvedValueOnce([orders[2]])
    renderAt(<ApprovalsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Approve 3 work orders' }))
    await screen.findByText('1 of 1 selected')
    expect(screen.getAllByRole('alert')).toHaveLength(2)
    expect(screen.getByText('Approved 2 work orders')).toBeInTheDocument()
    expect(screen.getByText('WO 9631819: approve or reject the pending expenses first').closest('[role="alert"]'))
      .toHaveTextContent('Could not approve: WO 9631819: approve or reject the pending expenses first')
    expect(vi.mocked(api.setStatus).mock.calls).toEqual([
      [9631818, 'Approved'], [9631819, 'Approved'], [9631820, 'Approved'],
    ])
    expect(api.listWorkOrders).toHaveBeenCalledTimes(2)

    let resolve!: (wo: WorkOrder) => void
    vi.mocked(api.setStatus).mockReturnValueOnce(new Promise((done) => { resolve = done }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve 1 work order' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await act(async () => resolve(makeWorkOrder({ status: 'Approved' })))
    expect(await screen.findByText('Approved 1 work order')).toBeInTheDocument()
  })

  it('disables the controls while approvals run', async () => {
    const resolvers: ((wo: WorkOrder) => void)[] = []
    vi.mocked(api.setStatus).mockImplementation(() => new Promise((done) => { resolvers.push(done) }))
    vi.mocked(api.listWorkOrders).mockResolvedValueOnce(orders).mockResolvedValueOnce([])
    renderAt(<ApprovalsPage />)
    const button = await screen.findByRole('button', { name: 'Approve 3 work orders' })
    await userEvent.click(button)
    expect(button).toBeDisabled()
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeDisabled()
    fireEvent.click(button)
    expect(api.setStatus).toHaveBeenCalledTimes(1)
    expect(api.listWorkOrders).toHaveBeenCalledTimes(1)
    for (let index = 0; index < 3; index += 1) {
      expect(api.setStatus).toHaveBeenCalledTimes(index + 1)
      await act(async () => resolvers[index](makeWorkOrder({ status: 'Approved' })))
    }
    expect(await screen.findByText('No work orders are waiting for approval.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Approved 3 work orders')
  })

  it('shows each failure in one error alert when no approvals succeed', async () => {
    vi.mocked(api.setStatus).mockRejectedValue('conflict')
    renderAt(<ApprovalsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Approve 3 work orders' }))
    await waitFor(() => expect(api.listWorkOrders).toHaveBeenCalledTimes(2))
    await screen.findByText('3 of 3 selected')
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Could not approve:')
    for (const id of [9631818, 9631819, 9631820]) {
      expect(within(alert).getByText(`WO ${id}: conflict`)).toBeInTheDocument()
    }
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeChecked()
  })

  it('shows an empty state', async () => {
    vi.mocked(api.listWorkOrders).mockResolvedValue([orders[3]])
    renderAt(<ApprovalsPage />)
    expect(await screen.findByText('No work orders are waiting for approval.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows a load error', async () => {
    vi.mocked(api.listWorkOrders).mockRejectedValue(new Error('boom'))
    renderAt(<ApprovalsPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load work orders: boom')
    expect(screen.queryByText('No work orders are waiting for approval.')).not.toBeInTheDocument()
  })

  it('shows loading progress before the list arrives', async () => {
    let resolve!: (list: WorkOrder[]) => void
    vi.mocked(api.listWorkOrders).mockReturnValue(new Promise((done) => { resolve = done }))
    renderAt(<ApprovalsPage />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByText('No work orders are waiting for approval.')).not.toBeInTheDocument()
    await act(async () => resolve(orders))
    expect(screen.getByRole('button', { name: 'Approve 3 work orders' })).toBeEnabled()
  })
})
