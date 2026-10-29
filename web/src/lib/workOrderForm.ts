import type { NewWorkOrder, PayType, Task, TaskGroup } from '../api/types'

export const TYPES_OF_WORK = [
  'Networking',
  'Point of Sale',
  'Telecom/VoIP',
  'Desktop/Laptop',
  'Low Voltage Cabling',
  'Audio Visual',
  'Alarm & Security',
  'Kiosk',
  'Printer',
  'Server',
  'ATM',
  'Electrical',
]

/** FormState holds the New Work Order form. Numbers stay strings until submit. */
export interface FormState {
  title: string
  typeOfWork: string
  buyer: string
  start: string // datetime-local value, e.g. "2026-10-23T09:00"
  end: string
  city: string
  state: string
  payType: PayType
  rate: string
  hours: string
  devices: string
  tasks: Task[]
}

export type SectionId = 'basics' | 'schedule' | 'location' | 'pay' | 'tasks'

export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'location', label: 'Location' },
  { id: 'pay', label: 'Pay' },
  { id: 'tasks', label: 'Tasks' },
]

export function emptyForm(): FormState {
  return {
    title: '',
    typeOfWork: '',
    buyer: '',
    start: '',
    end: '',
    city: '',
    state: '',
    payType: 'Hourly',
    rate: '',
    hours: '',
    devices: '',
    tasks: [
      { id: 't1', group: 'Prep', title: 'Set start time', done: false },
      { id: 't2', group: 'On Site', title: 'Check in', done: false },
      { id: 't3', group: 'On Site', title: 'Check out', done: false },
      { id: 't4', group: 'Post', title: 'Enter closeout notes', done: false },
    ],
  }
}

const positive = (s: string) => Number(s) > 0
const filled = (s: string) => s.trim() !== ''

/** isSectionComplete drives the green checks in the section list. */
export function isSectionComplete(id: SectionId, f: FormState): boolean {
  switch (id) {
    case 'basics':
      return filled(f.title) && filled(f.typeOfWork) && filled(f.buyer)
    case 'schedule':
      return filled(f.start) && filled(f.end) && new Date(f.end) > new Date(f.start)
    case 'location':
      return filled(f.city) && /^[A-Za-z]{2}$/.test(f.state.trim())
    case 'pay':
      if (!positive(f.rate)) return false
      if (f.payType === 'Hourly') return positive(f.hours)
      if (f.payType === 'PerDevice') return positive(f.devices)
      return f.payType === 'Fixed'
    case 'tasks':
      return f.tasks.length > 0 && f.tasks.every((t) => filled(t.title))
  }
}

export function canPublish(f: FormState): boolean {
  return SECTIONS.every((s) => isSectionComplete(s.id, f))
}

export function canSaveDraft(f: FormState): boolean {
  return filled(f.title)
}

/** addTask appends a task to a group with the next free id. */
export function addTask(f: FormState, group: TaskGroup, title: string): FormState {
  const next = f.tasks.reduce((max, t) => Math.max(max, Number(t.id.slice(1)) || 0), 0) + 1
  return { ...f, tasks: [...f.tasks, { id: `t${next}`, group, title, done: false }] }
}

const toISO = (local: string) => new Date(local).toISOString()

/** toNewWorkOrder builds the API request body from the form. */
export function toNewWorkOrder(f: FormState, status: NewWorkOrder['status']): NewWorkOrder {
  const pay: NewWorkOrder['pay'] = { type: f.payType, rate: Number(f.rate) || 0 }
  if (f.payType === 'Hourly') pay.hours = Number(f.hours) || 0
  if (f.payType === 'PerDevice') pay.devices = Number(f.devices) || 0

  const wo: NewWorkOrder = {
    status,
    title: f.title.trim(),
    typeOfWork: f.typeOfWork,
    buyer: f.buyer.trim(),
    location: { city: f.city.trim(), state: f.state.trim().toUpperCase() },
    pay,
    tasks: f.tasks,
  }
  // The API rejects partial times, so a draft without a full schedule omits it.
  if (filled(f.start) && filled(f.end)) {
    wo.schedule = { start: toISO(f.start), end: toISO(f.end) }
  }
  return wo
}
