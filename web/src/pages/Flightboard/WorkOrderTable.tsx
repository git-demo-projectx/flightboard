import IconButton from '@mui/material/IconButton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import SettingsIcon from '@mui/icons-material/Settings'
import type { WorkOrder } from '../../api/types'
import { colors } from '../../theme'
import { COLUMNS } from './columns'

interface Props {
  workOrders: WorkOrder[]
  selectedId: number | null
  onSelect: (wo: WorkOrder) => void
}

function rowBackground(wo: WorkOrder, selected: boolean): string | undefined {
  if (selected) return colors.tabSelected
  if (wo.health === 'Alert') return colors.alertRow
  return undefined
}

/** WorkOrderTable is the dense work order table on the Flightboard. */
export function WorkOrderTable({ workOrders, selectedId, onSelect }: Props) {
  return (
    <Table size="small" aria-label="Work orders">
      <TableHead>
        <TableRow>
          {COLUMNS.map((c) => (
            <TableCell key={c.id}>{c.label}</TableCell>
          ))}
          <TableCell align="right" padding="checkbox">
            <IconButton size="small" aria-label="Column settings" disabled>
              <SettingsIcon fontSize="small" />
            </IconButton>
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {workOrders.map((wo) => {
          const selected = wo.id === selectedId
          return (
            <TableRow
              key={wo.id}
              hover
              selected={selected}
              onClick={() => onSelect(wo)}
              data-health={wo.health}
              sx={{ cursor: 'pointer', bgcolor: rowBackground(wo, selected) }}
            >
              {COLUMNS.map((c) => (
                <TableCell key={c.id} sx={c.nowrap ? { whiteSpace: 'nowrap' } : undefined}>
                  {c.render(wo)}
                </TableCell>
              ))}
              <TableCell />
            </TableRow>
          )
        })}
        {workOrders.length === 0 && (
          <TableRow>
            <TableCell colSpan={COLUMNS.length + 1}>
              <Typography sx={{ py: 4, textAlign: 'center', color: colors.iconGray }}>
                No work orders in this tab.
              </Typography>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
