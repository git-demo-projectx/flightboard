import { ThemeProvider } from '@mui/material/styles'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ROUTER_FUTURE } from '../router'
import { theme } from '../theme'

/** renderAt renders ui at a route path, inside the theme and a router. */
export function renderAt(ui: ReactElement, { path = '/', url = '/' } = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[url]} future={ROUTER_FUTURE}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="*" element={<div>other page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}
