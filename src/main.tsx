import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import App from './ui/App'
import './ui/styles.css'
import { applyTheme, getThemeId } from './lib/themes'
import { applyColorMode, getColorMode } from './lib/colorMode'
import { applyListDensity, getListDensity } from './lib/listDensity'

applyTheme(getThemeId())
applyColorMode(getColorMode())
applyListDensity(getListDensity())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
