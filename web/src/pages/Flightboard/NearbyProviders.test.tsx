import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api/client'
import { makeWorkOrder } from '../../test/fixtures'
import { renderAt } from '../../test/render'
import { NearbyProviders } from './NearbyProviders'

vi.mock('../../api/client', () => ({
  api: { nearbyProviders: vi.fn() },
}))

const workOrder = makeWorkOrder({ provider: null, location: { city: 'Des Moines', state: 'IA' } })

beforeEach(() => {
  vi.mocked(api.nearbyProviders).mockReset()
})

describe('NearbyProviders', () => {
  it('shows providers in API order with score badges and cities', async () => {
    vi.mocked(api.nearbyProviders).mockResolvedValue([
      { id: 'p-101', name: 'Dana Whitfield', score: 97, city: 'Minneapolis', state: 'MN' },
      { id: 'p-104', name: 'Tomas Lindqvist', score: 89, city: 'Saint Paul', state: 'MN' },
    ])
    renderAt(<NearbyProviders workOrder={workOrder} />)

    const region = screen.getByRole('region', { name: 'Nearby providers' })
    const dana = await within(region).findByText('Dana Whitfield')
    const tomas = within(region).getByText('Tomas Lindqvist')
    expect(dana.compareDocumentPosition(tomas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(dana.parentElement!).getByText('Excellent 97')).toBeInTheDocument()
    expect(within(dana.parentElement!).getByText('Minneapolis')).toBeInTheDocument()
    expect(within(tomas.parentElement!).getByText('Very good 89')).toBeInTheDocument()
    expect(within(tomas.parentElement!).getByText('Saint Paul')).toBeInTheDocument()
    expect(api.nearbyProviders).toHaveBeenCalledExactlyOnceWith(workOrder.id)
  })

  it('shows loading while the request is pending', () => {
    vi.mocked(api.nearbyProviders).mockReturnValue(new Promise(() => {}))
    renderAt(<NearbyProviders workOrder={workOrder} />)

    const region = screen.getByRole('region', { name: 'Nearby providers' })
    expect(within(region).getByText('Finding nearby providers...')).toBeInTheDocument()
  })

  it('shows the work order state when no providers are nearby', async () => {
    vi.mocked(api.nearbyProviders).mockResolvedValue([])
    renderAt(<NearbyProviders workOrder={workOrder} />)

    const region = screen.getByRole('region', { name: 'Nearby providers' })
    expect(await within(region).findByText('No providers in IA.')).toBeInTheDocument()
  })

  it('shows the request error inside the section', async () => {
    vi.mocked(api.nearbyProviders).mockRejectedValue(new Error('boom'))
    renderAt(<NearbyProviders workOrder={workOrder} />)

    const region = screen.getByRole('region', { name: 'Nearby providers' })
    expect(await within(region).findByText('Could not load nearby providers: boom')).toBeInTheDocument()
  })
})
