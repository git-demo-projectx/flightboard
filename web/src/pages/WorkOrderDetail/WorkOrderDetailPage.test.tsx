import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, payApi } from '../../api/client'
import { STATUSES, type Adjustment } from '../../api/types'
import { makeWorkOrder } from '../../test/fixtures'
import { renderAt } from '../../test/render'
import { WorkOrderDetailPage } from './WorkOrderDetailPage'

vi.mock('../../api/client', () => ({
  api: { getWorkOrder: vi.fn(), setTaskDone: vi.fn(), setStatus: vi.fn(), listAdjustments: vi.fn(), addAdjustment: vi.fn(), removeAdjustment: vi.fn() },
  payApi: { quote: vi.fn() },
}))

const wo = makeWorkOrder({ id: 1000007 })

function renderDetail(id = wo.id) {
  return renderAt(<WorkOrderDetailPage />, { path: '/work-orders/:id', url: `/work-orders/${id}` })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.listAdjustments).mockResolvedValue([])
  vi.mocked(api.getWorkOrder).mockResolvedValue(wo)
  vi.mocked(payApi.quote).mockResolvedValue({
    type: 'Hourly',
    lines: [{ label: 'Labor - Hourly pay (4 hr x $65.00)', amount: 260 }],
    total: 260,
  })
})

const bonus: Adjustment = { id: 'a1', kind: 'Bonus', reason: 'Weekend call-out', amountCents: 5000, createdAt: '2026-10-29T21:00:00Z' }
const deduction: Adjustment = { ...bonus, id: 'a2', kind: 'Deduction', reason: 'Late arrival', amountCents: 1500 }

describe('pay adjustments', () => {
  beforeEach(() => {
    vi.mocked(api.getWorkOrder).mockResolvedValue(makeWorkOrder({ id: wo.id, status: 'Work Done' }))
  })

  async function openDialog() {
    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: 'Add adjustment' }))
    return within(screen.getByRole('dialog', { name: 'Add adjustment' }))
  }

  it('shows ordered rows with kinds, reasons and signed amounts, and includes them in the quote', async () => {
    vi.mocked(api.listAdjustments).mockResolvedValue([bonus, deduction])
    vi.mocked(payApi.quote).mockResolvedValue({
      type: 'Hourly', lines: [
        { label: 'Bonus - Weekend call-out', amount: 50 },
        { label: 'Deduction - Late arrival', amount: -15 },
      ], total: 295,
    })
    renderDetail()

    expect(await screen.findByText('Weekend call-out')).toBeInTheDocument()
    expect(screen.getByText('Bonus')).toBeInTheDocument()
    expect(screen.getByText('Deduction')).toBeInTheDocument()
    expect(screen.getByText('Late arrival')).toBeInTheDocument()
    expect(screen.getByText('+$50.00')).toBeInTheDocument()
    expect(screen.getAllByText('-$15.00').length).toBeGreaterThanOrEqual(1)
    expect(api.listAdjustments).toHaveBeenCalledExactlyOnceWith(wo.id)
    await waitFor(() => expect(payApi.quote).toHaveBeenLastCalledWith(wo.pay, undefined, [bonus, deduction]))
    expect(screen.getByText('Bonus - Weekend call-out')).toBeInTheDocument()
    expect(screen.getByText('Deduction - Late arrival')).toBeInTheDocument()
    expect(screen.getByText('Total Cost').nextSibling).toHaveTextContent('$295.00')
  })

  it('shows the empty state', async () => {
    renderDetail()
    expect(await screen.findByText('No adjustments.')).toBeInTheDocument()
  })

  it('shows loading and then a warning for a load failure', async () => {
    let reject!: (error: Error) => void
    vi.mocked(api.listAdjustments).mockReturnValue(new Promise((_, fail) => { reject = fail }))
    renderDetail()
    expect(await screen.findByText('Loading adjustments...')).toBeInTheDocument()
    reject(new Error('offline'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Adjustments unavailable: offline')
  })

  it.each(STATUSES.filter((status) => status !== 'Work Done' && status !== 'Approved'))('hides mutation controls for %s', async (status) => {
    vi.mocked(api.getWorkOrder).mockResolvedValue(makeWorkOrder({ id: wo.id, status }))
    vi.mocked(api.listAdjustments).mockResolvedValue([bonus])
    renderDetail()
    await screen.findByText('Weekend call-out')
    expect(screen.queryByRole('button', { name: 'Add adjustment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove adjustment/ })).not.toBeInTheDocument()
  })

  it.each(['Work Done', 'Approved'] as const)('adds a bonus and refreshes the quote for %s', async (status) => {
    vi.mocked(api.getWorkOrder).mockResolvedValue(makeWorkOrder({ id: wo.id, status }))
    vi.mocked(api.addAdjustment).mockResolvedValue(bonus)
    const dialog = await openDialog()
    expect(dialog.getByRole('combobox', { name: 'Kind' })).toHaveTextContent('Bonus')
    await userEvent.type(dialog.getByLabelText('Reason'), '  Weekend call-out  ')
    await userEvent.type(dialog.getByLabelText('Amount ($)'), '50')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(api.addAdjustment).toHaveBeenCalledExactlyOnceWith(wo.id, { kind: 'Bonus', reason: 'Weekend call-out', amountCents: 5000 })
    expect(await screen.findByText('Weekend call-out')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(payApi.quote).toHaveBeenLastCalledWith(wo.pay, undefined, [bonus]))
  })

  it('saves a deduction with rounded cents', async () => {
    vi.mocked(api.addAdjustment).mockResolvedValue(deduction)
    const dialog = await openDialog()
    await userEvent.click(dialog.getByRole('combobox', { name: 'Kind' }))
    await userEvent.click(screen.getByRole('option', { name: 'Deduction' }))
    await userEvent.type(dialog.getByLabelText('Reason'), 'Late arrival')
    await userEvent.type(dialog.getByLabelText('Amount ($)'), '15.126')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(api.addAdjustment).toHaveBeenCalledExactlyOnceWith(wo.id, { kind: 'Deduction', reason: 'Late arrival', amountCents: 1513 })
  })

  it('validates trimmed reason length and amount boundaries before saving', async () => {
    const dialog = await openDialog()
    const reason = dialog.getByLabelText('Reason')
    const amount = dialog.getByLabelText('Amount ($)')
    const save = dialog.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    await userEvent.type(amount, '0.01')
    for (const [text, valid] of [['   ', false], ['x', true], ['x'.repeat(120), true], ['x'.repeat(121), false]] as const) {
      await userEvent.clear(reason)
      await userEvent.type(reason, text)
      expect(save).toHaveProperty('disabled', !valid)
    }
    await userEvent.clear(reason)
    await userEvent.type(reason, 'Reason')
    for (const [value, valid] of [['0', false], ['-1', false], ['0.009', false], ['0.01', true], ['1000', true], ['1000.01', false]] as const) {
      await userEvent.clear(amount)
      await userEvent.type(amount, value)
      expect(save).toHaveProperty('disabled', !valid)
    }
    expect(api.addAdjustment).not.toHaveBeenCalled()
  })

  it('keeps an add error in the open dialog', async () => {
    vi.mocked(api.addAdjustment).mockRejectedValue(new Error('Adjustment rejected'))
    const dialog = await openDialog()
    await userEvent.type(dialog.getByLabelText('Reason'), 'Weekend call-out')
    await userEvent.type(dialog.getByLabelText('Amount ($)'), '50')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('Adjustment rejected')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it.each(['Cancel', 'Escape'])('closes with %s without adding', async (method) => {
    const dialog = await openDialog()
    if (method === 'Cancel') await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    else await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.addAdjustment).not.toHaveBeenCalled()
  })

  it('removes a row and refreshes the quote', async () => {
    vi.mocked(api.listAdjustments).mockResolvedValue([bonus])
    vi.mocked(api.removeAdjustment).mockResolvedValue(undefined)
    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove adjustment Weekend call-out' }))
    expect(api.removeAdjustment).toHaveBeenCalledExactlyOnceWith(wo.id, bonus.id)
    await screen.findByText('No adjustments.')
    expect(screen.queryByText('Weekend call-out')).not.toBeInTheDocument()
    await waitFor(() => expect(payApi.quote).toHaveBeenLastCalledWith(wo.pay, undefined, []))
  })

  it('keeps the row and shows an error when removal fails', async () => {
    vi.mocked(api.listAdjustments).mockResolvedValue([bonus])
    vi.mocked(api.removeAdjustment).mockRejectedValue(new Error('Cannot remove'))
    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove adjustment Weekend call-out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot remove')
    expect(screen.getByText('Weekend call-out')).toBeInTheDocument()
  })

  it('disables adding at five adjustments', async () => {
    vi.mocked(api.listAdjustments).mockResolvedValue(Array.from({ length: 5 }, (_, index) => ({ ...bonus, id: `a${index}` })))
    renderDetail()
    expect(await screen.findByRole('button', { name: 'Add adjustment' })).toBeDisabled()
    expect(screen.getByText('A work order can have at most 5 adjustments.')).toBeInTheDocument()
  })
})

describe('WorkOrderDetailPage', () => {
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
