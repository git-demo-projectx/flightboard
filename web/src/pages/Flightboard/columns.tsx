import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import type { WorkOrder } from '../../api/types'
import { HealthChip, StatusChip } from '../../components/Chips'
import { formatPay, formatSchedule } from '../../lib/format'
import { colors } from '../../theme'

/** A Flightboard table column. Add, remove or reorder columns here. */
export interface Column {
  id: string
  label: string
  render: (wo: WorkOrder) => ReactNode
  /** Keep the cell on one line. */
  nowrap?: boolean
}

const muted = (text: ReactNode) => (
  <Typography variant="caption" sx={{ color: colors.iconGray, display: 'block' }}>
    {text}
  </Typography>
)

export const COLUMNS: Column[] = [
  {
    id: 'id',
    label: 'ID',
    render: (wo) => (
      <Link
        component={RouterLink}
        to={`/work-orders/${wo.id}`}
        onClick={(e) => e.stopPropagation()}
        underline="hover"
        sx={{ fontWeight: 600 }}
      >
        {wo.id}
      </Link>
    ),
  },
  { id: 'health', label: 'Health', render: (wo) => <HealthChip health={wo.health} /> },
  {
    id: 'title',
    label: 'Title',
    render: (wo) => (
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: colors.primary }}>{wo.title}</Typography>
        {muted(`${wo.typeOfWork} · ${wo.buyer}`)}
      </Box>
    ),
  },
  {
    id: 'status',
    label: 'Status',
    render: (wo) => (
      <Box>
        <StatusChip status={wo.status} />
        {wo.subStatus && muted(wo.subStatus)}
      </Box>
    ),
  },
  {
    id: 'provider',
    label: 'Provider',
    render: (wo) => (wo.provider ? wo.provider.name : muted('Unassigned')),
  },
  {
    id: 'location',
    label: 'Location',
    render: (wo) =>
      wo.location.city ? `${wo.location.city}, ${wo.location.state}` : muted('No location'),
  },
  {
    id: 'schedule',
    label: 'Schedule',
    nowrap: true,
    render: (wo) =>
      wo.schedule ? formatSchedule(wo.schedule.start, wo.schedule.end) : muted('Not scheduled'),
  },
  { id: 'pay', label: 'Pay', nowrap: true, render: (wo) => formatPay(wo.pay) },
]
