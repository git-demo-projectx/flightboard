import type { ExpenseStatus, Health, Status } from '../api/types'
import { colors } from '../theme'

export interface ChipStyle {
  label: string
  bg: string
  fg: string
  border?: string
}

export function expenseStatusChip(status: ExpenseStatus): ChipStyle {
  switch (status) {
    case 'Pending':
      return { label: 'Pending', bg: colors.reviewBg, fg: colors.reviewText }
    case 'Approved':
      return { label: 'Approved', bg: '#DDF3E8', fg: colors.success }
    case 'Rejected':
      return { label: 'Rejected', bg: colors.alertBg, fg: colors.alertText }
  }
}

/** statusChip returns the label and colours for a work order status chip. */
export function statusChip(status: Status): ChipStyle {
  switch (status) {
    case 'Draft':
      return { label: 'Draft', bg: '#E8EBF1', fg: colors.iconGray }
    case 'Published':
    case 'Routed':
      return { label: 'Published', bg: colors.success, fg: '#FFFFFF' }
    case 'Assigned':
      return { label: 'Assigned', bg: colors.primary, fg: '#FFFFFF' }
    case 'Work Done':
      return { label: 'Work Done', bg: colors.tabSelected, fg: colors.primaryDark }
    case 'Approved':
      return { label: 'Approved', bg: '#DDF3E8', fg: colors.success }
    case 'Paid':
      return { label: 'Paid', bg: '#DDF3E8', fg: colors.success, border: colors.success }
    case 'Cancelled':
      return { label: 'Cancelled', bg: '#FFFFFF', fg: colors.iconGray, border: colors.border }
  }
}

/** healthChip returns the label and colours for a health chip. */
export function healthChip(health: Health): ChipStyle {
  switch (health) {
    case 'Alert':
      return { label: 'Alert', bg: colors.alertBg, fg: colors.alertText }
    case 'Review':
      return { label: 'Review', bg: colors.reviewBg, fg: colors.reviewText }
    case 'On Track':
      return { label: 'On Track', bg: colors.card, fg: '#3A4255', border: '#9AA3B5' }
  }
}
