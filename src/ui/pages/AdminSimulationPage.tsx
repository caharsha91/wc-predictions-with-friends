import { useEffect, useState } from 'react'

import {
  ensureSimulationStateReady,
  resetSimulationState,
  setSimulationEnabled,
  setSimulationNow,
  setSimulationPlacement,
  setSimulationScenario,
  setSimulationSelectedUser,
  setSimulationUserRole,
  type SimulationPlacement,
  type SimulationScenario,
  type SimulationUserRole
} from '../../lib/simulation'
import { useSimulationState } from '../hooks/useSimulationState'
import { Button } from '../components/ui/Button'
import { SelectField } from '../components/ui/Field'
import PageHeader from '../components/ui/PageHeader'

const scenarioOptions: Array<{ value: SimulationScenario; label: string }> = [
  { value: 'group-partial', label: 'Group stage partial' },
  { value: 'group-complete', label: 'Group stage complete' },
  { value: 'knockout-partial', label: 'Knockout stage partial' },
  { value: 'knockout-complete', label: 'Knockout stage complete' }
]

const placementOptions: Array<{ value: SimulationPlacement; label: string; rank: number }> = [
  { value: 'podium', label: 'Podium', rank: 2 },
  { value: 'first-page', label: 'First page', rank: 4 },
  { value: 'middle', label: 'Middle', rank: 25 },
  { value: 'last', label: 'Last', rank: 50 }
]

function formatSimTimestamp(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function toLocalDateTimeValue(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

function toIsoFromLocalDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export default function AdminSimulationPage() {
  const [simulationBusy, setSimulationBusy] = useState(false)
  const [simNowInput, setSimNowInput] = useState('')
  const simulation = useSimulationState()
  const selectedSimUser =
    simulation.users.find((user) => user.id === simulation.selectedUserId) ?? null
  const selectedSimRole: SimulationUserRole = selectedSimUser?.role ?? 'user'
  const lockSimControls = simulation.enabled
  const resetDisabled = simulationBusy
  const scenarioLabel =
    scenarioOptions.find((option) => option.value === simulation.scenario)?.label ??
    simulation.scenario
  const placementLabel =
    placementOptions.find((option) => option.value === simulation.placement)?.label ??
    simulation.placement
  const simUserCount = simulation.users.length > 0 ? simulation.users.length : 50

  useEffect(() => {
    if (!simulation.enabled) return
    if (simulation.users.length > 0) return
    setSimulationBusy(true)
    ensureSimulationStateReady()
      .catch(() => {})
      .finally(() => setSimulationBusy(false))
  }, [simulation.enabled, simulation.users.length])

  useEffect(() => {
    setSimNowInput(toLocalDateTimeValue(simulation.simNow))
  }, [simulation.simNow])

  async function handleSimulationToggle(nextEnabled: boolean) {
    setSimulationEnabled(nextEnabled)
    if (nextEnabled) {
      setSimulationBusy(true)
      try {
        await ensureSimulationStateReady()
      } finally {
        setSimulationBusy(false)
      }
    }
  }

  async function handleResetSimulation() {
    if (
      !window.confirm(
        'Reseed simulation data? This resets local picks, brackets, and 50 simulated users.'
      )
    ) {
      return
    }
    setSimulationBusy(true)
    try {
      await resetSimulationState({
        enabled: simulation.enabled,
        scenario: simulation.scenario
      })
    } finally {
      setSimulationBusy(false)
    }
  }

  async function handleScenarioChange(nextScenario: SimulationScenario) {
    setSimulationScenario(nextScenario)
    setSimulationBusy(true)
    try {
      await resetSimulationState({
        enabled: simulation.enabled,
        scenario: nextScenario,
        selectedUserId: simulation.selectedUserId
      })
    } finally {
      setSimulationBusy(false)
    }
  }

  function handlePlacementChange(nextPlacement: SimulationPlacement) {
    setSimulationPlacement(nextPlacement)
  }

  function handleSimulationNowApply() {
    const nextIso = toIsoFromLocalDateTime(simNowInput)
    if (!nextIso) return
    setSimulationNow(nextIso)
  }

  function handleSimulationNowReset() {
    setSimulationScenario(simulation.scenario)
  }

  return (
    <div className="stack">
      <PageHeader kicker="Backstage" title="Simulation" />
      <div className="card simulationCard">
        <div className="simulationSandbox">
          <div className="simulationSandboxIntro">
            <div>
              <div className="sectionTitle">Simulation sandbox</div>
              <p className="muted">
                Local-only sandbox for locks, roles, and leaderboard positioning. No Firestore
                writes while enabled.
              </p>
            </div>
            <label className="adminCheckbox simulationToggle">
              <input
                type="checkbox"
                checked={simulation.enabled}
                onChange={(event) => handleSimulationToggle(event.target.checked)}
              />
              <span>Simulation: {simulation.enabled ? 'ON' : 'OFF'}</span>
            </label>
            <div className="simulationMetaGrid">
              <div className="simulationMetaCard">
                <span className="simulationMetaLabel">Status</span>
                <span className="simulationMetaValue">
                  {simulation.enabled ? 'Simulation' : 'Live'}
                </span>
              </div>
              <div className="simulationMetaCard">
                <span className="simulationMetaLabel">Mode</span>
                <span className="simulationMetaValue">{scenarioLabel}</span>
              </div>
              <div className="simulationMetaCard">
                <span className="simulationMetaLabel">Placement</span>
                <span className="simulationMetaValue">{placementLabel}</span>
              </div>
              <div className="simulationMetaCard">
                <span className="simulationMetaLabel">Users</span>
                <span className="simulationMetaValue">{simUserCount}</span>
              </div>
              <div className="simulationMetaCard">
                <span className="simulationMetaLabel">Time</span>
                <span className="simulationMetaValue">{formatSimTimestamp(simulation.simNow)}</span>
              </div>
            </div>
          </div>
          <div className="simulationPanel simulationSandboxPanel">
            <div className="simulationPanelTitle">Controls</div>
            <div className="simulationControlGroup">
              <div className="simulationControlHeader">
                <div>
                  <div className="simulationControlTitle">Mode & placement</div>
                  <div className="simulationControlHint">
                    Set match progression and target rank independently.
                  </div>
                </div>
              </div>
              <div className="simulationControlSplit">
                <div className="simulationControlColumn">
                  <div className="simulationControlColumnTitle">Mode</div>
                  <div className="simulationControlColumnHint">Match progression and unlocks.</div>
                  <div className="modeGrid">
                    {scenarioOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={
                          simulation.scenario === option.value
                            ? 'modeGridButton active'
                            : 'modeGridButton'
                        }
                        onClick={() => handleScenarioChange(option.value)}
                        disabled={simulationBusy}
                      >
                        <span className="modeGridLabel">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="simulationControlColumn">
                  <div className="simulationControlColumnTitle">Placement</div>
                  <div className="simulationControlColumnHint">Target leaderboard band.</div>
                  <div className="modeGrid">
                    {placementOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={
                          simulation.placement === option.value
                            ? 'modeGridButton active'
                            : 'modeGridButton'
                        }
                        onClick={() => handlePlacementChange(option.value)}
                        disabled={simulationBusy}
                      >
                        <span className="modeGridLabel">{option.label}</span>
                        <span className="modeGridMeta">Target rank #{option.rank}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="simulationControlGroup">
              <div className="simulationControlHeader">
                <div className="simulationControlTitle">Selected user</div>
              </div>
              <SelectField
                id="sim-user"
                label="Selected user"
                labelHidden
                className="simulationControlRow"
                value={simulation.selectedUserId}
                onChange={(event) => setSimulationSelectedUser(event.target.value)}
                disabled={lockSimControls}
              >
                {simulation.users.length === 0 ? (
                  <option value={simulation.selectedUserId}>Loading users...</option>
                ) : (
                  simulation.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </option>
                  ))
                )}
              </SelectField>
            </div>
            <div className="simulationControlGroup">
              <div className="simulationControlHeader">
                <div className="simulationControlTitle">Role</div>
              </div>
              <SelectField
                id="sim-role"
                label="Role"
                labelHidden
                className="simulationControlRow"
                value={selectedSimRole}
                onChange={(event) => {
                  if (!selectedSimUser) return
                  setSimulationUserRole(
                    selectedSimUser.id,
                    event.currentTarget.value as SimulationUserRole
                  )
                }}
                disabled={lockSimControls || !selectedSimUser}
              >
                <option value="admin">admin</option>
                <option value="user">user</option>
              </SelectField>
            </div>
            <div className="simulationControlGroup">
              <div className="simulationControlHeader">
                <div>
                  <div className="simulationControlTitle">Fixed current date</div>
                  <div className="simulationControlHint">Override scenario time without reseed.</div>
                </div>
              </div>
              <div className="simulationTimeRow">
                <input
                  className="adminInput"
                  type="datetime-local"
                  value={simNowInput}
                  onChange={(event) => setSimNowInput(event.target.value)}
                  disabled={simulationBusy}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleSimulationNowApply}
                  disabled={simulationBusy || !simNowInput}
                >
                  Apply
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleSimulationNowReset}
                  disabled={simulationBusy}
                >
                  Reset time
                </Button>
              </div>
            </div>
            <div className="simulationControlGroup">
              <div className="simulationControlHeader">
                <div>
                  <div className="simulationControlTitle">Seed data</div>
                  <div className="simulationControlHint">Rebuilds 50 users, picks, brackets.</div>
                </div>
              </div>
              <Button
                className="simulationReset"
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleResetSimulation}
                disabled={resetDisabled}
              >
                Seed 50 users
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
