import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CircularProgress from '@mui/material/CircularProgress'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import SearchIcon from '@mui/icons-material/Search'
import { useMemo, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { useWorkOrders } from '../../api/hooks'
import type { WorkOrder } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { DEFAULT_TAB_ID, findTab, tabCounts } from '../../lib/tabs'
import { DetailPanel } from './DetailPanel'
import { StatusTabs } from './StatusTabs'
import { WorkOrderTable } from './WorkOrderTable'

function matchesSearch(wo: WorkOrder, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [String(wo.id), wo.title, wo.typeOfWork, wo.buyer, wo.provider?.name ?? '', wo.location.city]
    .some((field) => field.toLowerCase().includes(q))
}

/** FlightboardPage is the home screen: every work order, by status tab. */
export function FlightboardPage() {
  const { data, error, loading } = useWorkOrders()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const tab = findTab(params.get('tab') ?? DEFAULT_TAB_ID)
  const searched = useMemo(() => (data ?? []).filter((wo) => matchesSearch(wo, query)), [data, query])
  const counts = useMemo(() => tabCounts(searched), [searched])
  const rows = useMemo(() => searched.filter(tab.matches), [searched, tab])
  const selected = rows.find((wo) => wo.id === selectedId) ?? null

  return (
    <>
      <PageHeader
        title="Flightboard"
        actions={
          <>
            <Button variant="outlined" component={RouterLink} to="/work-orders/approvals">
              Approvals
            </Button>
            <Button variant="outlined" component={RouterLink} to="/work-orders/pay-run">
              Pay run
            </Button>
            <Button variant="outlined" component={RouterLink} to="/work-orders/new">
              Create work order
            </Button>
          </>
        }
      />
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Card sx={{ p: 1.5 }}>
          <TextField
            placeholder="Search by ID, title, type of work, buyer, provider or city"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{ maxWidth: 480, bgcolor: '#FFFFFF' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            inputProps={{ 'aria-label': 'Search work orders' }}
          />
        </Card>
        <StatusTabs
          value={tab.id}
          counts={counts}
          onChange={(id) => {
            setSelectedId(null)
            setParams({ tab: id })
          }}
        />
        {error && <Alert severity="error">Could not load work orders: {error.message}</Alert>}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <Card sx={{ flexGrow: 1, overflowX: 'auto' }}>
            {loading ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <WorkOrderTable
                workOrders={rows}
                selectedId={selected?.id ?? null}
                onSelect={(wo) => setSelectedId(wo.id)}
              />
            )}
          </Card>
          {selected && <DetailPanel workOrder={selected} onClose={() => setSelectedId(null)} />}
        </Box>
      </Box>
    </>
  )
}
