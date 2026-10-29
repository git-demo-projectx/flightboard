import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CloseIcon from '@mui/icons-material/Close'
import { Link as RouterLink } from 'react-router-dom'
import { usePayQuote } from '../../api/hooks'
import type { WorkOrder } from '../../api/types'
import { ScoreBadge, StatusChip } from '../../components/Chips'
import { formatDuration, formatMoney, formatTime, minutesBetween } from '../../lib/format'
import { colors } from '../../theme'
import { NearbyProviders } from './NearbyProviders'

/** A check-in counts as on time up to this many minutes after the scheduled start. */
const ON_TIME_GRACE_MINUTES = 15

const label = (text: string) => (
  <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
    {text}
  </Typography>
)

function Badge({ text }: { text: string }) {
  return (
    <Chip
      size="small"
      icon={<CheckCircleOutlineIcon sx={{ fontSize: 16 }} />}
      label={text}
      sx={{ bgcolor: '#E3F7EF', color: '#1F2937', '& .MuiChip-icon': { color: colors.successBright } }}
    />
  )
}

function TimeOnSite({ wo }: { wo: WorkOrder }) {
  if (!wo.checkIn) {
    return <Typography sx={{ color: colors.iconGray }}>The provider has not checked in.</Typography>
  }
  const end = wo.checkOut ?? new Date().toISOString()
  const onSite = minutesBetween(wo.checkIn, end)
  const planned = wo.schedule ? minutesBetween(wo.schedule.start, wo.schedule.end) : onSite
  const onTime =
    wo.schedule !== undefined &&
    minutesBetween(wo.schedule.start, wo.checkIn) <= ON_TIME_GRACE_MINUTES

  return (
    <Box>
      <Typography sx={{ mb: 1 }}>
        {formatDuration(onSite)} of {formatDuration(planned)} planned
      </Typography>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, (onSite / Math.max(planned, 1)) * 100)}
        sx={{ height: 8, borderRadius: 4, bgcolor: '#CBD3DE', '& .MuiLinearProgress-bar': { bgcolor: colors.successBright } }}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2 }}>
        <Box>
          {label('Check in')}
          <Typography sx={{ fontSize: 24, fontWeight: 300 }}>{formatTime(wo.checkIn)}</Typography>
        </Box>
        <ArrowForwardIcon sx={{ color: colors.iconGray }} />
        <Box>
          {label('Check out')}
          <Typography sx={{ fontSize: 24, fontWeight: 300 }}>
            {wo.checkOut ? formatTime(wo.checkOut) : '--'}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, mt: 2 }}>
        {!wo.checkOut && <Badge text="On Site" />}
        {onTime && <Badge text="On Time" />}
      </Box>
    </Box>
  )
}

function TotalCost({ wo }: { wo: WorkOrder }) {
  const quote = usePayQuote(wo.pay)
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Typography sx={{ fontSize: 18 }}>Total Cost</Typography>
        <Typography sx={{ fontSize: 18, fontWeight: 600 }} data-testid="total-cost">
          {quote.data ? formatMoney(quote.data.total) : quote.error ? 'Unavailable' : '...'}
        </Typography>
      </Box>
      {quote.data?.lines.map((l) => (
        <Typography key={l.label} sx={{ fontSize: 12, fontWeight: 700, mt: 1, textTransform: 'uppercase' }}>
          {l.label}
        </Typography>
      ))}
    </Box>
  )
}

interface Props {
  workOrder: WorkOrder
  onClose: () => void
}

/** DetailPanel is the right-hand summary of the selected work order. */
export function DetailPanel({ workOrder: wo, onClose }: Props) {
  return (
    <Card component="aside" aria-label={`Work order ${wo.id} summary`} sx={{ width: 340, flexShrink: 0, bgcolor: '#FFFFFF' }}>
      <Box sx={{ p: 2, bgcolor: colors.card }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontWeight: 700, color: colors.primary }}>WO {wo.id}</Typography>
          <StatusChip status={wo.status} />
          <Box sx={{ flexGrow: 1 }} />
          <IconButton size="small" aria-label="Close summary" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Typography sx={{ fontWeight: 600, mt: 1 }}>{wo.title}</Typography>
        <Typography variant="body2" sx={{ color: colors.iconGray }}>
          {wo.buyer} · {wo.location.city}, {wo.location.state}
        </Typography>
        {wo.provider && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            <Typography variant="body2">{wo.provider.name}</Typography>
            <ScoreBadge provider={wo.provider} />
          </Box>
        )}
        <Button component={RouterLink} to={`/work-orders/${wo.id}`} sx={{ mt: 1, px: 0 }}>
          Open work order
        </Button>
      </Box>
      {!wo.provider && ['Draft', 'Published', 'Routed'].includes(wo.status) && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <NearbyProviders workOrder={wo} />
          </Box>
        </>
      )}
      <Divider />
      <Box sx={{ p: 2 }}>
        <Box sx={{ mb: 1.5 }}>{label('Time on site')}</Box>
        <TimeOnSite wo={wo} />
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <TotalCost wo={wo} />
      </Box>
    </Card>
  )
}
