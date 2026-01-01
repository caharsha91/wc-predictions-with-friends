import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import App from './ui/App'
import { applyColorMode, getColorMode } from './lib/colorMode'
import './styles/theme.css'
import './styles/global.css'
import './ui/styles.css'
document.documentElement.dataset.density = 'compact'
applyColorMode(getColorMode())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
