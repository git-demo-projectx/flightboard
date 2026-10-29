import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import type { NewWorkOrder } from '../../api/types'
import { PageHeader } from '../../components/PageHeader'
import { canPublish, canSaveDraft, emptyForm, toNewWorkOrder, type FormState } from '../../lib/workOrderForm'
import { SectionNav } from './SectionNav'
import { BasicsSection, LocationSection, PaySection, ScheduleSection, TasksSection } from './sections'

/** NewWorkOrderPage creates a work order as a Draft or publishes it. */
export function NewWorkOrderPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onChange = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  async function save(status: NewWorkOrder['status']) {
    setSaving(true)
    setError(null)
    try {
      const created = await api.createWorkOrder(toNewWorkOrder(form, status))
      navigate(`/work-orders/${created.id}`)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="New Work Order"
        actions={
          <>
            <Button variant="outlined" disabled={saving || !canSaveDraft(form)} onClick={() => save('Draft')}>
              Save As Draft
            </Button>
            <Button variant="contained" disabled={saving || !canPublish(form)} onClick={() => save('Published')}>
              Publish
            </Button>
          </>
        }
      />
      <Box sx={{ p: 3, display: 'flex', gap: 3, alignItems: 'flex-start', maxWidth: 1200, mx: 'auto' }}>
        <SectionNav form={form} />
        <Box sx={{ flexGrow: 1, display: 'grid', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <BasicsSection form={form} onChange={onChange} />
          <ScheduleSection form={form} onChange={onChange} />
          <LocationSection form={form} onChange={onChange} />
          <PaySection form={form} onChange={onChange} />
          <TasksSection form={form} onChange={onChange} />
        </Box>
      </Box>
    </>
  )
}
