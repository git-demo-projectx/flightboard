import Card from '@mui/material/Card'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import CheckIcon from '@mui/icons-material/Check'
import { SECTIONS, isSectionComplete, type FormState } from '../../lib/workOrderForm'
import { colors } from '../../theme'

/** SectionNav lists the form sections with a green check on each complete one. */
export function SectionNav({ form }: { form: FormState }) {
  return (
    <Card component="nav" aria-label="Form sections" sx={{ width: 240, flexShrink: 0, position: 'sticky', top: 72 }}>
      <List disablePadding>
        {SECTIONS.map((s) => {
          const complete = isSectionComplete(s.id, form)
          return (
            <ListItemButton
              key={s.id}
              component="a"
              href={`#section-${s.id}`}
              divider
              aria-label={`${s.label}${complete ? ' (complete)' : ''}`}
            >
              <ListItemText primary={s.label} primaryTypographyProps={{ color: colors.titleGray }} />
              <ListItemIcon sx={{ minWidth: 0 }}>
                {complete && <CheckIcon sx={{ color: colors.successBright }} />}
              </ListItemIcon>
            </ListItemButton>
          )
        })}
      </List>
    </Card>
  )
}
