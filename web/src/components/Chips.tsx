import Chip from '@mui/material/Chip'
import CheckIcon from '@mui/icons-material/Check'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import type { ExpenseStatus, Health, Provider, Status } from '../api/types'
import { expenseStatusChip, healthChip, statusChip, type ChipStyle } from '../lib/status'
import { scoreLabel } from '../lib/score'
import { colors } from '../theme'

function styleOf(c: ChipStyle) {
  return {
    bgcolor: c.bg,
    color: c.fg,
    border: c.border ? `1px solid ${c.border}` : 'none',
    '& .MuiChip-icon': { color: 'inherit' },
  }
}

export function StatusChip({ status }: { status: Status }) {
  const c = statusChip(status)
  return <Chip size="small" label={c.label} sx={styleOf(c)} />
}

export function ExpenseStatusChip({ status }: { status: ExpenseStatus }) {
  const c = expenseStatusChip(status)
  return <Chip size="small" label={c.label} sx={styleOf(c)} />
}

const HEALTH_ICONS: Record<Health, JSX.Element> = {
  'On Track': <CheckIcon sx={{ fontSize: 16, color: `${colors.successBright} !important` }} />,
  Review: <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />,
  Alert: <WarningAmberIcon sx={{ fontSize: 16 }} />,
}

export function HealthChip({ health }: { health: Health }) {
  const c = healthChip(health)
  return <Chip size="small" icon={HEALTH_ICONS[health]} label={c.label} sx={styleOf(c)} />
}

/** ScoreBadge shows a provider score, e.g. "Excellent 95". */
export function ScoreBadge({ provider }: { provider: Provider }) {
  return (
    <Chip
      size="small"
      label={`${scoreLabel(provider.score)} ${provider.score}`}
      sx={{ bgcolor: '#E3F4EC', color: colors.success }}
    />
  )
}
