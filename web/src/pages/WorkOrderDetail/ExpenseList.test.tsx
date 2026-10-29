import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api/client'
import type { Expense } from '../../api/types'
import { makeWorkOrder } from '../../test/fixtures'
import { renderAt } from '../../test/render'
import { ExpenseList } from './ExpenseList'

vi.mock('../../api/client', () => ({
  api: { listExpenses: vi.fn() },
}))

const workOrder = makeWorkOrder()
const expense: Expense = {
  id: 'e1',
  category: 'Parts',
  description: 'Replacement patch cables',
  amountCents: 2400,
  status: 'Pending',
  createdAt: '2026-10-19T13:30:00Z',
}

beforeEach(() => {
  vi.mocked(api.listExpenses).mockReset()
})

describe('ExpenseList', () => {
  it('lists expenses in API order with category, amount and status', async () => {
    vi.mocked(api.listExpenses).mockResolvedValue([
      expense,
      {
        ...expense,
        id: 'e2',
        category: 'Mileage',
        description: 'Travel to the service location',
        amountCents: 1800,
        status: 'Approved',
      },
    ])
    renderAt(<ExpenseList workOrder={workOrder} />)

    const region = screen.getByRole('region', { name: 'Expenses' })
    const items = await within(region).findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Replacement patch cables')).toBeInTheDocument()
    expect(within(items[0]).getByText('Parts')).toBeInTheDocument()
    expect(within(items[0]).getByText('$24.00')).toBeInTheDocument()
    expect(within(items[0]).getByText('Pending')).toBeInTheDocument()
    expect(within(items[1]).getByText('Travel to the service location')).toBeInTheDocument()
    expect(within(items[1]).getByText('Mileage')).toBeInTheDocument()
    expect(within(items[1]).getByText('$18.00')).toBeInTheDocument()
    expect(within(items[1]).getByText('Approved')).toBeInTheDocument()
    expect(api.listExpenses).toHaveBeenCalledExactlyOnceWith(workOrder.id)
  })

  it('shows the reason on a rejected expense', async () => {
    vi.mocked(api.listExpenses).mockResolvedValue([{ ...expense, status: 'Rejected', reason: 'Receipt missing' }])
    renderAt(<ExpenseList workOrder={workOrder} />)

    expect(await screen.findByText('Reason: Receipt missing')).toBeInTheDocument()
    expect(screen.getByText('Rejected')).toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    vi.mocked(api.listExpenses).mockResolvedValue([])
    renderAt(<ExpenseList workOrder={workOrder} />)

    expect(await screen.findByText('No expenses yet.')).toBeInTheDocument()
  })

  it('shows loading while the request is pending', () => {
    vi.mocked(api.listExpenses).mockReturnValue(new Promise(() => {}))
    renderAt(<ExpenseList workOrder={workOrder} />)

    expect(screen.getByText('Loading expenses...')).toBeInTheDocument()
  })

  it('shows the request error', async () => {
    vi.mocked(api.listExpenses).mockRejectedValue(new Error('boom'))
    renderAt(<ExpenseList workOrder={workOrder} />)

    expect(await screen.findByText('Could not load expenses: boom')).toBeInTheDocument()
  })
})
