import { useState } from 'react'

import { CURRENT_USER_ID } from '../../lib/constants'
import { RESULTS_MODES, getResultsMode, setResultsMode } from '../../lib/resultsMode'
import type { ResultsMode } from '../../lib/resultsMode'
import { getLocalBracketKey } from '../../lib/bracket'
import { getLocalStorageKey } from '../../lib/picks'

export default function AdminPage() {
  const [mode, setMode] = useState(getResultsMode())
  const modeOptions = RESULTS_MODES.map((value) => {
    if (value === 'live') return { value, label: 'Live' }
    if (value === 'sim-group-partial') return { value, label: 'Sim: Group partial' }
    if (value === 'sim-group-complete') return { value, label: 'Sim: Group complete' }
    if (value === 'sim-knockout-partial') return { value, label: 'Sim: Knockout partial' }
    return { value, label: 'Sim: Knockout complete' }
  })

  function handleModeChange(next: ResultsMode) {
    setMode(next)
    setResultsMode(next)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(getLocalStorageKey(CURRENT_USER_ID))
      window.localStorage.removeItem(getLocalBracketKey(CURRENT_USER_ID))
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
          <p className="muted">Switching modes clears local picks and reloads the app.</p>
        </div>
        <div className="modeGrid" role="tablist" aria-label="Results data source">
          {modeOptions.map((option) => (
            <button
              key={option.value}
              className={mode === option.value ? 'modeGridButton active' : 'modeGridButton'}
              type="button"
              role="tab"
              aria-selected={mode === option.value}
              onClick={() => handleModeChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="muted">
          Live uses public/data/matches.json, public/data/picks.json, public/data/bracket-predictions.json,
          and public/data/best-third-qualifiers.json. Simulated uses the -simulated-*.json variants.
        </p>
      </div>
    </div>
  )
}
