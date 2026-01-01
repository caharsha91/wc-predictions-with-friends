import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import App from './ui/App'
import { ThemeProvider } from './theme/ThemeProvider'
import { applyInitialTheme } from './theme/themeState'
import './styles/theme.css'
import './styles/themes.css'
import './styles/global.css'
import './ui/styles.css'
document.documentElement.dataset.density = 'compact'
applyInitialTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </ThemeProvider>
  </React.StrictMode>
)
