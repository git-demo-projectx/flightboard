import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { WeekWorkOrder } from '../../api/types'
import { formatTime } from '../../lib/format'
import { renderAt } from '../../test/render'
import { ScheduleCard } from './ScheduleCard'

function makeWeekWorkOrder(overrides: Partial<WeekWorkOrder> = {}): WeekWorkOrder {
  return {
    id: 9631810,
    title: 'Replace failed switch in IDF closet',
    status: 'Assigned',
    health: 'On Track',
    start: '2026-10-19T08:00:00-05:00',
    end: '2026-10-19T12:00:00-05:00',
    location: { city: 'Minneapolis', state: 'MN' },
    provider: { id: 'p-101', name: 'Dana Whitfield' },
    ...overrides,
  }
}

describe('ScheduleCard', () => {
  it('links an assigned work order with its schedule and no On Track chip', () => {
    const workOrder = makeWeekWorkOrder()
    renderAt(<ScheduleCard workOrder={workOrder} />)

    const link = screen.getByRole('link', { name: 'WO 9631810 Replace failed switch in IDF closet' })
    expect(link).toHaveAttribute('href', '/work-orders/9631810')
    expect(link).toHaveAttribute('data-unassigned', 'false')
    expect(screen.getByText(`${formatTime(workOrder.start)} - ${formatTime(workOrder.end)}`)).toBeInTheDocument()
    expect(screen.getByText('WO 9631810')).toBeInTheDocument()
    expect(screen.getByText('Replace failed switch in IDF closet')).toBeInTheDocument()
    expect(screen.getByText('Dana Whitfield')).toBeInTheDocument()
    expect(screen.getByText('Minneapolis, MN')).toBeInTheDocument()
    expect(screen.getByText('Assigned')).toBeInTheDocument()
    expect(screen.queryByText('On Track')).toBeNull()
    expect(screen.queryByText('Unassigned')).toBeNull()
  })

  it('shows an unassigned Routed work order with Published and Alert chips', () => {
    const workOrder = makeWeekWorkOrder({
      id: 9631808,
      title: 'Conference room AV troubleshooting',
      provider: null,
      location: { city: 'Chicago', state: 'IL' },
      status: 'Routed',
      health: 'Alert',
    })
    renderAt(<ScheduleCard workOrder={workOrder} />)

    const link = screen.getByRole('link', { name: 'WO 9631808 Conference room AV troubleshooting' })
    expect(link).toHaveAttribute('href', '/work-orders/9631808')
    expect(link).toHaveAttribute('data-unassigned', 'true')
    expect(screen.getByText('WO 9631808')).toBeInTheDocument()
    expect(screen.getByText('Conference room AV troubleshooting')).toBeInTheDocument()
    expect(screen.getByText('Unassigned')).toBeInTheDocument()
    expect(screen.getByText('Chicago, IL')).toBeInTheDocument()
    expect(screen.getByText('Published')).toBeInTheDocument()
    expect(screen.getByText('Alert')).toBeInTheDocument()
    expect(screen.queryByText('Routed')).toBeNull()
    expect(screen.queryByText('Dana Whitfield')).toBeNull()
  })

  it('shows the Review chip for an assigned work order needing review', () => {
    renderAt(<ScheduleCard workOrder={makeWeekWorkOrder({ health: 'Review' })} />)

    expect(screen.getByText('Assigned')).toBeInTheDocument()
    expect(screen.getByText('Review')).toBeInTheDocument()
  })
})
