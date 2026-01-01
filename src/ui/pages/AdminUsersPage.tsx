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
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { InputField } from '../components/ui/Field'
import PageHeader from '../components/ui/PageHeader'
import Table from '../components/ui/Table'
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
      <PageHeader kicker="Backstage" title="Users" />
      <Card className="adminUsersCard">
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
              <Button type="button" size="sm" onClick={openAddDrawer} disabled={!canManageAllowlist}>
                Add user
              </Button>
            </div>
          </div>

          {error ? <Alert tone="danger">{error}</Alert> : null}

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
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={safePage <= 1}
                  >
                    Prev
                  </Button>
                  <span className="muted small">
                    Page {safePage} of {totalPages}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={safePage >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
            {entries.length > 0 ? (
              <div className="tableWrapper">
                <Table className="adminTable">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <div className="adminUserMeta">
                            <div className="adminUserName">{entry.name || 'Unnamed user'}</div>
                            <div className="adminUserEmail">{entry.email}</div>
                          </div>
                        </td>
                        <td>
                          {entry.isAdmin ? <Badge tone="info">Admin</Badge> : <Badge>Member</Badge>}
                        </td>
                        <td>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => openEditDrawer(entry)}
                            disabled={!canManageAllowlist}
                          >
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

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
          <InputField
            id="admin-name"
            label="Name"
            type="text"
            placeholder="Harsha"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!canManageAllowlist}
          />
          <InputField
            id="admin-email"
            label="Email"
            type="email"
            placeholder="caharsha2025@gmail.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={!canManageAllowlist || isEditing}
            required
          />
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
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="adminDrawerActions">
            <Button type="button" size="sm" variant="secondary" onClick={closeDrawer}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!canManageAllowlist}>
              {isEditing ? 'Save changes' : 'Add user'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
