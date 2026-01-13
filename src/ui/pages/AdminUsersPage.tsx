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

type MemberEntry = {
  id: string
  email: string
  name?: string
  isAdmin?: boolean
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export default function AdminUsersPage() {
  const [status, setStatus] = useState<LoadState>('idle')
  const [entries, setEntries] = useState<MemberEntry[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<MemberEntry | null>(null)
  const leagueId = useMemo(() => getLeagueId(), [])
  const simulation = useSimulationState()
  const pageSize = 10
  const adminCount = useMemo(
    () => entries.reduce((count, entry) => (entry.isAdmin ? count + 1 : count), 0),
    [entries]
  )
  const totalEntries = entries.length
  const memberCount = Math.max(0, totalEntries - adminCount)
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const pageStart = totalEntries === 0 ? 0 : (safePage - 1) * pageSize + 1
  const pageEnd = totalEntries === 0 ? 0 : Math.min(safePage * pageSize, totalEntries)
  const pageEntries = totalEntries === 0 ? [] : entries.slice(pageStart - 1, pageEnd)
  const canManageMembers = hasFirebase && !simulation.enabled
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
        const ref = collection(db, 'leagues', leagueId, 'members')
        const snapshot = await getDocs(query(ref, orderBy('createdAt', 'desc')))
        if (canceled) return
        const next = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Omit<MemberEntry, 'id'>
          return { id: docSnap.id, ...data }
        })
        setEntries(next)
        setStatus('ready')
      } catch (loadError) {
        if (!canceled) {
          const message = loadError instanceof Error ? loadError.message : 'Unable to load members.'
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

  function openEditDrawer(entry: MemberEntry) {
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
      const ref = doc(firebaseDb, 'leagues', leagueId, 'members', trimmedEmail)
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
      const message = addError instanceof Error ? addError.message : 'Unable to add member.'
      setError(message)
      setStatus('error')
    }
  }

  return (
    <div className="stack">
      <PageHeader
        kicker="Backstage"
        title="Users"
        subtitle="Invite-only access for your league. Manage who can sign in with Google."
      />

      {simulation.enabled ? (
        <Alert tone="warning" title="Simulation mode">
          Member changes are disabled while simulation mode is active.
        </Alert>
      ) : null}
      {!hasFirebase ? (
        <Alert tone="warning" title="Firebase not configured">
          Add env vars to enable member management.
        </Alert>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card className="rounded-2xl border-border/60 p-6">
        <div className="adminList">
          <div className="adminListHeaderRow">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Members</div>
              <div className="text-lg font-semibold text-foreground">Invite-only roster</div>
              <div className="text-sm text-muted-foreground">
                Add members who can sign in with Google.
              </div>
            </div>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <div className="adminSummary">
                <div className="adminSummaryItem">
                  <div className="adminSummaryLabel">Total</div>
                  <div className="adminSummaryValue">{totalEntries}</div>
                </div>
                <div className="adminSummaryItem">
                  <div className="adminSummaryLabel">Admins</div>
                  <div className="adminSummaryValue">{adminCount}</div>
                </div>
                <div className="adminSummaryItem">
                  <div className="adminSummaryLabel">Members</div>
                  <div className="adminSummaryValue">{memberCount}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!canManageMembers ? <Badge tone="warning">Read-only</Badge> : null}
                <Button type="button" size="sm" onClick={openAddDrawer} disabled={!canManageMembers}>
                  Add member
                </Button>
              </div>
            </div>
          </div>

          {status === 'loading' ? (
            <div className="text-sm text-muted-foreground">Loading users…</div>
          ) : null}
          {status !== 'loading' && entries.length === 0 ? (
            <div className="text-sm text-muted-foreground">No members added yet.</div>
          ) : null}

          {entries.length > 0 ? (
            <>
              <div className="adminListItems adminListItemsMobile">
                {pageEntries.map((entry) => (
                  <div key={entry.id} className="adminListItem">
                    <div className="adminUserMeta">
                      <div className="adminUserName">{entry.name || 'Unnamed user'}</div>
                      <div className="adminUserEmail">{entry.email}</div>
                    </div>
                    <div className="adminUserActions">
                      {entry.isAdmin ? <Badge tone="info">Admin</Badge> : <Badge>Member</Badge>}
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => openEditDrawer(entry)}
                        disabled={!canManageMembers}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="tableWrapper adminTableWrap">
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
                            disabled={!canManageMembers}
                          >
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>

              <div className="adminListFooter">
                <div className="adminListMeta">
                  Showing {pageStart}-{pageEnd} of {entries.length}
                </div>
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
                  <span className="text-xs text-muted-foreground">
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
            </>
          ) : null}
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
              {isEditing ? 'Edit member' : 'Add member'}
            </div>
            <div className="adminDrawerSubtitle">
              {isEditing
                ? 'Update the name or admin access for this email.'
                : 'Add a new email to the members list.'}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-9 w-9 shrink-0 p-0"
            aria-label="Close member editor"
            onClick={closeDrawer}
          >
            <CloseIcon size={18} />
          </Button>
        </div>
        <form className="adminForm adminDrawerForm" onSubmit={handleAddUser}>
          <InputField
            id="admin-name"
            label="Name"
            type="text"
            placeholder="Harsha"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!canManageMembers}
          />
          <InputField
            id="admin-email"
            label="Email"
            type="email"
            placeholder="caharsha2025@gmail.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={!canManageMembers || isEditing}
            required
          />
          <label className="adminCheckbox">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(event) => setIsAdmin(event.target.checked)}
              disabled={!canManageMembers}
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
            <Button type="submit" size="sm" disabled={!canManageMembers}>
              {isEditing ? 'Save changes' : 'Add member'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
