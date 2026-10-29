import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderAt } from '../test/render'
import { colors } from '../theme'
import { TopBar } from './TopBar'

describe('TopBar', () => {
  it.each(['/schedule', '/schedule?start=2026-10-19', '/schedule/week'])('activates Schedule at %s', (url) => {
    renderAt(<TopBar />, { path: '*', url })

    const schedule = screen.getByRole('link', { name: 'Schedule' })
    expect(schedule).toHaveAttribute('href', '/schedule')
    expect(schedule).toHaveAttribute('aria-current', 'page')
    expect(schedule).toHaveStyle({ borderBottomColor: colors.orange })
    expect(screen.getByRole('link', { name: 'Work' })).not.toHaveAttribute('aria-current')
  })

  it.each(['/', '/work-orders/new', '/work-orders/1000001', '/work-orders/pay-run'])('keeps Work active at %s', (url) => {
    renderAt(<TopBar />, { path: '*', url })

    expect(screen.getByRole('link', { name: 'Work' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Schedule' })).not.toHaveAttribute('aria-current')
  })
})
