import { useState } from 'react'

import { getResultsMode, setResultsMode } from '../../lib/resultsMode'

export default function AdminPage() {
  const [mode, setMode] = useState(getResultsMode())

  function handleModeChange(next: 'live' | 'simulated') {
    setMode(next)
    setResultsMode(next)
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  return (
    <div className="card">
      <div className="sectionKicker">Backstage</div>
      <h1 className="h1">Admin</h1>
      <div className="stack">
        <div>
          <div className="sectionTitle">Results data source</div>
          <p className="muted">Switching modes reloads the app.</p>
        </div>
        <div className="bracketToggle" role="tablist" aria-label="Results data source">
          <button
            className={mode === 'live' ? 'bracketToggleButton active' : 'bracketToggleButton'}
            type="button"
            role="tab"
            aria-selected={mode === 'live'}
            onClick={() => handleModeChange('live')}
          >
            Live
          </button>
          <button
            className={mode === 'simulated' ? 'bracketToggleButton active' : 'bracketToggleButton'}
            type="button"
            role="tab"
            aria-selected={mode === 'simulated'}
            onClick={() => handleModeChange('simulated')}
          >
            Simulated
          </button>
        </div>
        <p className="muted">
          Live uses public/data/matches.json, public/data/picks.json, public/data/bracket-predictions.json,
          and public/data/best-third-qualifiers.json. Simulated uses the -simulated.json variants.
        </p>
      </div>
    </div>
  )
}
