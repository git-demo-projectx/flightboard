import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, payApi } from '../../api/client'
import { makeWorkOrder } from '../../test/fixtures'
import { renderAt } from '../../test/render'
import { WorkOrderDetailPage } from './WorkOrderDetailPage'

vi.mock('../../api/client', () => ({
  api: { getWorkOrder: vi.fn(), setTaskDone: vi.fn(), setStatus: vi.fn() },
  payApi: { quote: vi.fn() },
}))

const wo = makeWorkOrder({ id: 1000007 })

function renderDetail(id = wo.id) {
  return renderAt(<WorkOrderDetailPage />, { path: '/work-orders/:id', url: `/work-orders/${id}` })
}

beforeEach(() => {
  vi.mocked(api.getWorkOrder).mockResolvedValue(wo)
  vi.mocked(payApi.quote).mockResolvedValue({
    type: 'Hourly',
    lines: [{ label: 'Labor - Hourly pay (4 hr x $65.00)', amount: 260 }],
    total: 260,
  })
})

describe('WorkOrderDetailPage', () => {
  it.each(['Draft', 'Published', 'Routed', 'Assigned'] as const)(
    'offers Cancel work order for %s work orders',
    async (status) => {
      vi.mocked(api.getWorkOrder).mockResolvedValue(makeWorkOrder({ id: 1000007, status }))
      renderDetail()

      expect(await screen.findByRole('button', { name: 'Cancel work order' })).toBeInTheDocument()
    },
  )

  it.each(['Work Done', 'Approved', 'Paid', 'Cancelled'] as const)(
    'hides Cancel work order for %s work orders',
    async (status) => {
      vi.mocked(api.getWorkOrder).mockResolvedValue(makeWorkOrder({ id: 1000007, status }))
      renderDetail()
      await screen.findByText('WO 1000007')

      expect(screen.queryByRole('button', { name: 'Cancel work order' })).not.toBeInTheDocument()
    },
  )

  it('keeps the work order when the dialog is dismissed', async () => {
    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel work order' }))

    expect(screen.getByRole('dialog', { name: 'Cancel WO 1000007?' })).toBeInTheDocument()
    expect(screen.getByText('The work order moves to Cancelled. You cannot undo this.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep work order' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.setStatus).not.toHaveBeenCalled()
  })

  it.each(['Escape', 'outside click'])(
    'keeps the work order when the dialog is dismissed by %s',
    async (dismissal) => {
      renderDetail()
      await userEvent.click(await screen.findByRole('button', { name: 'Cancel work order' }))

      if (dismissal === 'Escape') {
        await userEvent.keyboard('{Escape}')
      } else {
        await userEvent.click(screen.getByRole('dialog').parentElement!)
      }

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(api.setStatus).not.toHaveBeenCalled()
    },
  )

  it('cancels the work order after confirmation', async () => {
    vi.mocked(api.setStatus).mockResolvedValue(makeWorkOrder({ id: 1000007, status: 'Cancelled' }))
    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel work order' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm cancel' }))

    expect(api.setStatus).toHaveBeenCalledTimes(1)
    expect(api.setStatus).toHaveBeenCalledWith(1000007, 'Cancelled')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel work order' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Check in' })).toBeDisabled()
  })

  it('shows the API error when cancelling fails', async () => {
    vi.mocked(api.setStatus).mockRejectedValue(new Error('service unavailable'))
    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel work order' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm cancel' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('service unavailable')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Assigned')).toBeInTheDocument()
  })

  it('shows the header, provider and score badge', async () => {
    renderDetail()

    expect(await screen.findByText('WO 1000007')).toBeInTheDocument()
    expect(screen.getByText('Alex Test')).toBeInTheDocument()
    expect(screen.getByText('Excellent 95')).toBeInTheDocument()
    expect(api.getWorkOrder).toHaveBeenCalledWith(1000007)
  })

  it('groups tasks Prep / On Site / Post', async () => {
    renderDetail()
    await screen.findByText('WO 1000007')

    expect(within(screen.getByRole('region', { name: 'Prep' })).getByLabelText('Set start time')).toBeChecked()
    expect(within(screen.getByRole('region', { name: 'On Site' })).getByLabelText('Check in')).not.toBeChecked()
    expect(within(screen.getByRole('region', { name: 'Post' })).getByLabelText('Enter closeout notes')).toBeInTheDocument()
  })

  it('marks a task done through the API', async () => {
    const updated = makeWorkOrder({
      id: 1000007,
      tasks: wo.tasks.map((t) => (t.id === 't2' ? { ...t, done: true } : t)),
    })
    vi.mocked(api.setTaskDone).mockResolvedValue(updated)
    renderDetail()

    await userEvent.click(await screen.findByLabelText('Check in'))

    expect(api.setTaskDone).toHaveBeenCalledWith(1000007, 't2', true)
    await waitFor(() => expect(screen.getByLabelText('Check in')).toBeChecked())
  })

  it('shows the hourly pay breakdown from the pay service', async () => {
    renderDetail()

    expect(await screen.findByText('Labor - Hourly pay (4 hr x $65.00)')).toBeInTheDocument()
    expect(screen.getByText('Total Cost').nextSibling).toHaveTextContent('$260.00')
  })

  it('offers Approve on Work Done work orders', async () => {
    vi.mocked(api.getWorkOrder).mockResolvedValue(makeWorkOrder({ id: 1000007, status: 'Work Done' }))
    vi.mocked(api.setStatus).mockResolvedValue(makeWorkOrder({ id: 1000007, status: 'Approved' }))
    renderDetail()

    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))

    expect(api.setStatus).toHaveBeenCalledWith(1000007, 'Approved')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument())
  })

  it('shows an error for a missing work order', async () => {
    vi.mocked(api.getWorkOrder).mockRejectedValue(new Error('not found'))
    renderDetail(42)

    expect(await screen.findByText(/Could not load work order 42/)).toBeInTheDocument()
  })
})
