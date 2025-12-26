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
import { ExportsPanel } from './ExportsPage'

type AllowlistEntry = {
  id: string
  email: string
  name?: string
  isAdmin?: boolean
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'exports'>('users')
  const [status, setStatus] = useState<LoadState>('idle')
  const [entries, setEntries] = useState<AllowlistEntry[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const leagueId = useMemo(() => getLeagueId(), [])

  useEffect(() => {
    if (!firebaseDb) return
    let canceled = false
    async function load() {
      setStatus('loading')
      try {
        const ref = collection(firebaseDb, 'leagues', leagueId, 'allowlist')
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
  }, [leagueId])

  async function handleAddUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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

  return (
    <div className="stack">
      <div>
        <div className="sectionKicker">Backstage</div>
        <h1 className="h1">Admin</h1>
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
                  disabled={!hasFirebase}
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
                  disabled={!hasFirebase}
                  required
                />
              </div>
              <label className="adminCheckbox">
                <input
                  type="checkbox"
                  checked={isAdmin}
                  onChange={(event) => setIsAdmin(event.target.checked)}
                  disabled={!hasFirebase}
                />
                <span>Grant admin access</span>
              </label>
              <button className="button buttonSmall" type="submit" disabled={!hasFirebase}>
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
              <div className="adminListItems">
                {entries.map((entry) => (
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
