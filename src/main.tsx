import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import App from './ui/App'
import './ui/styles.css'
import { applyTheme, getThemeId } from './lib/themes'
import { applyColorMode, getColorMode } from './lib/colorMode'

applyTheme(getThemeId())
applyColorMode(getColorMode())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
