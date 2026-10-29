import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api/client'
import { makeWorkOrder } from '../../test/fixtures'
import { renderAt } from '../../test/render'
import { NewWorkOrderPage } from './NewWorkOrderPage'

vi.mock('../../api/client', () => ({
  api: { createWorkOrder: vi.fn() },
}))

beforeEach(() => {
  vi.mocked(api.createWorkOrder).mockResolvedValue(makeWorkOrder({ id: 1000042, status: 'Draft' }))
})

describe('NewWorkOrderPage', () => {
  it('disables both actions until there is a title', () => {
    renderAt(<NewWorkOrderPage />)

    expect(screen.getByRole('button', { name: 'Save As Draft' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
  })

  it('saves a draft with only a title and opens it', async () => {
    renderAt(<NewWorkOrderPage />)

    await userEvent.type(screen.getByLabelText(/Work order title/), 'Swap printer')
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Save As Draft' }))

    expect(api.createWorkOrder).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Draft', title: 'Swap printer' }),
    )
    expect(await screen.findByText('other page')).toBeInTheDocument()
  })

  it('shows a check when a section is complete', async () => {
    renderAt(<NewWorkOrderPage />)
    expect(screen.getByRole('link', { name: 'Tasks (complete)' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Location' })).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('City'), 'Fargo')
    await userEvent.type(screen.getByLabelText('State'), 'ND')

    expect(screen.getByRole('link', { name: 'Location (complete)' })).toBeInTheDocument()
  })

  it('adds a custom task', async () => {
    renderAt(<NewWorkOrderPage />)

    await userEvent.type(screen.getByLabelText('New task'), 'Collect signature')
    await userEvent.click(screen.getByRole('button', { name: 'Add Task' }))

    expect(screen.getByText('Collect signature')).toBeInTheDocument()
  })

  it('shows the API error when saving fails', async () => {
    vi.mocked(api.createWorkOrder).mockRejectedValue(new Error('title is required'))
    renderAt(<NewWorkOrderPage />)

    fireEvent.change(screen.getByLabelText(/Work order title/), { target: { value: 'x' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save As Draft' }))

    expect(await screen.findByText('title is required')).toBeInTheDocument()
  })
})
