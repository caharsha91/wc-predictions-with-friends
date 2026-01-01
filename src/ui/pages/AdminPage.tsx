import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from 'firebase/firestore'

import { firebaseDb, getLeagueId, hasFirebase } from '../../lib/firebase'
import {
  ensureSimulationStateReady,
  resetSimulationState,
  setSimulationEnabled,
  setSimulationScenario,
  setSimulationSelectedUser,
  setSimulationUserRole,
  type SimulationScenario,
  type SimulationUserRole
} from '../../lib/simulation'
import { ExportsPanel } from './ExportsPage'
import { useSimulationState } from '../hooks/useSimulationState'

type AllowlistEntry = {
  id: string
  email: string
  name?: string
  isAdmin?: boolean
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

const scenarioOptions: Array<{ value: SimulationScenario; label: string }> = [
  { value: 'group-partial', label: 'Group stage partial' },
  { value: 'group-complete', label: 'Group stage complete' },
  { value: 'knockout-partial', label: 'Knockout stage partial' },
  { value: 'knockout-complete', label: 'Knockout stage complete' }
]

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'exports'>('users')
  const [status, setStatus] = useState<LoadState>('idle')
  const [entries, setEntries] = useState<AllowlistEntry[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [simulationBusy, setSimulationBusy] = useState(false)
  const leagueId = useMemo(() => getLeagueId(), [])
  const simulation = useSimulationState()
  const selectedSimUser =
    simulation.users.find((user) => user.id === simulation.selectedUserId) ?? null
  const selectedSimRole: SimulationUserRole = selectedSimUser?.role ?? 'user'
  const pageSize = 20
  const totalEntries = entries.length
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const pageStart = totalEntries === 0 ? 0 : (safePage - 1) * pageSize + 1
  const pageEnd = totalEntries === 0 ? 0 : Math.min(safePage * pageSize, totalEntries)
  const pageEntries =
    totalEntries === 0 ? [] : entries.slice(pageStart - 1, pageEnd)
  const lockSimControls = simulation.enabled
  const resetDisabled = simulationBusy

  useEffect(() => {
    if (simulation.enabled) {
      const simulatedEntries = simulation.users.map((user) => ({
        id: user.email,
        email: user.email,
        name: user.name,
        isAdmin: user.role === 'admin'
      }))
      setEntries(simulatedEntries)
      setStatus('ready')
      return
    }
    if (!firebaseDb) return
    const db = firebaseDb
    let canceled = false
    async function load() {
      setStatus('loading')
      try {
        const ref = collection(db, 'leagues', leagueId, 'allowlist')
        const snapshot = await getDocs(query(ref, orderBy('createdAt', 'desc')))
        if (canceled) return
        const next = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Omit<AllowlistEntry, 'id'>
          return { id: docSnap.id, ...data }
        })
        setEntries(next)
        setStatus('ready')
      } catch (loadError) {
        if (!canceled) {
          const message = loadError instanceof Error ? loadError.message : 'Unable to load users.'
          setError(message)
          setStatus('error')
        }
      }
    }
    void load()
    return () => {
      canceled = true
    }
  }, [leagueId, simulation.enabled, simulation.users])

  useEffect(() => {
    if (!simulation.enabled) return
    if (simulation.users.length > 0) return
    setSimulationBusy(true)
    ensureSimulationStateReady()
      .catch(() => {})
      .finally(() => setSimulationBusy(false))
  }, [simulation.enabled, simulation.users.length])

  useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), totalPages))
  }, [totalPages])

  async function handleAddUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (simulation.enabled) {
      setError('Simulation mode is local only. Disable it to update Firestore.')
      return
    }
    if (!firebaseDb) return
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) {
      setError('Enter an email address.')
      return
    }
    setError(null)
    try {
      const ref = doc(firebaseDb, 'leagues', leagueId, 'allowlist', trimmedEmail)
      await setDoc(
        ref,
        {
          email: trimmedEmail,
          name: name.trim() || undefined,
          isAdmin,
          createdAt: serverTimestamp()
        },
        { merge: true }
      )
      setEntries((current) => {
        const next = current.filter((entry) => entry.id !== trimmedEmail)
        return [{ id: trimmedEmail, email: trimmedEmail, name: name.trim() || undefined, isAdmin }, ...next]
      })
      setName('')
      setEmail('')
      setIsAdmin(false)
      setStatus('ready')
    } catch (addError) {
      const message = addError instanceof Error ? addError.message : 'Unable to add user.'
      setError(message)
      setStatus('error')
    }
  }

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

  return (
    <div className="stack">
      <div>
        <div className="sectionKicker">Backstage</div>
        <h1 className="h1">Admin</h1>
      </div>
      <div className="card simulationCard">
        <div className="stack">
          <div>
            <div className="sectionTitle">Simulation mode</div>
            <p className="muted">
              Local-only sandbox for locks, roles, and leaderboard positioning. No Firestore reads
              or writes while enabled.
            </p>
          </div>
          <div className="simulationPanel">
            <div className="simulationPanelTitle">Simulation mode</div>
            <label className="adminCheckbox simulationToggle">
              <input
                type="checkbox"
                checked={simulation.enabled}
                onChange={(event) => handleSimulationToggle(event.target.checked)}
              />
              <span>
                Simulation mode: {simulation.enabled ? 'ON (simulation)' : 'OFF (live)'}
              </span>
            </label>
            <div className="simulationRows">
              <div className="simulationRow">
                <label className="simulationRowLabel" htmlFor="sim-scenario">
                  Scenario
                </label>
                <div className="simulationRowControl">
                  <select
                    id="sim-scenario"
                    className="adminInput"
                    value={simulation.scenario}
                    onChange={(event) =>
                      handleScenarioChange(event.target.value as SimulationScenario)
                    }
                    disabled={simulationBusy}
                  >
                    {scenarioOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="simulationRow">
                <label className="simulationRowLabel" htmlFor="sim-user">
                  Simulated user
                </label>
                <div className="simulationRowControl">
                  <select
                    id="sim-user"
                    className="adminInput"
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
                  </select>
                </div>
              </div>
              <div className="simulationRow">
                <div className="simulationRowLabel">Simulated time (scenario default)</div>
                <div className="simulationRowControl">
                  <div className="adminInput adminReadOnly" aria-live="polite">
                    {new Date(simulation.simNow).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="simulationRow">
                <label className="simulationRowLabel" htmlFor="sim-role">
                  Role
                </label>
                <div className="simulationRowControl">
                  <select
                    id="sim-role"
                    className="adminInput"
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
                  </select>
                </div>
              </div>
            </div>
            <button
              className="button buttonSmall simulationReset"
              type="button"
              onClick={handleResetSimulation}
              disabled={resetDisabled}
            >
              Reset simulation
            </button>
          </div>
        </div>
      </div>
      <div className="adminTabs" role="tablist" aria-label="Admin sections">
        <button
          type="button"
          className={activeTab === 'users' ? 'adminTabButton active' : 'adminTabButton'}
          role="tab"
          aria-selected={activeTab === 'users'}
          onClick={() => setActiveTab('users')}
        >
          Users
        </button>
        <button
          type="button"
          className={activeTab === 'exports' ? 'adminTabButton active' : 'adminTabButton'}
          role="tab"
          aria-selected={activeTab === 'exports'}
          onClick={() => setActiveTab('exports')}
        >
          Exports
        </button>
      </div>

      {activeTab === 'users' ? (
        <div className="card">
          <div className="stack">
            <div>
              <div className="sectionTitle">Allowlist access</div>
              <p className="muted">
                Add users who can sign in with Google. Admins can manage future invites.
              </p>
              {simulation.enabled ? (
                <p className="muted">
                  Simulation mode is active. Allowlist changes are disabled.
                </p>
              ) : null}
              {!hasFirebase ? (
                <p className="muted">
                  Firebase is not configured yet. Add env vars to enable this.
                </p>
              ) : null}
            </div>

            <form className="adminForm" onSubmit={handleAddUser}>
              <div className="adminField">
                <label className="adminLabel" htmlFor="admin-name">
                  Name
                </label>
                <input
                  className="adminInput"
                  id="admin-name"
                  type="text"
                  placeholder="Harsha"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={!hasFirebase || simulation.enabled}
                />
              </div>
              <div className="adminField">
                <label className="adminLabel" htmlFor="admin-email">
                  Email
                </label>
                <input
                  className="adminInput"
                  id="admin-email"
                  type="email"
                  placeholder="caharsha2025@gmail.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={!hasFirebase || simulation.enabled}
                  required
                />
              </div>
              <label className="adminCheckbox">
                <input
                  type="checkbox"
                  checked={isAdmin}
                  onChange={(event) => setIsAdmin(event.target.checked)}
                  disabled={!hasFirebase || simulation.enabled}
                />
                <span>Grant admin access</span>
              </label>
              <button
                className="button buttonSmall"
                type="submit"
                disabled={!hasFirebase || simulation.enabled}
              >
                Add user
              </button>
            </form>

            {error ? <div className="error">{error}</div> : null}

            <div className="adminList">
              <div className="sectionTitle">Authorized users</div>
              {status === 'loading' ? <div className="muted">Loading users…</div> : null}
              {status !== 'loading' && entries.length === 0 ? (
                <div className="muted">No users added yet.</div>
              ) : null}
              {entries.length > 0 ? (
                <div className="adminListHeader">
                  <div className="muted small">
                    Showing {pageStart}-{pageEnd} of {entries.length}
                  </div>
                  <div className="adminPagination">
                    <button
                      className="button buttonSmall buttonSecondary"
                      type="button"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={safePage <= 1}
                    >
                      Prev
                    </button>
                    <span className="muted small">
                      Page {safePage} of {totalPages}
                    </span>
                    <button
                      className="button buttonSmall buttonSecondary"
                      type="button"
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      disabled={safePage >= totalPages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="adminListItems">
                {pageEntries.map((entry) => (
                  <div key={entry.id} className="adminListItem">
                    <div>
                      <div className="adminUserName">{entry.name || 'Unnamed user'}</div>
                      <div className="adminUserEmail">{entry.email}</div>
                    </div>
                    {entry.isAdmin ? <span className="adminBadge">Admin</span> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'exports' ? <ExportsPanel embedded /> : null}
    </div>
  )
}
