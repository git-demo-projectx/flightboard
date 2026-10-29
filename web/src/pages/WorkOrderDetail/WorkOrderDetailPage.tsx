import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { api } from '../../api/client'
import { useWorkOrder } from '../../api/hooks'
import type { Status, Task, WorkOrder } from '../../api/types'
import { HealthChip, ScoreBadge, StatusChip } from '../../components/Chips'
import { PageHeader } from '../../components/PageHeader'
import { formatSchedule, formatTime } from '../../lib/format'
import { colors } from '../../theme'
import { PayBreakdown } from './PayBreakdown'
import { TaskList } from './TaskList'

/** The main action the buyer can take in each status. */
const NEXT_ACTION: Partial<Record<Status, { label: string; to: Status }>> = {
  Draft: { label: 'Publish', to: 'Published' },
  'Work Done': { label: 'Approve', to: 'Approved' },
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <Typography variant="h2" sx={{ px: 2.5, pt: 2, pb: 1 }}>
        {title}
      </Typography>
      <Divider />
      <Box sx={{ p: 2.5 }}>{children}</Box>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', py: 0.75, gap: 2 }}>
      <Typography sx={{ width: 140, flexShrink: 0, color: colors.iconGray }}>{label}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{children}</Box>
    </Box>
  )
}

function Overview({ wo }: { wo: WorkOrder }) {
  return (
    <Panel title="Overview">
      <Field label="Status">
        <StatusChip status={wo.status} />
        {wo.subStatus && <Typography variant="body2">{wo.subStatus}</Typography>}
      </Field>
      <Field label="Health">
        <HealthChip health={wo.health} />
      </Field>
      <Field label="Provider">
        {wo.provider ? (
          <>
            <Typography>{wo.provider.name}</Typography>
            <ScoreBadge provider={wo.provider} />
          </>
        ) : (
          <Typography color="text.secondary">Unassigned</Typography>
        )}
      </Field>
      <Field label="Buyer">{wo.buyer}</Field>
      <Field label="Type of work">{wo.typeOfWork}</Field>
      <Field label="Location">
        {wo.location.city}, {wo.location.state}
      </Field>
      <Field label="Schedule">{wo.schedule ? formatSchedule(wo.schedule.start, wo.schedule.end) : 'Not scheduled'}</Field>
      <Field label="Check in">{wo.checkIn ? formatTime(wo.checkIn) : '--'}</Field>
      <Field label="Check out">{wo.checkOut ? formatTime(wo.checkOut) : '--'}</Field>
    </Panel>
  )
}

/** WorkOrderDetailPage shows one work order with pay and tasks. */
export function WorkOrderDetailPage() {
  const id = Number(useParams().id)
  const { data: wo, error, loading, setData } = useWorkOrder(id)
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(change: () => Promise<WorkOrder>) {
    setActionError(null)
    try {
      setData(await change())
    } catch (e) {
      setActionError((e as Error).message)
    }
  }

  if (loading && !wo) {
    return (
      <Box sx={{ p: 6, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }
  if (error || !wo) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Could not load work order {id}: {error?.message}</Alert>
        <Button component={RouterLink} to="/" sx={{ mt: 2 }}>
          Back to Flightboard
        </Button>
      </Box>
    )
  }

  const action = NEXT_ACTION[wo.status]
  const onToggle = (t: Task, done: boolean) => run(() => api.setTaskDone(wo.id, t.id, done))

  return (
    <>
      <PageHeader
        title={
          <>
            <Box component="span" sx={{ color: colors.primary, fontWeight: 400 }}>
              WO {wo.id}
            </Box>{' '}
            {wo.title}
          </>
        }
        actions={
          <>
            <Button variant="outlined" component={RouterLink} to="/">
              Back to Flightboard
            </Button>
            {action && (
              <Button variant="contained" onClick={() => run(() => api.setStatus(wo.id, action.to))}>
                {action.label}
              </Button>
            )}
          </>
        }
      />
      <Box sx={{ p: 3, display: 'grid', gap: 2, gridTemplateColumns: { md: '3fr 2fr' }, alignItems: 'start' }}>
        {actionError && (
          <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>
            {actionError}
          </Alert>
        )}
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Overview wo={wo} />
          <Panel title="Tasks">
            <TaskList tasks={wo.tasks} disabled={wo.status === 'Cancelled'} onToggle={onToggle} />
          </Panel>
        </Box>
        <Panel title="Pay">
          <PayBreakdown pay={wo.pay} />
        </Panel>
      </Box>
    </>
  )
}
