import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Typography from '@mui/material/Typography'
import { TASK_GROUPS, type Task } from '../../api/types'

interface Props {
  tasks: Task[]
  disabled?: boolean
  onToggle: (task: Task, done: boolean) => void
}

/** TaskList shows tasks grouped Prep / On Site / Post with checkboxes. */
export function TaskList({ tasks, disabled, onToggle }: Props) {
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      {TASK_GROUPS.map((group) => {
        const inGroup = tasks.filter((t) => t.group === group)
        return (
          <Box key={group} component="section" aria-label={group}>
            <Typography variant="h3" sx={{ mb: 0.5 }}>
              {group}
            </Typography>
            {inGroup.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No tasks.
              </Typography>
            )}
            {inGroup.map((t) => (
              <Box key={t.id} sx={{ bgcolor: '#E9ECF2', borderRadius: 1, px: 1, mb: 0.5 }}>
                <FormControlLabel
                  label={t.title}
                  disabled={disabled}
                  control={<Checkbox size="small" checked={t.done} onChange={(e) => onToggle(t, e.target.checked)} />}
                  sx={{ width: '100%', '& .MuiFormControlLabel-label': { fontWeight: 600 } }}
                />
              </Box>
            ))}
          </Box>
        )
      })}
    </Box>
  )
}
