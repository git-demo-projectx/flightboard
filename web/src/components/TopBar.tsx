import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import HelpIcon from '@mui/icons-material/Help'
import MailIcon from '@mui/icons-material/Mail'
import NotificationsIcon from '@mui/icons-material/Notifications'
import SearchIcon from '@mui/icons-material/Search'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Mark } from './Mark'
import { colors } from '../theme'

const NAV = [
  { label: 'Work', to: '/' },
  { label: 'Schedule', to: '/schedule' },
  { label: 'Workforce', to: null },
  { label: 'Insights', to: null },
]

export function TopBar() {
  const { pathname } = useLocation()
  const workActive = pathname === '/' || pathname.startsWith('/work-orders')

  return (
    <AppBar position="sticky" sx={{ bgcolor: '#FFFFFF', borderBottom: `1px solid ${colors.border}` }}>
      <Toolbar variant="dense" sx={{ gap: 1, minHeight: 56 }}>
        <RouterLink to="/" aria-label="Flightboard home">
          <Mark />
        </RouterLink>
        <Typography sx={{ fontWeight: 700, color: colors.titleGray, ml: 1, mr: 2 }}>
          Flightboard
        </Typography>
        <IconButton component={RouterLink} to="/work-orders/new" aria-label="Create work order">
          <AddIcon />
        </IconButton>
        <IconButton aria-label="Search" disabled>
          <SearchIcon />
        </IconButton>
        <Box component="nav" sx={{ display: 'flex', alignSelf: 'stretch', ml: 1 }}>
          {NAV.map((item) => {
            const active = (item.label === 'Work' && workActive)
              || (item.label === 'Schedule' && pathname.startsWith('/schedule'))
            return (
              <Box
                key={item.label}
                component={item.to ? RouterLink : 'span'}
                to={item.to ?? undefined}
                aria-current={active ? 'page' : undefined}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  px: 1.5,
                  fontSize: 14,
                  fontWeight: active ? 700 : 500,
                  color: item.to ? '#2B3245' : '#8A93A6',
                  textDecoration: 'none',
                  borderBottom: '3px solid',
                  borderColor: active ? colors.orange : 'transparent',
                  cursor: item.to ? 'pointer' : 'default',
                }}
              >
                {item.label}
              </Box>
            )
          })}
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        <Typography sx={{ color: colors.titleGray, mr: 1 }}>$ 0.00</Typography>
        <IconButton aria-label="Help" sx={{ color: colors.iconGray }}>
          <HelpIcon />
        </IconButton>
        <IconButton aria-label="Messages" sx={{ color: colors.iconGray }}>
          <MailIcon />
        </IconButton>
        <IconButton aria-label="Notifications" sx={{ color: colors.iconGray }}>
          <NotificationsIcon />
        </IconButton>
        <Avatar sx={{ width: 32, height: 32, ml: 1, bgcolor: colors.tabSelected, color: colors.primary, fontSize: 14 }}>
          JB
        </Avatar>
      </Toolbar>
    </AppBar>
  )
}
