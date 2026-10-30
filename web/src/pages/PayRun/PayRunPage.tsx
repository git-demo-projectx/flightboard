import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
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
import { api, payApi } from '../../api/client'
import { useAsync, useWorkOrders } from '../../api/hooks'
import type { PayRunQuote, PayRunQuoteItem, PayRunResult, WorkOrder } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { formatDate, formatMoney, formatSignedMoney } from '../../lib/format'
import { payableWorkOrders, payButtonLabel, selectedTotal, toQuoteItems, workOrderCount } from '../../lib/payRun'
import { colors } from '../../theme'

const maxPayRunOrders = 50

async function loadQuotes(items: PayRunQuoteItem[]): Promise<PayRunQuote> {
  const quoted: PayRunQuote['items'] = []
  for (let offset = 0; offset < items.length; offset += 100) {
    const batch = await payApi.quotes(items.slice(offset, offset + 100))
    quoted.push(...batch.items)
  }
  return {
    items: quoted,
    count: quoted.length,
    total: quoted.reduce((cents, item) => cents + Math.round(item.total * 100), 0) / 100,
  }
}

function PayRunTable({ payable, onPaid }: {
  payable: WorkOrder[]
  onPaid: (result: PayRunResult, total: number) => void
}) {
  const ids = payable.map((wo) => wo.id)
  const items = toQuoteItems(payable)
  const [selected, setSelected] = useState(() => new Set(ids))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const { data: quote, error, loading } = useAsync(
    () => loadQuotes(items),
    JSON.stringify(items),
  )
  const allSelected = selected.size === payable.length
  const selectionTooLarge = selected.size > maxPayRunOrders
  const paymentDisabled = !selected.size || selectionTooLarge || loading || !!error || !quote || running
  const total = quote ? selectedTotal(quote, selected) : 0
  const selectedOrders = payable.filter((wo) => selected.has(wo.id))
  const moneyText = (amount?: number, format = formatMoney) =>
    loading ? '...' : error || amount === undefined ? '--' : format(amount)

  async function markAsPaid() {
    if (paymentDisabled) return
    setRunning(true)
    setRunError(null)
    try {
      const result = await api.payRun(selectedOrders.map((wo) => wo.id))
      setDialogOpen(false)
      onPaid(result, total)
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      {error && <Alert severity="warning">Pay service unavailable: {error.message}</Alert>}
      {selectionTooLarge && <Alert severity="warning">A pay run can include at most {maxPayRunOrders} work orders.</Alert>}
      <Card>
        <TableContainer>
          <Table size="small" aria-label="Approved work orders">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    inputProps={{ 'aria-label': 'Select all' }}
                    checked={allSelected}
                    indeterminate={selected.size > 0 && !allSelected}
                    onChange={() => setSelected(new Set(allSelected ? [] : ids))}
                  />
                </TableCell>
                {['ID', 'Title', 'Provider', 'Schedule'].map((label) => (
                  <TableCell key={label}>{label}</TableCell>
                ))}
                {['Labor', 'Expenses', 'Adjustments', 'Total'].map((label) => (
                  <TableCell key={label} align="right">{label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {payable.map((wo) => {
                const line = quote?.items.find((item) => item.id === wo.id)
                return (
                  <TableRow key={wo.id}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        inputProps={{ 'aria-label': `Select WO ${wo.id}` }}
                        checked={selected.has(wo.id)}
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
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {wo.schedule ? formatDate(wo.schedule.start) : 'Not scheduled'}
                    </TableCell>
                    <TableCell align="right">{moneyText(line?.labor)}</TableCell>
                    <TableCell align="right">{moneyText(line?.expenses)}</TableCell>
                    <TableCell align="right">{moneyText(line?.adjustments, formatSignedMoney)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{moneyText(line?.total)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ bgcolor: '#FFFFFF', borderTop: `1px solid ${colors.border}`, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Typography sx={{ fontSize: 13 }}>{selected.size} of {payable.length} selected</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography sx={{ fontSize: 18 }}>Total</Typography>
            <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
              {moneyText(quote ? selectedTotal(quote, selected) : undefined)}
            </Typography>
            <Button
              variant="contained"
              disabled={paymentDisabled}
              onClick={() => { setRunError(null); setDialogOpen(true) }}
            >
              {payButtonLabel(selected.size)}
            </Button>
          </Box>
        </Box>
      </Card>
      <Dialog
        open={dialogOpen}
        onClose={() => { if (!running) setDialogOpen(false) }}
        maxWidth="sm"
        fullWidth
        aria-labelledby="pay-run-dialog-title"
      >
        <DialogTitle id="pay-run-dialog-title">Mark {workOrderCount(selected.size)} as Paid?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Each work order moves to Paid. You cannot undo this.
          </Typography>
          {dialogOpen && selectedOrders.map((wo) => (
            <Box key={wo.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr auto', sm: 'auto 1fr auto' }, gap: 1, mb: 2, alignItems: 'start' }}>
              <Typography sx={{ color: colors.primary, fontWeight: 600 }}>WO {wo.id}</Typography>
              <Typography sx={{ gridColumn: { xs: 1, sm: 'auto' }, overflowWrap: 'anywhere' }}>{wo.title}</Typography>
              <Typography sx={{ gridColumn: { xs: 2, sm: 'auto' }, gridRow: { xs: '1 / span 2', sm: 'auto' }, textAlign: 'right' }}>
                {formatMoney(quote?.items.find((item) => item.id === wo.id)?.total ?? 0)}
              </Typography>
            </Box>
          ))}
          <Divider />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
            <Typography sx={{ fontWeight: 600 }}>Total</Typography>
            <Typography sx={{ fontWeight: 600 }}>{formatMoney(total)}</Typography>
          </Box>
          {runError && <Alert severity="error" sx={{ mt: 2 }}>{runError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button disabled={running} onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={paymentDisabled} onClick={markAsPaid}>Mark as Paid</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export function PayRunPage() {
  const { data, error, loading, reload } = useWorkOrders()
  const [success, setSuccess] = useState<string | null>(null)
  const payable = payableWorkOrders(data ?? [])

  return (
    <>
      <PageHeader
        title="Pay run"
        actions={
          <Button variant="outlined" component={RouterLink} to="/">Back to Flightboard</Button>
        }
      />
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography sx={{ fontSize: 13, color: colors.titleGray }}>
          Approved work orders, with totals from the pay service.
        </Typography>
        {success && <Alert severity="success">{success}</Alert>}
        {error ? (
          <Alert severity="error">Could not load work orders: {error.message}</Alert>
        ) : loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>
        ) : payable.length ? (
          <PayRunTable
            key={payable.map((wo) => wo.id).join(',')}
            payable={payable}
            onPaid={(result, total) => {
              setSuccess(`Paid ${workOrderCount(result.count)} \u00b7 ${formatMoney(total)}`)
              reload()
            }}
          />
        ) : (
          <Card sx={{ p: 4, textAlign: 'center', color: colors.iconGray }}>
            No approved work orders to pay.
          </Card>
        )}
      </Box>
    </>
  )
}
