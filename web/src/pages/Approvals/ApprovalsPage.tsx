import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { api } from '../../api/client'
import { useWorkOrders } from '../../api/hooks'
import type { WorkOrder } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { approvableWorkOrders, approveButtonLabel } from '../../lib/approvals'
import { formatPay, formatTime } from '../../lib/format'
import { workOrderCount } from '../../lib/payRun'
import { colors } from '../../theme'

interface ApprovalResult {
  count: number
  failures: { id: number; message: string }[]
}

function ApprovalsTable({ orders, onStart, onFinished }: {
  orders: WorkOrder[]
  onStart: () => void
  onFinished: (result: ApprovalResult) => void
}) {
  const ids = orders.map((wo) => wo.id)
  const [selected, setSelected] = useState(() => new Set(ids))
  const [running, setRunning] = useState(false)
  const allSelected = selected.size === orders.length

  async function approve() {
    if (running || !selected.size) return
    setRunning(true)
    onStart()
    const result: ApprovalResult = { count: 0, failures: [] }
    for (const wo of orders.filter((wo) => selected.has(wo.id))) {
      try {
        await api.setStatus(wo.id, 'Approved')
        result.count += 1
      } catch (err) {
        result.failures.push({ id: wo.id, message: err instanceof Error ? err.message : String(err) })
      }
    }
    onFinished(result)
    setRunning(false)
  }

  return (
    <Box>
      <TableContainer>
        <Table size="small" aria-label="Work Done work orders">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  inputProps={{ 'aria-label': 'Select all' }}
                  checked={allSelected}
                  indeterminate={selected.size > 0 && !allSelected}
                  disabled={running}
                  onChange={() => setSelected(new Set(allSelected ? [] : ids))}
                />
              </TableCell>
              {['ID', 'Title', 'Provider', 'Check out'].map((label) => (
                <TableCell key={label}>{label}</TableCell>
              ))}
              <TableCell align="right">Pay</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.map((wo) => (
              <TableRow key={wo.id}>
                <TableCell padding="checkbox">
                  <Checkbox
                    inputProps={{ 'aria-label': `Select WO ${wo.id}` }}
                    checked={selected.has(wo.id)}
                    disabled={running}
                    onChange={() => setSelected((current) => {
                      const next = new Set(current)
                      if (next.has(wo.id)) next.delete(wo.id)
                      else next.add(wo.id)
                      return next
                    })}
                  />
                </TableCell>
                <TableCell>
                  <Link component={RouterLink} to={`/work-orders/${wo.id}`} underline="hover" sx={{ fontWeight: 600 }}>
                    {wo.id}
                  </Link>
                </TableCell>
                <TableCell>
                  <Typography sx={{ color: colors.primary, fontSize: 13, fontWeight: 600 }}>{wo.title}</Typography>
                  <Typography variant="caption" sx={{ color: colors.iconGray, display: 'block' }}>
                    {wo.typeOfWork} {'\u00b7'} {wo.buyer}
                  </Typography>
                </TableCell>
                <TableCell>{wo.provider?.name ?? 'Unassigned'}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{wo.checkOut ? formatTime(wo.checkOut) : '--'}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{formatPay(wo.pay)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ borderTop: `1px solid ${colors.border}`, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Typography sx={{ fontSize: 13 }}>{selected.size} of {orders.length} selected</Typography>
        <Button variant="contained" disabled={!selected.size || running} onClick={approve}>
          {approveButtonLabel(selected.size)}
        </Button>
      </Box>
    </Box>
  )
}

export function ApprovalsPage() {
  const { data, error, loading, reload } = useWorkOrders()
  const [result, setResult] = useState<ApprovalResult | null>(null)
  const orders = approvableWorkOrders(data ?? [])

  return (
    <>
      <PageHeader
        title="Approvals"
        actions={<Button variant="outlined" component={RouterLink} to="/">Back to Flightboard</Button>}
      />
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography sx={{ fontSize: 13, color: colors.titleGray }}>
          Work Done work orders waiting for approval.
        </Typography>
        {!!result?.count && <Alert severity="success">Approved {workOrderCount(result.count)}</Alert>}
        {!!result?.failures.length && (
          <Alert severity="error">
            Could not approve:{' '}
            {result.failures.map(({ id, message }) => <Box key={id}>WO {id}: {message}</Box>)}
          </Alert>
        )}
        {error ? (
          <Alert severity="error">Could not load work orders: {error.message}</Alert>
        ) : loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>
        ) : orders.length ? (
          <ApprovalsTable
            key={orders.map((wo) => wo.id).join(',')}
            orders={orders}
            onStart={() => setResult(null)}
            onFinished={(next) => { setResult(next); reload() }}
          />
        ) : (
          <Typography sx={{ p: 4, textAlign: 'center', color: colors.iconGray }}>
            No work orders are waiting for approval.
          </Typography>
        )}
      </Box>
    </>
  )
}
