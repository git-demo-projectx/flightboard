import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import type { WeekWorkOrder } from '../../api/types'
import { HealthChip, StatusChip } from '../../components/Chips'
import { formatTime } from '../../lib/format'
import { colors } from '../../theme'

export function ScheduleCard({ workOrder }: { workOrder: WeekWorkOrder }) {
  const { id, title, status, health, start, end, location, provider } = workOrder

  return (
    <Card
      component={RouterLink}
      to={`/work-orders/${id}`}
      aria-label={`WO ${id} ${title}`}
      data-unassigned={provider ? 'false' : 'true'}
      sx={{
        display: 'block',
        bgcolor: '#FFFFFF',
        borderRadius: '6px',
        borderColor: colors.border,
        borderLeft: `3px solid ${provider ? colors.border : colors.orange}`,
        px: 1.25,
        py: 1,
        textDecoration: 'none',
      }}
    >
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.iconGray }}>
        {formatTime(start)} - {formatTime(end)}
      </Typography>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.primary }}>
        WO {id}
      </Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: colors.primary, overflowWrap: 'anywhere' }}>
        {title}
      </Typography>
      <Typography sx={{ fontSize: 13, fontWeight: provider ? 400 : 600, color: provider ? 'text.primary' : colors.alertText, overflowWrap: 'anywhere' }}>
        {provider ? provider.name : 'Unassigned'}
      </Typography>
      <Typography variant="caption" sx={{ color: colors.iconGray, overflowWrap: 'anywhere' }}>
        {location.city}, {location.state}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        <StatusChip status={status} />
        {health !== 'On Track' && <HealthChip health={health} />}
      </Box>
    </Card>
  )
}
