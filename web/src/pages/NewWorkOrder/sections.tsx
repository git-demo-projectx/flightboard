import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useState, type ReactNode } from 'react'
import { PAY_TYPES, TASK_GROUPS, type TaskGroup } from '../../api/types'
import { PAY_TYPE_LABELS } from '../../lib/format'
import { addTask, TYPES_OF_WORK, type FormState, type SectionId } from '../../lib/workOrderForm'

export interface SectionProps {
  form: FormState
  onChange: (patch: Partial<FormState>) => void
}

function Section({ id, title, children }: { id: SectionId; title: string; children: ReactNode }) {
  return (
    <Card id={`section-${id}`} component="section" aria-labelledby={`section-${id}-title`} sx={{ scrollMarginTop: 72 }}>
      <Typography id={`section-${id}-title`} variant="h2" sx={{ px: 3, pt: 2, pb: 1.5 }}>
        {title}
      </Typography>
      <Divider />
      <Box sx={{ p: 3, display: 'grid', gap: 2, maxWidth: 640 }}>{children}</Box>
    </Card>
  )
}

export function BasicsSection({ form, onChange }: SectionProps) {
  return (
    <Section id="basics" title="Basics">
      <TextField label="Work order title" required value={form.title} onChange={(e) => onChange({ title: e.target.value })} />
      <TextField
        select
        label="Type of work"
        value={form.typeOfWork}
        onChange={(e) => onChange({ typeOfWork: e.target.value })}
      >
        {TYPES_OF_WORK.map((t) => (
          <MenuItem key={t} value={t}>
            {t}
          </MenuItem>
        ))}
      </TextField>
      <TextField label="Buyer" value={form.buyer} onChange={(e) => onChange({ buyer: e.target.value })} />
    </Section>
  )
}

export function ScheduleSection({ form, onChange }: SectionProps) {
  return (
    <Section id="schedule" title="Schedule">
      <Typography variant="body2" color="text.secondary">
        Service window: the provider arrives between start and end.
      </Typography>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField
          label="Start"
          type="datetime-local"
          value={form.start}
          onChange={(e) => onChange({ start: e.target.value })}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="End"
          type="datetime-local"
          value={form.end}
          onChange={(e) => onChange({ end: e.target.value })}
          InputLabelProps={{ shrink: true }}
        />
      </Box>
    </Section>
  )
}

export function LocationSection({ form, onChange }: SectionProps) {
  return (
    <Section id="location" title="Location">
      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField label="City" value={form.city} onChange={(e) => onChange({ city: e.target.value })} />
        <TextField
          label="State"
          placeholder="MN"
          value={form.state}
          onChange={(e) => onChange({ state: e.target.value })}
          inputProps={{ maxLength: 2 }}
          sx={{ maxWidth: 120 }}
        />
      </Box>
    </Section>
  )
}

export function PaySection({ form, onChange }: SectionProps) {
  return (
    <Section id="pay" title="Pay">
      <TextField
        select
        label="Pay type"
        value={form.payType}
        onChange={(e) => onChange({ payType: e.target.value as FormState['payType'] })}
      >
        {PAY_TYPES.map((t) => (
          <MenuItem key={t} value={t}>
            {PAY_TYPE_LABELS[t]}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField
          label={form.payType === 'Fixed' ? 'Amount ($)' : 'Rate ($)'}
          type="number"
          value={form.rate}
          onChange={(e) => onChange({ rate: e.target.value })}
        />
        {form.payType === 'Hourly' && (
          <TextField label="Hours" type="number" value={form.hours} onChange={(e) => onChange({ hours: e.target.value })} />
        )}
        {form.payType === 'PerDevice' && (
          <TextField
            label="Devices"
            type="number"
            value={form.devices}
            onChange={(e) => onChange({ devices: e.target.value })}
          />
        )}
      </Box>
    </Section>
  )
}

export function TasksSection({ form, onChange }: SectionProps) {
  const [title, setTitle] = useState('')
  const [group, setGroup] = useState<TaskGroup>('On Site')

  return (
    <Section id="tasks" title="Tasks">
      {TASK_GROUPS.map((g) => (
        <Box key={g}>
          <Typography variant="h3" sx={{ mb: 1 }}>
            {g}
          </Typography>
          {form.tasks
            .filter((t) => t.group === g)
            .map((t) => (
              <Box key={t.id} sx={{ display: 'flex', alignItems: 'center', bgcolor: '#E9ECF2', borderRadius: 1, px: 1.5, py: 0.5, mb: 0.5 }}>
                <Typography sx={{ flexGrow: 1, fontWeight: 600 }}>{t.title}</Typography>
                <IconButton
                  size="small"
                  aria-label={`Remove task ${t.title}`}
                  onClick={() => onChange({ tasks: form.tasks.filter((x) => x.id !== t.id) })}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
        </Box>
      ))}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField label="New task" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField
          select
          label="Group"
          value={group}
          onChange={(e) => setGroup(e.target.value as TaskGroup)}
          sx={{ maxWidth: 140 }}
        >
          {TASK_GROUPS.map((g) => (
            <MenuItem key={g} value={g}>
              {g}
            </MenuItem>
          ))}
        </TextField>
        <Button
          startIcon={<AddIcon />}
          disabled={!title.trim()}
          onClick={() => {
            onChange({ tasks: addTask(form, group, title.trim()).tasks })
            setTitle('')
          }}
          sx={{ flexShrink: 0 }}
        >
          Add Task
        </Button>
      </Box>
    </Section>
  )
}
