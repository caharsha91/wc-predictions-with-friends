import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import App from './ui/App'
import { ThemeProvider } from './theme/ThemeProvider'
import { applyInitialTheme } from './theme/themeState'
import './styles/index.css'
import './ui/styles.css'
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
