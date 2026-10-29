import { alpha, createTheme } from '@mui/material/styles'

// Colours from the design tokens. Orange (secondary) is for the mark,
// the active nav underline, and attention accents only.
export const colors = {
  primary: '#1B4AB2',
  primaryDark: '#001E78',
  orange: '#FF4910',
  success: '#038350',
  successBright: '#00AE7D',
  canvas: '#E4E9EF',
  card: '#F3F4F8',
  border: '#D9DEE7',
  tabBar: '#F8FBFF',
  tabSelected: '#D6DCF2',
  iconGray: '#616B84',
  titleGray: '#4E5A72',
  routed: '#91A5EC',
  reviewBg: '#D8F6FE',
  reviewText: '#0E6A86',
  alertBg: '#F6D2BC',
  alertText: '#C2410C',
  alertRow: alpha('#F6D2BC', 0.45),
} as const

export const theme = createTheme({
  palette: {
    primary: { main: colors.primary, dark: colors.primaryDark },
    secondary: { main: colors.orange },
    success: { main: colors.success },
    warning: { main: '#D7692E', light: colors.alertBg },
    info: { main: colors.reviewText, light: colors.reviewBg },
    background: { default: colors.canvas, paper: colors.card },
    divider: colors.border,
  },
  shape: { borderRadius: 4 },
  typography: {
    fontFamily: '"Open Sans", "Helvetica Neue", sans-serif',
    fontSize: 13,
    h1: { fontSize: 28, fontWeight: 300, color: colors.titleGray },
    h2: { fontSize: 22, fontWeight: 300, color: colors.titleGray },
    h3: { fontSize: 16, fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiAppBar: { defaultProps: { elevation: 0, color: 'inherit' } },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { rounded: { borderRadius: 8 } },
    },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: { root: { borderColor: colors.border, borderRadius: 8 } },
    },
    MuiButton: { defaultProps: { disableElevation: true, size: 'small' } },
    MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 4, height: 22, fontWeight: 600, fontSize: 12 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 600, color: colors.iconGray, whiteSpace: 'nowrap' },
        sizeSmall: { paddingTop: 8, paddingBottom: 8 },
      },
    },
    MuiTab: {
      styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } },
    },
  },
})
