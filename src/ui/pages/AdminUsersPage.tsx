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
import PageHeader from '../components/ui/PageHeader'
import Table from '../components/ui/Table'

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
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [formError, setFormError] = useState<string | null>(null)
  const [formStatus, setFormStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [editing, setEditing] = useState<MemberEntry | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const leagueId = useMemo(() => getLeagueId(), [])

  const firestoreEnabled = hasFirebase && !!firebaseDb
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

        const membersFile = await fetchMembers()
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
  }, [firestoreEnabled, leagueId])

  function startCreate() {
    setEditing(null)
    setName('')
    setEmail('')
    setIsAdmin(false)
    setFormError(null)
    setFormStatus('idle')
  }

  function startEdit(entry: MemberEntry) {
    setEditing(entry)
    setName(entry.name ?? '')
    setEmail(entry.email)
    setIsAdmin(Boolean(entry.isAdmin))
    setFormError(null)
    setFormStatus('idle')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!firestoreEnabled || !firebaseDb) {
      setFormError('Local config is read-only for member writes.')
      setFormStatus('error')
      return
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setFormError('Email is required.')
      setFormStatus('error')
      return
    }

    setFormError(null)
    setFormStatus('saving')
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
      setFormStatus('saved')
      if (!editing) {
        setName('')
        setEmail('')
        setIsAdmin(false)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save member.'
      setFormError(message)
      setFormStatus('error')
    }
  }

  const entries = state.status === 'ready' ? state.entries : []
  const adminCount = entries.filter((entry) => entry.isAdmin).length
  const memberCount = entries.length - adminCount

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Admin"
        title="Players"
        subtitle="Manage member allowlist and admin access."
      />

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

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="rounded-2xl border-border/60 p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Player editor</div>
            {canManageMembers ? <Badge tone="success">Writable</Badge> : <Badge tone="warning">Read-only</Badge>}
          </div>

          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
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
            {formError ? <Alert tone="danger">{formError}</Alert> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={!canManageMembers} loading={formStatus === 'saving'}>
                {editing ? 'Save player' : 'Add player'}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={startCreate}>
                New
              </Button>
              {formStatus === 'saved' ? <Badge tone="success">Saved</Badge> : null}
            </div>
          </form>
        </Card>

        <Card className="rounded-2xl border-border/60 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Roster</div>
              <div className="text-lg font-semibold text-foreground">Invite-only players</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="secondary">Total {entries.length}</Badge>
              <Badge tone="secondary">Admins {adminCount}</Badge>
              <Badge tone="secondary">Members {memberCount}</Badge>
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
      </div>
    </div>
  )
}
