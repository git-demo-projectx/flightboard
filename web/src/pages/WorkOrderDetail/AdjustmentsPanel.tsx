import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useAsync } from '../../api/hooks'
import type { Adjustment, AdjustmentKind, WorkOrder } from '../../api/types'
import { formatMoney } from '../../lib/format'
import { canAdjustPay } from '../../lib/status'

export function AdjustmentsPanel({ wo, onChange }: {
  wo: WorkOrder
  onChange: (adjustments: Adjustment[]) => void
}) {
  const { data, error, loading, setData } = useAsync(() => api.listAdjustments(wo.id), `adjustments-${wo.id}`)
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<AdjustmentKind>('Bonus')
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const adjustments = data ?? []
  const editable = canAdjustPay(wo.status)
  const atLimit = adjustments.length >= 5
  const valid = reason.trim().length >= 1 && reason.trim().length <= 120
    && Number.isFinite(Number(amount)) && Number(amount) >= 0.01 && Number(amount) <= 1000

  useEffect(() => {
    if (data) onChange(data)
  }, [data, onChange])

  async function save() {
    if (!valid || saving || removing || !editable || atLimit) return
    setSaving(true)
    setAddError(null)
    try {
      const adjustment = await api.addAdjustment(wo.id, {
        kind, reason: reason.trim(), amountCents: Math.round(Number(amount) * 100),
      })
      setData([...adjustments, adjustment])
      setOpen(false)
    } catch (err) {
      setAddError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (removing || saving || !editable) return
    setRemoving(true)
    setRemoveError(null)
    try {
      await api.removeAdjustment(wo.id, id)
      setData(adjustments.filter((adjustment) => adjustment.id !== id))
    } catch (err) {
      setRemoveError((err as Error).message)
    } finally {
      setRemoving(false)
    }
  }

  if (loading) return <Typography color="text.secondary">Loading adjustments...</Typography>
  if (error) return <Alert severity="warning">Adjustments unavailable: {error.message}</Alert>

  return (
    <>
      {adjustments.length === 0 && <Typography color="text.secondary">No adjustments.</Typography>}
      {adjustments.map((adjustment) => (
        <Box key={adjustment.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600 }}>{adjustment.kind}</Typography>
            <Typography sx={{ overflowWrap: 'anywhere' }}>{adjustment.reason}</Typography>
          </Box>
          <Typography sx={{ flexShrink: 0 }}>
            {adjustment.kind === 'Bonus' ? '+' : '-'}{formatMoney(adjustment.amountCents / 100)}
          </Typography>
          {editable && (
            <Tooltip title={`Remove adjustment ${adjustment.reason}`}>
              <span>
                <IconButton aria-label={`Remove adjustment ${adjustment.reason}`} disabled={removing || saving} onClick={() => remove(adjustment.id)}>
                  <DeleteOutlineIcon />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Box>
      ))}
      {removeError && <Alert severity="error" sx={{ mt: 1 }}>{removeError}</Alert>}
      {atLimit && <Typography color="text.secondary" sx={{ mt: 1 }}>A work order can have at most 5 adjustments.</Typography>}
      {editable && (
        <Button variant="outlined" startIcon={<AddIcon />} disabled={atLimit || saving || removing} sx={{ mt: 2 }} onClick={() => {
          setKind('Bonus'); setReason(''); setAmount(''); setAddError(null); setOpen(true)
        }}>Add adjustment</Button>
      )}
      <Dialog open={open && editable} onClose={() => { if (!saving) setOpen(false) }} fullWidth maxWidth="sm" aria-labelledby="add-adjustment-title">
        <DialogTitle id="add-adjustment-title">Add adjustment</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2 }}>
          <TextField select label="Kind" value={kind} disabled={saving} onChange={(event) => setKind(event.target.value as AdjustmentKind)} fullWidth sx={{ mt: 1 }}>
            <MenuItem value="Bonus">Bonus</MenuItem>
            <MenuItem value="Deduction">Deduction</MenuItem>
          </TextField>
          <TextField label="Reason" value={reason} disabled={saving} onChange={(event) => setReason(event.target.value)} fullWidth />
          <TextField label="Amount ($)" type="number" value={amount} disabled={saving} onChange={(event) => setAmount(event.target.value)} inputProps={{ min: 0.01, max: 1000, step: 0.01 }} fullWidth />
          {addError && <Alert severity="error">{addError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!valid || saving || removing || atLimit} onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
