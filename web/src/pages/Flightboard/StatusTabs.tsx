import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import { TABS } from '../../lib/tabs'
import { colors } from '../../theme'

interface Props {
  value: string
  counts: Record<string, number>
  onChange: (tabId: string) => void
}

/** StatusTabs is the strip of status tabs with counts above the table. */
export function StatusTabs({ value, counts, onChange }: Props) {
  return (
    <Tabs
      value={value}
      onChange={(_, v: string) => onChange(v)}
      variant="scrollable"
      aria-label="Work order status"
      TabIndicatorProps={{ sx: { display: 'none' } }}
      sx={{
        bgcolor: colors.tabBar,
        borderRadius: 2,
        border: `1px solid ${colors.border}`,
        '& .MuiTab-root': {
          flex: 1,
          color: colors.titleGray,
          borderRight: `1px solid ${colors.border}`,
        },
        '& .MuiTab-root:last-of-type': { borderRight: 'none' },
        '& .Mui-selected': { bgcolor: colors.tabSelected, color: `${colors.primaryDark} !important` },
      }}
    >
      {TABS.map((t) => (
        <Tab key={t.id} value={t.id} label={`${t.label} (${counts[t.id] ?? 0})`} />
      ))}
    </Tabs>
  )
}
