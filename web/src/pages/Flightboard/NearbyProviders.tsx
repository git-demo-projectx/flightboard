import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useNearbyProviders } from '../../api/hooks'
import type { WorkOrder } from '../../api/types'
import { ScoreBadge } from '../../components/Chips'
import { colors } from '../../theme'

export function NearbyProviders({ workOrder }: { workOrder: WorkOrder }) {
  const { data, error, loading } = useNearbyProviders(workOrder.id)

  return (
    <Box component="section" aria-label="Nearby providers">
      <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 0, textTransform: 'uppercase', mb: 1.5 }}>
        Nearby providers
      </Typography>
      {loading ? (
        <Typography>Finding nearby providers...</Typography>
      ) : error ? (
        <Typography sx={{ color: colors.iconGray }}>
          Could not load nearby providers: {error.message}
        </Typography>
      ) : data?.length ? (
        data.map((provider) => (
          <Box key={provider.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{provider.name}</Typography>
            <ScoreBadge provider={provider} />
            <Typography variant="body2" sx={{ color: colors.iconGray, overflowWrap: 'anywhere' }}>{provider.city}</Typography>
          </Box>
        ))
      ) : (
        <Typography>No providers in {workOrder.location.state}.</Typography>
      )}
    </Box>
  )
}
