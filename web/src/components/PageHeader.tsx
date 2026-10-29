import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { colors } from '../theme'

/** PageHeader is the white band under the top bar with the page title and actions. */
export function PageHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <Box
      sx={{
        bgcolor: '#FFFFFF',
        borderBottom: `1px solid ${colors.border}`,
        px: 3,
        py: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Typography variant="h1" sx={{ flexGrow: 1 }}>
        {title}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>{actions}</Box>
    </Box>
  )
}
