import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useExpenses } from '../../api/hooks'
import type { WorkOrder } from '../../api/types'
import { ExpenseStatusChip } from '../../components/Chips'
import { formatCents } from '../../lib/format'

export function ExpenseList({ workOrder }: { workOrder: WorkOrder }) {
  const { data, error, loading } = useExpenses(workOrder.id)

  return (
    <Box component="section" aria-label="Expenses">
      {loading ? (
        <Typography>Loading expenses...</Typography>
      ) : error ? (
        <Typography color="text.secondary">Could not load expenses: {error.message}</Typography>
      ) : data?.length ? (
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
          {data.map((expense) => (
            <Box component="li" key={expense.id} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <Typography>{expense.description}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
                <Typography variant="body2" color="text.secondary">{expense.category}</Typography>
                <Typography variant="body2">{formatCents(expense.amountCents)}</Typography>
                <ExpenseStatusChip status={expense.status} />
              </Box>
              {expense.status === 'Rejected' && expense.reason && (
                <Typography variant="body2" sx={{ mt: 0.5 }}>Reason: {expense.reason}</Typography>
              )}
            </Box>
          ))}
        </Box>
      ) : (
        <Typography>No expenses yet.</Typography>
      )}
    </Box>
  )
}
