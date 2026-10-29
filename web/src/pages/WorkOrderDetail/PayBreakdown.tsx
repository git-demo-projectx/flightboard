import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import { usePayQuote } from '../../api/hooks'
import type { Pay, PayType } from '../../api/types'
import { formatMoney, PAY_TYPE_LABELS } from '../../lib/format'

/** Pay types the detail page can break down. */
const BREAKDOWN_TYPES: PayType[] = ['Fixed', 'Hourly']

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
      <Typography sx={{ fontWeight: strong ? 700 : 400 }}>{label}</Typography>
      <Typography sx={{ fontWeight: strong ? 700 : 400 }}>{value}</Typography>
    </Box>
  )
}

function termsRows(pay: Pay) {
  switch (pay.type) {
    case 'Fixed':
      return <Row label="Fixed amount" value={formatMoney(pay.rate)} />
    case 'Hourly':
      return (
        <>
          <Row label="Rate" value={`${formatMoney(pay.rate)} / hr`} />
          <Row label="Hours" value={String(pay.hours ?? 0)} />
        </>
      )
    default:
      return null
  }
}

function Quote({ pay }: { pay: Pay }) {
  const quote = usePayQuote(pay)
  if (quote.error) {
    return <Alert severity="warning">Pay service unavailable: {quote.error.message}</Alert>
  }
  if (!quote.data) {
    return <Typography color="text.secondary">Calculating...</Typography>
  }
  return (
    <>
      {quote.data.lines.map((l) => (
        <Row key={l.label} label={l.label} value={formatMoney(l.amount)} />
      ))}
      <Divider sx={{ my: 1 }} />
      <Row label="Total Cost" value={formatMoney(quote.data.total)} strong />
    </>
  )
}

/** PayBreakdown shows pay terms and the pay service's quote for a work order. */
export function PayBreakdown({ pay }: { pay: Pay }) {
  if (!BREAKDOWN_TYPES.includes(pay.type)) {
    return (
      <Typography color="text.secondary">
        Pay breakdown is not available for {PAY_TYPE_LABELS[pay.type]} pay.
      </Typography>
    )
  }
  return (
    <Box>
      <Row label="Pay type" value={PAY_TYPE_LABELS[pay.type]} />
      {termsRows(pay)}
      <Divider sx={{ my: 1 }} />
      <Quote pay={pay} />
    </Box>
  )
}
