import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CircularProgress from '@mui/material/CircularProgress'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import { useAsync, useWeek } from '../../api/hooks'
import { PageHeader } from '../../components/PageHeader'
import { addDays, dayLabel, isISODate, weekRangeLabel, weekStart } from '../../lib/week'
import { colors } from '../../theme'
import { ScheduleCard } from './ScheduleCard'

export function SchedulePage() {
  const [params, setParams] = useSearchParams()
  const requestedStart = params.get('start')
  const start = requestedStart && isISODate(requestedStart) ? requestedStart : weekStart(new Date())
  const providerId = params.get('providerId') || ''
  const { data, error, loading } = useWeek(start, providerId || undefined)
  const { data: providers } = useAsync(api.listProviders, 'providers')

  function selectProvider(nextProviderId: string) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set('start', start)
      if (nextProviderId) next.set('providerId', nextProviderId)
      else next.delete('providerId')
      return next
    })
  }

  function selectWeek(nextStart: string) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set('start', nextStart)
      return next
    })
  }

  return (
    <>
      <Box sx={{ '& > div': { flexWrap: 'wrap' }, '& > div > div': { flexWrap: 'wrap' }, '& h1': { minWidth: 0 } }}>
        <PageHeader
          title={
            <>Schedule
              <Box component="span" sx={{ fontSize: 16, fontWeight: 400, color: colors.iconGray, ml: 1.5 }}>
                {weekRangeLabel(start)}
              </Box>
            </>
          }
          actions={
            <>
              <TextField
                select
                label="Provider"
                size="small"
                sx={{ minWidth: 220, bgcolor: '#FFFFFF' }}
                SelectProps={{ displayEmpty: true }}
                InputLabelProps={{ shrink: true }}
                value={providers?.some((provider) => provider.id === providerId) ? providerId : ''}
                onChange={(event) => selectProvider(event.target.value)}
              >
                <MenuItem value="">All providers</MenuItem>
                {providers?.map((provider) => (
                  <MenuItem key={provider.id} value={provider.id}>{provider.name}</MenuItem>
                ))}
              </TextField>
              <Button variant="outlined" startIcon={<ChevronLeftIcon />} onClick={() => selectWeek(addDays(start, -7))}>
                Previous week
              </Button>
              <Button variant="outlined" onClick={() => selectWeek(weekStart(new Date()))}>
                This week
              </Button>
              <Button variant="outlined" endIcon={<ChevronRightIcon />} onClick={() => selectWeek(addDays(start, 7))}>
                Next week
              </Button>
            </>
          }
        />
      </Box>
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {loading && !data && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        )}
        {error && <Alert severity="error">Could not load the schedule: {error.message}</Alert>}
        {data && !error && <>
          <Typography sx={{ fontSize: 13, color: colors.titleGray }}>
            {data.total} work {data.total === 1 ? 'order' : 'orders'}
            {data.unassigned > 0 && (
              <Box component="span" sx={{ fontWeight: 600, color: colors.alertText }}>
                {' \u00b7 '}{data.unassigned} unassigned
              </Box>
            )}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(150px, 1fr))', gap: 1.5, alignItems: 'start', overflowX: 'auto' }}>
            {data.days.map((day) => (
              <Card key={day.date} component="section" aria-label={dayLabel(day.date)}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, p: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: colors.titleGray }}>
                    {dayLabel(day.date)}
                  </Typography>
                  <Box sx={{ height: 22, minWidth: 22, px: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: colors.tabSelected, color: colors.primaryDark, fontSize: 12 }}>
                    {day.total}
                  </Box>
                </Box>
                <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {day.workOrders.map((workOrder) => <ScheduleCard key={workOrder.id} workOrder={workOrder} />)}
                  {day.workOrders.length === 0 && (
                    <Typography sx={{ color: colors.iconGray }}>No work orders.</Typography>
                  )}
                </Box>
              </Card>
            ))}
          </Box>
        </>}
      </Box>
    </>
  )
}
