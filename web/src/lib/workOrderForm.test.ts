import { describe, expect, it } from 'vitest'
import {
  addTask,
  canPublish,
  canSaveDraft,
  emptyForm,
  isSectionComplete,
  toNewWorkOrder,
  type FormState,
} from './workOrderForm'

function completeForm(): FormState {
  return {
    ...emptyForm(),
    title: 'Install access points',
    typeOfWork: 'Networking',
    buyer: 'Acme Test Co',
    start: '2026-10-23T09:00',
    end: '2026-10-23T13:00',
    city: 'Fargo',
    state: 'nd',
    payType: 'Hourly',
    rate: '65',
    hours: '4',
  }
}

describe('isSectionComplete', () => {
  it('marks nothing but tasks complete on an empty form', () => {
    const f = emptyForm()
    expect(isSectionComplete('basics', f)).toBe(false)
    expect(isSectionComplete('schedule', f)).toBe(false)
    expect(isSectionComplete('location', f)).toBe(false)
    expect(isSectionComplete('pay', f)).toBe(false)
    expect(isSectionComplete('tasks', f)).toBe(true)
  })

  it('requires the schedule end after the start', () => {
    expect(isSectionComplete('schedule', { ...completeForm(), end: '2026-10-23T08:00' })).toBe(false)
  })

  it('requires a two-letter state', () => {
    expect(isSectionComplete('location', { ...completeForm(), state: 'Minnesota' })).toBe(false)
  })

  it('checks the quantity that matches the pay type', () => {
    const f = completeForm()
    expect(isSectionComplete('pay', { ...f, hours: '' })).toBe(false)
    expect(isSectionComplete('pay', { ...f, payType: 'Fixed', hours: '' })).toBe(true)
    expect(isSectionComplete('pay', { ...f, payType: 'PerDevice' })).toBe(false)
    expect(isSectionComplete('pay', { ...f, payType: 'PerDevice', devices: '6' })).toBe(true)
  })
})

describe('canPublish and canSaveDraft', () => {
  it('needs only a title to save a draft', () => {
    expect(canSaveDraft({ ...emptyForm(), title: 'x' })).toBe(true)
    expect(canPublish({ ...emptyForm(), title: 'x' })).toBe(false)
  })

  it('needs every section to publish', () => {
    expect(canPublish(completeForm())).toBe(true)
  })
})

describe('toNewWorkOrder', () => {
  it('builds the API body', () => {
    const wo = toNewWorkOrder(completeForm(), 'Published')
    expect(wo).toMatchObject({
      status: 'Published',
      title: 'Install access points',
      location: { city: 'Fargo', state: 'ND' },
      pay: { type: 'Hourly', rate: 65, hours: 4 },
    })
    expect(wo.pay.devices).toBeUndefined()
    expect(new Date(wo.schedule!.start).getTime()).toBeLessThan(new Date(wo.schedule!.end).getTime())
  })

  it('omits a partial schedule on drafts', () => {
    const wo = toNewWorkOrder({ ...emptyForm(), title: 'x', start: '2026-10-23T09:00' }, 'Draft')
    expect(wo.schedule).toBeUndefined()
  })
})

describe('addTask', () => {
  it('appends a task with the next id', () => {
    const f = addTask(emptyForm(), 'On Site', 'Upload photos')
    expect(f.tasks.at(-1)).toEqual({ id: 't5', group: 'On Site', title: 'Upload photos', done: false })
  })
})
