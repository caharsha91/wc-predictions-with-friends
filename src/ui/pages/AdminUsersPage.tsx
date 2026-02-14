import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'

import { fetchMembers } from '../../lib/data'
import { firebaseDb, getLeagueId, hasFirebase } from '../../lib/firebase'
import type { Member } from '../../types/members'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { InputField } from '../components/ui/Field'
import PageHeroPanel from '../components/ui/PageHeroPanel'
import Progress from '../components/ui/Progress'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '../components/ui/Sheet'
import Table from '../components/ui/Table'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useToast } from '../hooks/useToast'

type MemberEntry = {
  id: string
  email: string
  name?: string
  isAdmin?: boolean
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; entries: MemberEntry[] }

function mapMemberToEntry(member: Member): MemberEntry {
  const email = member.email?.toLowerCase() ?? `${member.id}@local`
  return {
    id: email,
    email,
    name: member.name,
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
  const [isAdmin, setIsAdmin] = useState(false)
  const { showToast } = useToast()
  const leagueId = useMemo(() => getLeagueId(), [])
  const mode = useRouteDataMode()
  const isDemoMode = mode === 'demo'

  const firestoreEnabled = hasFirebase && !!firebaseDb && !isDemoMode
  const canManageMembers = firestoreEnabled

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
            return {
              id: docSnap.id,
              email: (data.email ?? docSnap.id).toLowerCase(),
              name: data.name,
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
    setIsAdmin(false)
    setFormStatus('idle')
    setEditorOpen(true)
  }

  function startEdit(entry: MemberEntry) {
    setEditing(entry)
    setName(entry.name ?? '')
    setEmail(entry.email)
    setIsAdmin(Boolean(entry.isAdmin))
    setFormStatus('idle')
    setEditorOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!firestoreEnabled || !firebaseDb) {
      showToast({ title: 'Save failed', message: 'Local config is read-only for member writes.', tone: 'danger' })
      return
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      showToast({ title: 'Validation error', message: 'Email is required.', tone: 'warning' })
      return
    }

    setFormStatus('saving')
    setMemberMutationProgress(20)
    try {
      const ref = doc(firebaseDb, 'leagues', leagueId, 'members', normalizedEmail)
      await setDoc(
        ref,
        {
          email: normalizedEmail,
          name: name.trim() || undefined,
          isAdmin,
          createdAt: serverTimestamp()
        },
        { merge: true }
      )

      setState((current) => {
        if (current.status !== 'ready') return current
        const nextEntry: MemberEntry = {
          id: normalizedEmail,
          email: normalizedEmail,
          name: name.trim() || undefined,
          isAdmin
        }
        const rest = current.entries.filter((entry) => entry.id !== normalizedEmail)
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

  return (
    <div className="space-y-6">
      <PageHeroPanel
        kicker="Admin"
        title="Players"
        subtitle="Manage member allowlist and admin access."
      >
        <div className="flex flex-wrap items-center gap-2">
          {canManageMembers ? <Badge tone="success">Writable</Badge> : <Badge tone="warning">Read-only</Badge>}
          <Badge tone="secondary">Total {entries.length}</Badge>
          <Badge tone="secondary">Admins {adminCount}</Badge>
          <Badge tone="secondary">Members {memberCount}</Badge>
        </div>
      </PageHeroPanel>

      {!hasFirebase ? (
        <Alert tone="warning" title="Firebase not configured">
          Showing read-only member data from static JSON.
        </Alert>
      ) : null}
      {state.status === 'error' ? (
        <Alert tone="danger" title="Unable to load members">
          {state.message}
        </Alert>
      ) : null}

      <Card className="rounded-2xl border-border/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Roster</div>
            <div className="text-lg font-semibold text-foreground">Invite-only players</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="secondary">Total {entries.length}</Badge>
            <Badge tone="secondary">Admins {adminCount}</Badge>
            <Badge tone="secondary">Members {memberCount}</Badge>
            <Button type="button" size="sm" onClick={startCreate} disabled={!canManageMembers}>
              Add player
            </Button>
          </div>
        </div>

        {state.status === 'loading' ? <div className="text-sm text-muted-foreground">Loading players...</div> : null}
        {state.status === 'ready' && entries.length === 0 ? (
          <div className="text-sm text-muted-foreground">No players found.</div>
        ) : null}

        {state.status === 'ready' && entries.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="font-semibold text-foreground">{entry.name || 'Unnamed user'}</td>
                  <td>{entry.email}</td>
                  <td>{entry.isAdmin ? <Badge tone="info">Admin</Badge> : <Badge>Member</Badge>}</td>
                  <td>
                    <Button type="button" size="sm" variant="secondary" onClick={() => startEdit(entry)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Card>

      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent side="right" className="w-[96vw] max-w-lg">
          <SheetHeader>
            <SheetTitle>{editing ? 'Edit Player' : 'Add Player'}</SheetTitle>
            <SheetDescription>
              {editing
                ? 'Update player details and admin access.'
                : 'Create a new player in the invite-only roster.'}
            </SheetDescription>
          </SheetHeader>

          <form className="space-y-3 px-4 py-3" onSubmit={handleSubmit}>
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
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(event) => setIsAdmin(event.target.checked)}
                disabled={!canManageMembers}
              />
              Grant admin access
            </label>

            <SheetFooter className="px-0 pb-0 pt-3">
              <div className="w-full space-y-2">
                {formStatus === 'saving' || memberMutationProgress > 0 ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
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
  )
}
