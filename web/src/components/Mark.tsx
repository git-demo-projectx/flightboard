import Box from '@mui/material/Box'
import { colors } from '../theme'

/** Mark is the Flightboard logo: a plain orange square. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <Box
      aria-label="Flightboard"
      role="img"
      sx={{ width: size, height: size, borderRadius: '6px', bgcolor: colors.orange, flexShrink: 0 }}
    />
  )
}
