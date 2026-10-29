import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, payApi } from './client'
import type { Expense, PayQuote, PayRunQuote, PayRunQuoteItem, PayRunResult, WorkOrderWeek } from './types'
import { makeWorkOrder } from '../test/fixtures'

const workOrder = makeWorkOrder()
const expense: Expense = {
  id: 'e1',
  category: 'Parts',
  description: 'Replacement cable',
  amountCents: 1250,
  status: 'Pending',
  createdAt: '2026-10-22T14:00:00Z',
}
const newExpense = {
  category: expense.category,
  description: expense.description,
  amountCents: expense.amountCents,
}
const quote: PayQuote = {
  type: 'Hourly',
  lines: [{ label: 'Labor - Hourly pay', amount: 260 }],
  total: 260,
}
const expensePath = `/api/work-orders/${workOrder.id}/expenses`
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('expense API calls', () => {
  const calls = [
    {
      name: 'listExpenses',
      call: () => api.listExpenses(workOrder.id),
      path: expensePath,
      method: 'GET',
      body: undefined,
      response: [expense],
    },
    {
      name: 'addExpense',
      call: () => api.addExpense(workOrder.id, newExpense),
      path: expensePath,
      method: 'POST',
      body: newExpense,
      response: expense,
    },
    {
      name: 'approveExpense',
      call: () => api.approveExpense(workOrder.id, expense.id),
      path: `${expensePath}/${expense.id}/approve`,
      method: 'POST',
      body: {},
      response: { ...expense, status: 'Approved' },
    },
    {
      name: 'rejectExpense',
      call: () => api.rejectExpense(workOrder.id, expense.id, 'Receipt missing'),
      path: `${expensePath}/${expense.id}/reject`,
      method: 'POST',
      body: { reason: 'Receipt missing' },
      response: { ...expense, status: 'Rejected', reason: 'Receipt missing' },
    },
  ]

  it.each(calls)('$name sends the expected request and returns the response', async (test) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(test.response)))

    await expect(test.call()).resolves.toEqual(test.response)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [path, init] = fetchMock.mock.calls[0]
    expect(path).toBe(test.path)
    expect(init?.method ?? 'GET').toBe(test.method)
    expect(init?.body).toBe(test.body === undefined ? undefined : JSON.stringify(test.body))
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it.each(calls)('$name propagates API errors to the caller', async (test) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Expense change not allowed' }), { status: 409 }),
    )

    const result = test.call()
    await expect(result).rejects.toBeInstanceOf(ApiError)
    await expect(result).rejects.toMatchObject({
      status: 409,
      message: 'Expense change not allowed',
    })
  })
})

describe('pay quotes', () => {
  it.each([undefined, [], [expense]])('sends optional expenses %j', async (expenses) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(quote)))

    await expect(payApi.quote(workOrder.pay, expenses)).resolves.toEqual(quote)

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/pay/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...workOrder.pay, expenses }),
    })
  })

  it('propagates pay API errors when expenses are included', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid expense amount' }), { status: 400 }),
    )

    const result = payApi.quote(workOrder.pay, [expense])
    await expect(result).rejects.toBeInstanceOf(ApiError)
    await expect(result).rejects.toMatchObject({ status: 400, message: 'Invalid expense amount' })
  })
})

describe('pay run quotes', () => {
  const items: PayRunQuoteItem[] = [
    { id: 9631821, pay: { type: 'Fixed', rate: 140 }, approvedExpenseCents: 0 },
    { id: 9631822, pay: { type: 'PerDevice', rate: 18, devices: 12 }, approvedExpenseCents: 0 },
  ]
  const response: PayRunQuote = {
    items: [
      { id: 9631821, labor: 140, expenses: 0, total: 140 },
      { id: 9631822, labor: 216, expenses: 0, total: 216 },
    ],
    count: 2,
    total: 356,
  }

  it('posts items to the batch quote endpoint and returns the JSON', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(response)))

    await expect(payApi.quotes(items)).resolves.toEqual(response)

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/pay/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
  })

  it('propagates the server message as an ApiError', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid quote items' }), { status: 400 }),
    )

    const result = payApi.quotes(items)
    await expect(result).rejects.toBeInstanceOf(ApiError)
    await expect(result).rejects.toMatchObject({ status: 400, message: 'Invalid quote items' })
  })
})

describe('pay run', () => {
  it('posts selected ids and returns the paid work orders', async () => {
    const paidAt = '2026-10-23T12:00:00Z'
    const response: PayRunResult = {
      count: 2,
      paidAt,
      workOrders: [9631821, 9631822].map((id) => ({ id, title: `WO ${id}`, status: 'Paid', paidAt })),
    }
    fetchMock.mockResolvedValue(new Response(JSON.stringify(response)))

    await expect(api.payRun([9631821, 9631822])).resolves.toEqual(response)

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/work-orders/pay-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"ids":[9631821,9631822]}',
    })
  })

  it('propagates a conflict with its status and server message', async () => {
    const message = 'conflict: work order 9631821 is Paid, not Approved'
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: message }), { status: 409 }))

    const result = api.payRun([9631821, 9631822])
    await expect(result).rejects.toBeInstanceOf(ApiError)
    await expect(result).rejects.toMatchObject({ status: 409, message })
  })
})

it('creates work order fixtures with zero expense totals', () => {
  expect(makeWorkOrder().expenseTotals).toEqual({
    pendingCents: 0,
    approvedCents: 0,
    rejectedCents: 0,
  })
  const expenseTotals = { pendingCents: 1250, approvedCents: 500, rejectedCents: 100 }
  expect(makeWorkOrder({ expenseTotals }).expenseTotals).toEqual(expenseTotals)
})

describe('nearby providers', () => {
  it('sends a GET to the nearby providers endpoint and returns the JSON', async () => {
    const providers = [
      { id: 'p-101', name: 'Dana Whitfield', score: 97, city: 'Minneapolis', state: 'MN' },
      { id: 'p-104', name: 'Tomas Lindqvist', score: 89, city: 'Saint Paul', state: 'MN' },
    ]
    fetchMock.mockResolvedValue(new Response(JSON.stringify(providers)))

    await expect(api.nearbyProviders(9631805)).resolves.toEqual(providers)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [path, init] = fetchMock.mock.calls[0]
    expect(path).toBe('/api/work-orders/9631805/nearby-providers')
    expect(init?.method ?? 'GET').toBe('GET')
    expect(init?.body).toBeUndefined()
  })

  it('propagates a 404 with the server message as an ApiError', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Work order not found' }), { status: 404 }),
    )

    const result = api.nearbyProviders(9631805)
    await expect(result).rejects.toBeInstanceOf(ApiError)
    await expect(result).rejects.toMatchObject({ status: 404, message: 'Work order not found' })
  })
})

describe('week', () => {
  it.each([
    [undefined, '/api/work-orders/week?start=2026-10-19'],
    ['p-101', '/api/work-orders/week?start=2026-10-19&providerId=p-101'],
  ])('fetches a week with providerId %s', async (providerId, path) => {
    const response: WorkOrderWeek = {
      start: '2026-10-19', end: '2026-10-25', total: 0, unassigned: 0, days: [],
    }
    fetchMock.mockResolvedValue(new Response(JSON.stringify(response)))

    await expect(api.getWeek('2026-10-19', providerId)).resolves.toEqual(response)

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(path, {
      headers: { 'Content-Type': 'application/json' },
    })
  })
})
