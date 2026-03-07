import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { collection, deleteField, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'

import { fetchMembers } from '../../lib/data'
import { firebaseDb, getLeagueId, hasFirebase } from '../../lib/firebase'
import type { Member } from '../../types/members'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { InputField } from '../components/ui/Field'
import Progress from '../components/ui/Progress'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '../components/ui/Sheet'
import AdminWorkspaceShellV2 from '../components/v2/AdminWorkspaceShellV2'
import SectionCardV2 from '../components/v2/SectionCardV2'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useToast } from '../hooks/useToast'

type MemberEntry = {
  docId: string
  email: string
  memberId: string
  name?: string
  authUid?: string
  isAdmin?: boolean
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; entries: MemberEntry[] }

function looksLikeEmail(value: string): boolean {
  if (!value) return false
  return value.includes('@')
}

function createMemberId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `member-${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
  }
  const timeToken = Date.now().toString(36)
  const randomToken = Math.random().toString(36).slice(2, 12)
  return `member-${timeToken}${randomToken}`
}

function mapMemberToEntry(member: Member): MemberEntry {
  const email = member.email?.toLowerCase() ?? `${member.id}@local`
  const memberId = member.id?.trim() || ''
  const authUid = member.authUid?.trim() || undefined
  return {
    docId: email,
    email,
    memberId,
    name: member.name,
    authUid,
    isAdmin: member.isAdmin === true
  }
}

function sortEntries(entries: MemberEntry[]): MemberEntry[] {
  return [...entries].sort((a, b) => {
    const aAdmin = a.isAdmin ? 1 : 0
    const bAdmin = b.isAdmin ? 1 : 0
    if (aAdmin !== bAdmin) return bAdmin - aAdmin
    return a.email.localeCompare(b.email)
  })
}

export default function AdminUsersPage() {
  // QA-SMOKE: route=/admin/players and /demo/admin/players ; checklist-id=smoke-admin-players
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [formStatus, setFormStatus] = useState<'idle' | 'saving'>('idle')
  const [editing, setEditing] = useState<MemberEntry | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [memberMutationProgress, setMemberMutationProgress] = useState(0)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [memberId, setMemberId] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { showToast } = useToast()
  const leagueId = useMemo(() => getLeagueId(), [])
  const mode = useRouteDataMode()
  const isDemoMode = mode === 'demo'

  const firestoreEnabled = hasFirebase && !!firebaseDb && !isDemoMode
  const canManageMembers = firestoreEnabled
  const modeLabel = isDemoMode ? 'Demo testing data' : 'Live roster data'

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        if (firestoreEnabled && firebaseDb) {
          const ref = collection(firebaseDb, 'leagues', leagueId, 'members')
          const snapshot = await getDocs(ref)
          if (canceled) return
          const entries = snapshot.docs.map((docSnap) => {
            const data = docSnap.data() as Partial<MemberEntry>
            const storedMemberId =
              (typeof (data as { id?: unknown }).id === 'string' && ((data as { id: string }).id).trim()) ||
              ''
            const storedAuthUid =
              (typeof (data as { authUid?: unknown }).authUid === 'string' && ((data as { authUid: string }).authUid).trim()) ||
              undefined
            return {
              docId: docSnap.id,
              email: (data.email ?? docSnap.id).toLowerCase(),
              memberId: storedMemberId,
              name: data.name,
              authUid: storedAuthUid,
              isAdmin: data.isAdmin === true
            } satisfies MemberEntry
          })
          setState({ status: 'ready', entries: sortEntries(entries) })
          return
        }

        const membersFile = await fetchMembers({ mode })
        if (canceled) return
        const entries = membersFile.members.map(mapMemberToEntry)
        setState({ status: 'ready', entries: sortEntries(entries) })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load league members.'
        if (!canceled) setState({ status: 'error', message })
      }
    }
    void load()
    return () => {
      canceled = true
    }
  }, [firestoreEnabled, leagueId, mode])

  function startCreate() {
    setEditing(null)
    setName('')
    setEmail('')
    setMemberId(createMemberId())
    setIsAdmin(false)
    setFormStatus('idle')
    setEditorOpen(true)
  }

  function startEdit(entry: MemberEntry) {
    setEditing(entry)
    setName(entry.name ?? '')
    setEmail(entry.email)
    setMemberId(entry.memberId || createMemberId())
    setIsAdmin(Boolean(entry.isAdmin))
    setFormStatus('idle')
    setEditorOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!firestoreEnabled || !firebaseDb) {
      showToast({
        title: 'Save failed',
        message: 'This environment is read-only. Roster updates are disabled.',
        tone: 'danger'
      })
      return
    }

    const normalizedEmail = email.trim().toLowerCase()
    const resolvedMemberId = memberId.trim() || editing?.memberId || createMemberId()
    if (!normalizedEmail) {
      showToast({ title: 'Validation error', message: 'Email is required.', tone: 'warning' })
      return
    }
    if (!resolvedMemberId) {
      showToast({ title: 'Validation error', message: 'Member ID could not be generated.', tone: 'warning' })
      return
    }
    if (looksLikeEmail(resolvedMemberId)) {
      showToast({ title: 'Validation error', message: 'Member ID cannot be an email.', tone: 'warning' })
      return
    }
    const duplicateMemberId = entries.find(
      (entry) =>
        entry.docId !== normalizedEmail &&
        entry.memberId.trim().toLowerCase() === resolvedMemberId.toLowerCase()
    )
    if (duplicateMemberId) {
      showToast({
        title: 'Validation error',
        message: `Member ID is already assigned to ${duplicateMemberId.email}.`,
        tone: 'warning'
      })
      return
    }

    setFormStatus('saving')
    setMemberMutationProgress(20)
    try {
      const ref = doc(firebaseDb, 'leagues', leagueId, 'members', normalizedEmail)
      const trimmedName = name.trim()
      const payload: Record<string, unknown> = {
        email: normalizedEmail,
        id: resolvedMemberId,
        uid: deleteField(),
        isAdmin,
        createdAt: serverTimestamp()
      }
      if (trimmedName) payload.name = trimmedName
      await setDoc(
        ref,
        payload,
        { merge: true }
      )

      setState((current) => {
        if (current.status !== 'ready') return current
        const nextEntry: MemberEntry = {
          docId: normalizedEmail,
          email: normalizedEmail,
          memberId: resolvedMemberId,
          name: trimmedName || undefined,
          authUid: editing?.authUid,
          isAdmin
        }
        const rest = current.entries.filter((entry) => entry.docId !== normalizedEmail)
        return { status: 'ready', entries: sortEntries([nextEntry, ...rest]) }
      })
      setFormStatus('idle')
      setMemberMutationProgress(100)
      showToast({
        title: 'Player saved',
        message: editing ? '1 player updated.' : '1 player added.',
        tone: 'success'
      })
      setEditorOpen(false)
      window.setTimeout(() => setMemberMutationProgress(0), 900)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save member.'
      setFormStatus('idle')
      setMemberMutationProgress(0)
      showToast({ title: 'Save failed', message, tone: 'danger' })
    }
  }

  const entries = state.status === 'ready' ? state.entries : []
  const adminCount = entries.filter((entry) => entry.isAdmin).length
  const memberCount = entries.length - adminCount
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredEntries = useMemo(() => {
    if (state.status !== 'ready') return []
    if (!normalizedSearchQuery) return entries
    return entries.filter((entry) => {
      const nameValue = (entry.name ?? '').toLowerCase()
      const emailValue = entry.email.toLowerCase()
      return nameValue.includes(normalizedSearchQuery) || emailValue.includes(normalizedSearchQuery)
    })
  }, [entries, normalizedSearchQuery, state.status])

  const headerMetadata = (
    <>
      <span>{modeLabel}</span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span>{entries.length} players</span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span>{adminCount} admin</span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span>{memberCount} members</span>
    </>
  )

  return (
    <AdminWorkspaceShellV2
      title="Players"
      subtitle={isDemoMode ? 'Review demo roster snapshot state for testing.' : 'Manage league roster access and admin permissions.'}
      metadata={headerMetadata}
      kicker={isDemoMode ? 'Admin Demo' : 'Admin'}
      actions={(
        <Button
          type="button"
          size="sm"
          className="admin-v2-action-inline v2-action-compact"
          onClick={startCreate}
          disabled={!canManageMembers}
        >
          + Add Player
        </Button>
      )}
    >
      <div className="space-y-4">
        {isDemoMode ? (
          <Alert tone="warning" title="Demo testing mode" className="admin-v2-inline-alert">
            Demo roster is snapshot-only for testing. Add/edit actions are intentionally disabled here.
          </Alert>
        ) : null}

        {!canManageMembers && !isDemoMode ? (
          <Alert tone="warning" title="Read-only roster view" className="admin-v2-inline-alert">
            Live roster updates are unavailable in this environment.
          </Alert>
        ) : null}
        {state.status === 'error' ? (
          <Alert tone="danger" title="Unable to load members" className="admin-v2-inline-alert">
            {state.message}
          </Alert>
        ) : null}

        <SectionCardV2 tone="panel" density="none" className="v2-surface-soft p-3.5 md:p-4">
          <div className="space-y-3">
            <div className="players-v2-search-wrap">
              <div className="admin-v2-section-label">Search players</div>
              <label className="sr-only" htmlFor="players-search">
                Search players
              </label>
              <input
                id="players-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by name or email..."
                className="players-v2-search"
              />
            </div>

            <div className="admin-v2-divider" />

            <div className="players-v2-head hidden md:grid">
              <span>Name</span>
              <span>Role</span>
              <span className="sr-only">Actions</span>
            </div>

            <div className="players-v2-list">
              {state.status === 'loading' ? <div className="text-sm text-muted-foreground">Loading players...</div> : null}
              {state.status === 'ready' && entries.length === 0 ? (
                <div className="text-sm text-muted-foreground">No players found in the roster.</div>
              ) : null}
              {state.status === 'ready' && entries.length > 0 && filteredEntries.length === 0 ? (
                <div className="text-sm text-muted-foreground">No players match this search.</div>
              ) : null}

              {state.status === 'ready' && filteredEntries.length > 0 ? (
                <div className="space-y-2 md:space-y-0">
                  {filteredEntries.map((entry) => (
                    <div key={entry.docId} className="players-v2-row">
                      <div className="players-v2-name-col">
                        <div className="players-v2-name-line">
                          <span className="players-v2-name">{entry.name || 'Unnamed user'}</span>
                          <span className="players-v2-email">{entry.email}</span>
                        </div>
                      </div>

                      <div className="players-v2-role-col flex flex-wrap gap-1">
                        {entry.isAdmin ? (
                          <Badge tone="info" className="admin-v2-pill players-v2-role-pill">
                            Admin
                          </Badge>
                        ) : (
                          <Badge tone="secondary" className="admin-v2-pill players-v2-role-pill">
                            Member
                          </Badge>
                        )}
                        {isDemoMode ? (
                          <Badge tone="warning" className="admin-v2-pill players-v2-role-pill">
                            Demo snapshot
                          </Badge>
                        ) : null}
                      </div>

                      <div className="players-v2-action-col">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="players-v2-edit-btn"
                          onClick={() => startEdit(entry)}
                          disabled={!canManageMembers}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </SectionCardV2>

        <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
          <SheetContent side="right" className="admin-v2-sheet-content w-[96vw] max-w-lg">
            <SheetHeader className="admin-v2-sheet-header">
              <SheetTitle>{editing ? 'Edit Player' : 'Add Player'}</SheetTitle>
              <SheetDescription>
                {isDemoMode
                  ? 'Demo mode preview only. Editing is disabled in testing mode.'
                  : editing
                    ? 'Update player details and admin permissions for the live roster.'
                    : 'Add a player to the invite-only live league roster.'}
              </SheetDescription>
            </SheetHeader>

            <form className="admin-v2-sheet-form space-y-3 px-4 py-3" onSubmit={handleSubmit}>
              <InputField
                id="member-name"
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canManageMembers}
                placeholder="Display name"
              />
              <InputField
                id="member-email"
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={!canManageMembers || Boolean(editing)}
                placeholder="member@example.com"
                required
              />
              <InputField
                id="member-id"
                label="Member ID"
                value={memberId}
                onChange={(event) => setMemberId(event.target.value)}
                disabled={!canManageMembers || Boolean(editing)}
                placeholder="Auto-generated member identity"
                helperText={
                  editing
                    ? 'Core identity is locked after creation to avoid orphaned picks/bracket docs.'
                    : 'Core identity used across picks, bracket, leaderboard, and rivals.'
                }
                required
              />
              <InputField
                id="member-auth-uid"
                label="Auth UID"
                value={editing?.authUid ?? ''}
                readOnly
                disabled
                placeholder="Not set"
                helperText="Authentication reference (read-only). Member ID is used for league data."
              />
              <label className="admin-v2-sheet-checkbox v2-type-body-sm flex items-center gap-2 text-foreground">
                <input
                  type="checkbox"
                  checked={isAdmin}
                  onChange={(event) => setIsAdmin(event.target.checked)}
                  disabled={!canManageMembers}
                />
                Grant admin access
              </label>

              <SheetFooter className="admin-v2-sheet-footer px-0 pb-0 pt-3">
                <div className="w-full space-y-2">
                  {formStatus === 'saving' || memberMutationProgress > 0 ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between v2-type-meta">
                        <span>{formStatus === 'saving' ? 'Updating player...' : 'Update complete'}</span>
                        <span>{memberMutationProgress >= 100 ? 'Done' : 'In progress'}</span>
                      </div>
                      <Progress
                        value={memberMutationProgress}
                        intent={formStatus === 'saving' ? 'momentum' : 'success'}
                        size="sm"
                        aria-label="Player update progress"
                      />
                    </div>
                  ) : null}

                  <div className="flex w-full flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditorOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={!canManageMembers || formStatus === 'saving'}>
                      {editing ? 'Save player' : 'Add player'}
                    </Button>
                  </div>
                </div>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      </div>
    </AdminWorkspaceShellV2>
  )
}
