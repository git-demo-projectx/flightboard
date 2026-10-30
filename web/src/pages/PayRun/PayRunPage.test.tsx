import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducer } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, payApi } from '../../api/client'
import * as hooks from '../../api/hooks'
import type { PayRunQuote, PayRunResult, WorkOrder } from '../../api/types'
import { formatDate } from '../../lib/format'
import { makeWorkOrder, provider } from '../../test/fixtures'
import { renderAt } from '../../test/render'
import { PayRunPage } from './PayRunPage'

vi.mock('../../api/client', () => ({
  api: { listWorkOrders: vi.fn(), payRun: vi.fn() },
  payApi: { quotes: vi.fn() },
}))

const printer = makeWorkOrder({
  id: 9631821,
  title: 'Receipt printer replacement',
  typeOfWork: 'Printer',
  buyer: 'Northwind Retail',
  status: 'Approved',
  provider: { ...provider, id: 'p-105', name: 'Keisha Abernathy' },
  schedule: { start: '2026-10-12T09:00:00-05:00', end: '2026-10-12T11:00:00-05:00' },
  pay: { type: 'Fixed', rate: 140 },
})
const phones = makeWorkOrder({
  id: 9631822,
  title: 'Desk phone moves, 12 seats',
  typeOfWork: 'Telecom/VoIP',
  buyer: 'Corvid Logistics',
  status: 'Approved',
  provider: { ...provider, id: 'p-106', name: 'Luis Carvajal' },
  schedule: { start: '2026-10-13T08:00:00-05:00', end: '2026-10-13T12:00:00-05:00' },
  pay: { type: 'PerDevice', rate: 18, devices: 12 },
})
const workDone = makeWorkOrder({ id: 9631820, title: 'Finished network work', status: 'Work Done' })
const quote: PayRunQuote = {
  items: [
    { id: printer.id, labor: 140, expenses: 0, adjustments: 0, total: 140 },
    { id: phones.id, labor: 216, expenses: 0, adjustments: 0, total: 216 },
  ],
  count: 2,
  total: 356,
}
const paidAt = '2026-10-23T12:00:00Z'
const paidResult: PayRunResult = {
  count: 2,
  paidAt,
  workOrders: [printer, phones].map(({ id, title }) => ({ id, title, status: 'Paid', paidAt })),
}

beforeEach(() => {
  vi.mocked(api.listWorkOrders).mockReset().mockResolvedValue([phones, workDone, printer])
  vi.mocked(payApi.quotes).mockReset().mockResolvedValue(quote)
  vi.mocked(api.payRun).mockReset().mockResolvedValue(paidResult)
})

describe('PayRunPage', () => {
  it('shows signed adjustments and includes them in the selected and confirmation totals', async () => {
    vi.mocked(api.listWorkOrders).mockResolvedValue([
      { ...printer, adjustmentTotals: { count: 1, bonusCents: 0, deductionCents: 1500 } },
      { ...phones, adjustmentTotals: { count: 2, bonusCents: 5000, deductionCents: 1500 } },
    ])
    vi.mocked(payApi.quotes).mockResolvedValue({
      items: [
        { ...quote.items[0], adjustments: -15, total: 125 },
        { ...quote.items[1], adjustments: 35, total: 251 },
      ],
      count: 2,
      total: 376,
    })
    renderAt(<PayRunPage />)
    await screen.findByText('$376.00')

    expect(payApi.quotes).toHaveBeenCalledExactlyOnceWith([
      { id: printer.id, pay: printer.pay, approvedExpenseCents: 0, adjustmentCents: -1500 },
      { id: phones.id, pay: phones.pay, approvedExpenseCents: 0, adjustmentCents: 3500 },
    ])
    const table = within(screen.getByRole('table', { name: 'Approved work orders' }))
    expect(table.getAllByRole('columnheader').slice(-4).map((cell) => cell.textContent))
      .toEqual(['Labor', 'Expenses', 'Adjustments', 'Total'])
    const rows = table.getAllByRole('row')
    expect(within(rows[1]).getAllByRole('cell').slice(-4).map((cell) => cell.textContent))
      .toEqual(['$140.00', '$0.00', '-$15.00', '$125.00'])
    expect(within(rows[2]).getByText('+$35.00')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: `Select WO ${phones.id}` }))
    expect(screen.queryByText('$376.00')).not.toBeInTheDocument()
    expect(screen.getAllByText('$125.00')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Pay 1 work order' }))
    expect(within(screen.getByRole('dialog')).getAllByText('$125.00')).toHaveLength(2)
    expect(payApi.quotes).toHaveBeenCalledTimes(1)
  })

  it.each([50, 51])('enforces the payment limit with %i selected work orders', async (count) => {
    const orders = Array.from({ length: count }, (_, index) => makeWorkOrder({
      id: index + 1,
      status: 'Approved',
      pay: { type: 'Fixed', rate: 1 },
    }))
    vi.mocked(api.listWorkOrders).mockResolvedValueOnce(orders).mockResolvedValueOnce([])
    vi.mocked(payApi.quotes).mockResolvedValue({
      items: orders.map(({ id }) => ({ id, labor: 1, expenses: 0, adjustments: 0, total: 1 })),
      count,
      total: count,
    })
    vi.mocked(api.payRun).mockResolvedValue({ count: 50, paidAt, workOrders: [] })
    renderAt(<PayRunPage />)
    await screen.findByText(`$${count}.00`)

    const payButton = screen.getByRole('button', { name: `Pay ${count} work orders` })
    if (count === 51) {
      expect(payButton).toBeDisabled()
      expect(screen.getByRole('alert')).toHaveTextContent('A pay run can include at most 50 work orders.')
      fireEvent.click(payButton)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(api.payRun).not.toHaveBeenCalled()
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select WO 51' }))
    }

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay 50 work orders' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Pay 50 work orders' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark as Paid' }))
    expect(api.payRun).toHaveBeenCalledExactlyOnceWith(orders.slice(0, 50).map(({ id }) => id))
    expect(await screen.findByText('No approved work orders to pay.')).toBeInTheDocument()
  })

  it('labels the pay button for the selection and disables it when no rows are selected', async () => {
    renderAt(<PayRunPage />)
    await screen.findByText('$356.00')
    expect(screen.getByRole('button', { name: 'Pay 2 work orders' })).toBeEnabled()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select WO 9631822' }))
    expect(screen.getByRole('button', { name: 'Pay 1 work order' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Pay 1 work order' }))
    const dialog = screen.getByRole('dialog', { name: 'Mark 1 work order as Paid?' })
    expect(within(dialog).getByText('WO 9631821')).toBeInTheDocument()
    expect(within(dialog).queryByText('WO 9631822')).not.toBeInTheDocument()
    expect(within(dialog).getAllByText('$140.00')).toHaveLength(2)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select WO 9631821' }))
    expect(screen.getByRole('button', { name: 'Pay 0 work orders' })).toBeDisabled()
  })

  it('shows the sorted confirmation details and cancels without paying', async () => {
    renderAt(<PayRunPage />)
    await screen.findByText('$356.00')
    await userEvent.click(screen.getByRole('button', { name: 'Pay 2 work orders' }))

    const dialog = screen.getByRole('dialog', { name: 'Mark 2 work orders as Paid?' })
    const content = within(dialog)
    expect(content.getByText('Each work order moves to Paid. You cannot undo this.')).toBeInTheDocument()
    expect(content.getAllByText(/^WO /).map((element) => element.textContent)).toEqual(['WO 9631821', 'WO 9631822'])
    expect(content.getByText(printer.title)).toBeInTheDocument()
    expect(content.getByText(phones.title)).toBeInTheDocument()
    expect(content.getByText('$140.00')).toBeInTheDocument()
    expect(content.getByText('$216.00')).toBeInTheDocument()
    expect(content.getByText('Total')).toBeInTheDocument()
    expect(content.getByText('$356.00')).toBeInTheDocument()

    await userEvent.click(content.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.payRun).not.toHaveBeenCalled()
    expect(api.listWorkOrders).toHaveBeenCalledTimes(1)
  })

  it('pays the selected ids in order, shows success, and reloads the list', async () => {
    vi.mocked(api.listWorkOrders)
      .mockResolvedValueOnce([phones, workDone, printer])
      .mockResolvedValueOnce([printer, phones].map((wo) => ({ ...wo, status: 'Paid', paidAt })))
    renderAt(<PayRunPage />)
    await screen.findByText('$356.00')
    await userEvent.click(screen.getByRole('button', { name: 'Pay 2 work orders' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark as Paid' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Paid 2 work orders \u00b7 $356.00')
    expect(api.payRun).toHaveBeenCalledExactlyOnceWith([9631821, 9631822])
    expect(await screen.findByText('No approved work orders to pay.')).toBeInTheDocument()
    expect(api.listWorkOrders).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('pays only the selected work order using its total and the returned count', async () => {
    vi.mocked(api.payRun).mockResolvedValue({ ...paidResult, count: 1, workOrders: [paidResult.workOrders[1]] })
    vi.mocked(api.listWorkOrders)
      .mockResolvedValueOnce([phones, printer])
      .mockResolvedValueOnce([printer, { ...phones, status: 'Paid', paidAt }])
    renderAt(<PayRunPage />)
    await screen.findByText('$356.00')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select WO 9631821' }))
    await userEvent.click(screen.getByRole('button', { name: 'Pay 1 work order' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark as Paid' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Paid 1 work order \u00b7 $216.00')
    expect(api.payRun).toHaveBeenCalledExactlyOnceWith([9631822])
    await waitFor(() => expect(screen.getByText('1 of 1 selected')).toBeInTheDocument())
    expect(api.listWorkOrders).toHaveBeenCalledTimes(2)
  })

  it('keeps the dialog and selection on a conflict without reloading, and allows retry', async () => {
    const message = 'conflict: work order 9631821 is Paid, not Approved'
    vi.mocked(api.payRun).mockRejectedValueOnce(new Error(message))
    renderAt(<PayRunPage />)
    await screen.findByText('$356.00')
    await userEvent.click(screen.getByRole('button', { name: 'Pay 2 work orders' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark as Paid' }))

    const dialog = screen.getByRole('dialog', { name: 'Mark 2 work orders as Paid?' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: 'Mark as Paid' })).toBeEnabled()
    expect(api.listWorkOrders).toHaveBeenCalledTimes(1)
    expect(payApi.quotes).toHaveBeenCalledTimes(1)
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument()
    expect(within(dialog).getByText('$356.00')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark as Paid' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('Paid 2 work orders \u00b7 $356.00')
    expect(api.payRun).toHaveBeenCalledTimes(2)
  })

  it('disables payment controls and prevents dismissal during the run', async () => {
    let resolve!: (value: PayRunResult) => void
    vi.mocked(api.payRun).mockReturnValue(new Promise((done) => { resolve = done }))
    renderAt(<PayRunPage />)
    await screen.findByText('$356.00')
    await userEvent.click(screen.getByRole('button', { name: 'Pay 2 work orders' }))
    const payButton = screen.getByRole('button', { name: 'Pay 2 work orders', hidden: true })
    await userEvent.click(screen.getByRole('button', { name: 'Mark as Paid' }))

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mark as Paid' })).toBeDisabled()
    expect(payButton).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Paid' }))
    expect(api.payRun).toHaveBeenCalledTimes(1)
    expect(api.listWorkOrders).toHaveBeenCalledTimes(1)

    await act(async () => resolve(paidResult))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('disables payment until the quote loads and when the quote fails', async () => {
    let reject!: (error: Error) => void
    vi.mocked(payApi.quotes).mockReturnValue(new Promise((_resolve, fail) => { reject = fail }))
    renderAt(<PayRunPage />)
    expect(await screen.findByRole('button', { name: 'Pay 2 work orders' })).toBeDisabled()

    await act(async () => reject(new Error('pay down')))
    expect(screen.getByRole('alert')).toHaveTextContent('Pay service unavailable: pay down')
    expect(screen.getByRole('button', { name: 'Pay 2 work orders' })).toBeDisabled()
    expect(api.payRun).not.toHaveBeenCalled()
  })

  it('quotes only approved work orders once and shows their totals and details', async () => {
    renderAt(<PayRunPage />)
    await screen.findByText('$356.00')

    expect(payApi.quotes).toHaveBeenCalledExactlyOnceWith([
      { id: 9631821, pay: { type: 'Fixed', rate: 140 }, approvedExpenseCents: 0, adjustmentCents: 0 },
      { id: 9631822, pay: { type: 'PerDevice', rate: 18, devices: 12 }, approvedExpenseCents: 0, adjustmentCents: 0 },
    ])
    const rows = within(screen.getByRole('table', { name: 'Approved work orders' })).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getAllByRole('cell').slice(-4).map((cell) => cell.textContent))
      .toEqual(['$140.00', '$0.00', '$0.00', '$140.00'])
    expect(within(rows[2]).getAllByRole('cell').slice(-4).map((cell) => cell.textContent))
      .toEqual(['$216.00', '$0.00', '$0.00', '$216.00'])
    expect(screen.queryByText(workDone.title)).not.toBeInTheDocument()
    expect(screen.getByText(printer.title)).toBeInTheDocument()
    expect(screen.getByText(phones.title)).toBeInTheDocument()
    expect(screen.getByText('Printer \u00b7 Northwind Retail')).toBeInTheDocument()
    expect(screen.getByText('Telecom/VoIP \u00b7 Corvid Logistics')).toBeInTheDocument()
    expect(screen.getByText('Keisha Abernathy')).toBeInTheDocument()
    expect(screen.getByText('Luis Carvajal')).toBeInTheDocument()
    expect(screen.getByText(formatDate(printer.schedule!.start))).toBeInTheDocument()
    expect(screen.getByText(formatDate(phones.schedule!.start))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '9631821' })).toHaveAttribute('href', '/work-orders/9631821')
    expect(screen.getByRole('link', { name: '9631822' })).toHaveAttribute('href', '/work-orders/9631822')
    expect(screen.getByRole('link', { name: 'Back to Flightboard' })).toHaveAttribute('href', '/')
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument()
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeChecked()
  })

  it('updates the selected total and selects or clears all rows without requoting', async () => {
    renderAt(<PayRunPage />)
    await screen.findByText('$356.00')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select WO 9631822' }))
    expect(screen.getByText('1 of 2 selected')).toBeInTheDocument()
    expect(screen.queryByText('$356.00')).not.toBeInTheDocument()
    expect(screen.getAllByText('$140.00')).toHaveLength(3)
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toHaveAttribute('data-indeterminate', 'true')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument()
    expect(screen.getByText('$356.00')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    expect(screen.getByText('0 of 2 selected')).toBeInTheDocument()
    expect(screen.getAllByText('$0.00')).toHaveLength(5)
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).not.toBeChecked()
    expect(payApi.quotes).toHaveBeenCalledTimes(1)
  })

  it('quotes 101 approved work orders in batches and combines their totals', async () => {
    const orders = Array.from({ length: 101 }, (_, index) => makeWorkOrder({
      id: index + 1,
      status: 'Approved',
      pay: { type: 'Fixed', rate: 1 },
      expenseTotals: { pendingCents: 0, approvedCents: 25, rejectedCents: 0 },
    }))
    vi.mocked(api.listWorkOrders).mockResolvedValue(orders)
    vi.mocked(payApi.quotes).mockImplementation(async (items) => {
      if (items.length > 100) throw new Error('Batch too large')
      return {
        items: items.map(({ id }) => ({ id, labor: 1, expenses: 0.25, adjustments: 0, total: 1.25 })),
        count: items.length,
        total: items.length * 1.25,
      }
    })
    renderAt(<PayRunPage />)
    await screen.findByText('$126.25')

    const batches = vi.mocked(payApi.quotes).mock.calls.map(([items]) => items)
    expect(batches.map((items) => items.length)).toEqual([100, 1])
    expect(batches.flat().map((item) => item.id)).toEqual(orders.map((wo) => wo.id))
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows).toHaveLength(102)
    for (const row of rows.slice(1)) {
      expect(within(row).getAllByRole('cell').slice(-4).map((cell) => cell.textContent))
        .toEqual(['$1.00', '$0.25', '$0.00', '$1.25'])
    }
    expect(screen.getByText('101 of 101 selected')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select WO 101' }))
    expect(screen.getByText('$125.00')).toBeInTheDocument()
    expect(screen.getByText('100 of 101 selected')).toBeInTheDocument()
    expect(payApi.quotes).toHaveBeenCalledTimes(2)
  })

  it('refreshes changed monetary inputs for the same ids without resetting selection', async () => {
    const state = { data: [printer, phones], error: null, loading: false, reload: vi.fn(), setData: vi.fn() }
    const list = vi.spyOn(hooks, 'useWorkOrders').mockReturnValue(state)
    function Harness() {
      const [, refresh] = useReducer((n: number) => n + 1, 0)
      return <><button onClick={refresh}>Refresh list</button><PayRunPage /></>
    }
    renderAt(<Harness />)
    await screen.findByText('$356.00')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select WO 9631822' }))

    const updatedPrinter = {
      ...printer,
      pay: { ...printer.pay, rate: 150 },
      expenseTotals: { ...printer.expenseTotals, approvedCents: 1250 },
    }
    list.mockReturnValue({ ...state, data: [updatedPrinter, phones] })
    vi.mocked(payApi.quotes).mockResolvedValue({
      items: [{ id: printer.id, labor: 150, expenses: 12.5, adjustments: 0, total: 162.5 }, quote.items[1]],
      count: 2,
      total: 378.5,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Refresh list' }))

    await waitFor(() => expect(screen.getAllByText('$162.50')).toHaveLength(2))
    expect(screen.getByText('$12.50')).toBeInTheDocument()
    expect(screen.getByText('1 of 2 selected')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select WO 9631821' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select WO 9631822' })).not.toBeChecked()
    expect(payApi.quotes).toHaveBeenCalledTimes(2)
    expect(payApi.quotes).toHaveBeenLastCalledWith([
      { id: printer.id, pay: updatedPrinter.pay, approvedExpenseCents: 1250, adjustmentCents: 0 },
      { id: phones.id, pay: phones.pay, approvedExpenseCents: 0, adjustmentCents: 0 },
    ])
  })

  it('shows placeholders while the quote is loading', async () => {
    let resolve!: (value: PayRunQuote) => void
    vi.mocked(payApi.quotes).mockReturnValue(new Promise((done) => { resolve = done }))
    renderAt(<PayRunPage />)

    const table = await screen.findByRole('table', { name: 'Approved work orders' })
    expect(within(table).getAllByText('...')).toHaveLength(8)
    resolve(quote)
    expect(await screen.findByText('$356.00')).toBeInTheDocument()
  })

  it('selects all rows again when the payable ids change', async () => {
    const state = { data: [printer, phones], error: null, loading: false, reload: vi.fn(), setData: vi.fn() }
    const list = vi.spyOn(hooks, 'useWorkOrders').mockReturnValue(state)
    function Harness() {
      const [, refresh] = useReducer((n: number) => n + 1, 0)
      return <><button onClick={refresh}>Refresh list</button><PayRunPage /></>
    }
    renderAt(<Harness />)
    await screen.findByText('$356.00')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select WO 9631821' }))

    list.mockReturnValue({ ...state, data: [printer] })
    vi.mocked(payApi.quotes).mockResolvedValue({ items: [quote.items[0]], count: 1, total: 140 })
    await userEvent.click(screen.getByRole('button', { name: 'Refresh list' }))

    expect(await screen.findByText('1 of 1 selected')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select WO 9631821' })).toBeChecked()
    await waitFor(() => expect(screen.getAllByText('$140.00')).toHaveLength(3))
    expect(payApi.quotes).toHaveBeenCalledTimes(2)
  })

  it('shows a warning and unavailable amounts when the pay service fails', async () => {
    vi.mocked(payApi.quotes).mockRejectedValue(new Error('pay down'))
    renderAt(<PayRunPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Pay service unavailable: pay down')
    expect(within(screen.getByRole('table')).getAllByText('--')).toHaveLength(8)
    expect(screen.queryByText('$356.00')).not.toBeInTheDocument()
  })

  it.each([{ list: [] }, { list: [workDone] }])('does not quote a list with no approved work orders: %j', async ({ list }) => {
    vi.mocked(api.listWorkOrders).mockResolvedValue(list)
    renderAt(<PayRunPage />)

    expect(await screen.findByText('No approved work orders to pay.')).toBeInTheDocument()
    expect(payApi.quotes).not.toHaveBeenCalled()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the list error without requesting quotes', async () => {
    vi.mocked(api.listWorkOrders).mockRejectedValue(new Error('API down'))
    renderAt(<PayRunPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load work orders: API down')
    expect(payApi.quotes).not.toHaveBeenCalled()
    expect(screen.queryByText('No approved work orders to pay.')).not.toBeInTheDocument()
  })

  it('shows approved expenses and a missing schedule', async () => {
    vi.mocked(api.listWorkOrders).mockResolvedValue([
      { ...printer, schedule: undefined, expenseTotals: { pendingCents: 500, approvedCents: 1250, rejectedCents: 200 } },
    ])
    vi.mocked(payApi.quotes).mockResolvedValue({
      items: [{ id: printer.id, labor: 140, expenses: 12.5, adjustments: 0, total: 152.5 }], count: 1, total: 152.5,
    })
    renderAt(<PayRunPage />)

    expect(await screen.findByText('$12.50')).toBeInTheDocument()
    expect(screen.getByText('Not scheduled')).toBeInTheDocument()
    expect(screen.getAllByText('$152.50')).toHaveLength(2)
    expect(payApi.quotes).toHaveBeenCalledExactlyOnceWith([
      { id: printer.id, pay: printer.pay, approvedExpenseCents: 1250, adjustmentCents: 0 },
    ])
  })

  it('waits for the work order list before showing the empty state or requesting quotes', async () => {
    let resolve!: (value: WorkOrder[]) => void
    vi.mocked(api.listWorkOrders).mockReturnValue(new Promise((done) => { resolve = done }))
    renderAt(<PayRunPage />)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByText('No approved work orders to pay.')).not.toBeInTheDocument()
    expect(payApi.quotes).not.toHaveBeenCalled()
    resolve([printer, phones])
    await waitFor(() => expect(screen.getByText('$356.00')).toBeInTheDocument())
  })
})
