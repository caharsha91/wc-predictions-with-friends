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
import { ensureSimulationStateReady } from '../../lib/simulation'
import { CloseIcon } from '../components/Icons'
import { useSimulationState } from '../hooks/useSimulationState'

type AllowlistEntry = {
  id: string
  email: string
  name?: string
  isAdmin?: boolean
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export default function AdminUsersPage() {
  const [status, setStatus] = useState<LoadState>('idle')
  const [entries, setEntries] = useState<AllowlistEntry[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<AllowlistEntry | null>(null)
  const leagueId = useMemo(() => getLeagueId(), [])
  const simulation = useSimulationState()
  const pageSize = 10
  const totalEntries = entries.length
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const pageStart = totalEntries === 0 ? 0 : (safePage - 1) * pageSize + 1
  const pageEnd = totalEntries === 0 ? 0 : Math.min(safePage * pageSize, totalEntries)
  const pageEntries = totalEntries === 0 ? [] : entries.slice(pageStart - 1, pageEnd)
  const canManageAllowlist = hasFirebase && !simulation.enabled
  const isEditing = Boolean(editingEntry)

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
    ensureSimulationStateReady().catch(() => {})
  }, [simulation.enabled, simulation.users.length])

  useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), totalPages))
  }, [totalPages])

  useEffect(() => {
    if (!drawerOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
        setEditingEntry(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [drawerOpen])

  function openAddDrawer() {
    setEditingEntry(null)
    setName('')
    setEmail('')
    setIsAdmin(false)
    setError(null)
    setDrawerOpen(true)
  }

  function openEditDrawer(entry: AllowlistEntry) {
    setEditingEntry(entry)
    setName(entry.name ?? '')
    setEmail(entry.email)
    setIsAdmin(Boolean(entry.isAdmin))
    setError(null)
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setEditingEntry(null)
  }

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
        const updated = {
          id: trimmedEmail,
          email: trimmedEmail,
          name: name.trim() || undefined,
          isAdmin
        }
        if (editingEntry?.id === trimmedEmail) {
          return current.map((entry) => (entry.id === trimmedEmail ? updated : entry))
        }
        const next = current.filter((entry) => entry.id !== trimmedEmail)
        return [updated, ...next]
      })
      setName('')
      setEmail('')
      setIsAdmin(false)
      setStatus('ready')
      setDrawerOpen(false)
      setEditingEntry(null)
    } catch (addError) {
      const message = addError instanceof Error ? addError.message : 'Unable to add user.'
      setError(message)
      setStatus('error')
    }
  }

  return (
    <div className="stack">
      <div>
        <div className="sectionKicker">Backstage</div>
        <h1 className="h1">Users</h1>
      </div>
      <div className="card adminUsersCard">
        <div className="stack">
          <div className="adminSectionHeader">
            <div>
              <div className="sectionTitle">Allowlist access</div>
              <p className="muted">
                Add users who can sign in with Google. Admins can manage future invites.
              </p>
              {simulation.enabled ? (
                <p className="muted">Simulation mode is active. Allowlist changes are disabled.</p>
              ) : null}
              {!hasFirebase ? (
                <p className="muted">
                  Firebase is not configured yet. Add env vars to enable this.
                </p>
              ) : null}
            </div>
            <div className="adminSectionActions">
              <button
                className="button buttonSmall"
                type="button"
                onClick={openAddDrawer}
                disabled={!canManageAllowlist}
              >
                Add user
              </button>
            </div>
          </div>

          {error ? <div className="error">{error}</div> : null}

          <div className="adminList">
            <div className="adminListHeaderRow">
              <div className="sectionTitle">Authorized users</div>
              {entries.length > 0 ? (
                <div className="muted small">
                  Showing {pageStart}-{pageEnd} of {entries.length}
                </div>
              ) : null}
            </div>
            {status === 'loading' ? <div className="muted">Loading users…</div> : null}
            {status !== 'loading' && entries.length === 0 ? (
              <div className="muted">No users added yet.</div>
            ) : null}
            {entries.length > 0 ? (
              <div className="adminListHeader">
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
                  <div className="adminUserMeta">
                    <div className="adminUserName">{entry.name || 'Unnamed user'}</div>
                    <div className="adminUserEmail">{entry.email}</div>
                  </div>
                  <div className="adminUserActions">
                    {entry.isAdmin ? <span className="adminBadge">Admin</span> : null}
                    <button
                      className="button buttonSmall buttonSecondary"
                      type="button"
                      onClick={() => openEditDrawer(entry)}
                      disabled={!canManageAllowlist}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        className={drawerOpen ? 'adminDrawerScrim isVisible' : 'adminDrawerScrim'}
        aria-hidden="true"
        onClick={closeDrawer}
      />
      <section
        className="adminDrawer"
        data-open={drawerOpen ? 'true' : 'false'}
        role={drawerOpen ? 'dialog' : undefined}
        aria-modal={drawerOpen ? 'true' : undefined}
        aria-labelledby="admin-drawer-title"
      >
        <div className="adminDrawerHeader">
          <div>
            <div className="adminDrawerTitle" id="admin-drawer-title">
              {isEditing ? 'Edit allowlist user' : 'Add allowlist user'}
            </div>
            <div className="adminDrawerSubtitle">
              {isEditing
                ? 'Update the name or admin access for this email.'
                : 'Add a new email to the allowlist.'}
            </div>
          </div>
          <button
            className="iconButton adminDrawerClose"
            type="button"
            aria-label="Close allowlist editor"
            onClick={closeDrawer}
          >
            <CloseIcon size={18} />
          </button>
        </div>
        <form className="adminForm adminDrawerForm" onSubmit={handleAddUser}>
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
              disabled={!canManageAllowlist}
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
              disabled={!canManageAllowlist || isEditing}
              required
            />
          </div>
          <label className="adminCheckbox">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(event) => setIsAdmin(event.target.checked)}
              disabled={!canManageAllowlist}
            />
            <span>Grant admin access</span>
          </label>
          {isEditing ? (
            <div className="adminFormNote">Email changes require removing and re-adding.</div>
          ) : null}
          {error ? <div className="error">{error}</div> : null}
          <div className="adminDrawerActions">
            <button
              className="button buttonSmall buttonSecondary"
              type="button"
              onClick={closeDrawer}
            >
              Cancel
            </button>
            <button
              className="button buttonSmall"
              type="submit"
              disabled={!canManageAllowlist}
            >
              {isEditing ? 'Save changes' : 'Add user'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
