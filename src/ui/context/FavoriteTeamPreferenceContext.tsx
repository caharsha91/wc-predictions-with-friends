import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useAuthState } from '../hooks/useAuthState'
import { refreshCurrentUser, useCurrentUser } from '../hooks/useCurrentUser'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useToast } from '../hooks/useToast'
import { useViewerId } from '../hooks/useViewerId'
import { readUserProfile, writeUserProfile } from '../lib/profilePersistence'
import { normalizeFavoriteTeamCode } from '../lib/teamFlag'

type FavoriteTeamPreferenceContextValue = {
  favoriteTeamCode: string | null
  isLoading: boolean
  isSaving: boolean
  setFavoriteTeamCode: (nextFavoriteTeamCode: string | null) => void
}

const FavoriteTeamPreferenceContext = createContext<FavoriteTeamPreferenceContextValue | null>(null)

export function FavoriteTeamPreferenceProvider({ children }: { children: ReactNode }) {
  const mode = useRouteDataMode()
  const viewerId = useViewerId()
  const currentUser = useCurrentUser()
  const authState = useAuthState()
  const { showToast } = useToast()

  const [profileFavoriteTeamCode, setProfileFavoriteTeamCode] = useState<string | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)

  const persistQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingPersistCountRef = useRef(0)

  useEffect(() => {
    let canceled = false

    async function loadProfileFavoriteTeam() {
      setProfileLoading(true)
      try {
        const profile = await readUserProfile(mode, viewerId, authState.user?.email ?? null)
        if (canceled) return
        setProfileFavoriteTeamCode(normalizeFavoriteTeamCode(profile.favoriteTeamCode))
      } catch {
        if (canceled) return
        setProfileFavoriteTeamCode(normalizeFavoriteTeamCode(currentUser?.favoriteTeamCode))
      } finally {
        if (canceled) return
        setProfileLoaded(true)
        setProfileLoading(false)
      }
    }

    void loadProfileFavoriteTeam()
    return () => {
      canceled = true
    }
  }, [authState.user?.email, currentUser?.favoriteTeamCode, mode, viewerId])

  const resolvedFavoriteTeamCode = profileLoaded
    ? profileFavoriteTeamCode
    : normalizeFavoriteTeamCode(currentUser?.favoriteTeamCode)

  const setFavoriteTeamCode = useCallback(
    (nextFavoriteTeamCode: string | null) => {
      const normalized = normalizeFavoriteTeamCode(nextFavoriteTeamCode)
      if (profileLoaded && (profileFavoriteTeamCode ?? null) === normalized) return

      setProfileLoaded(true)
      setProfileFavoriteTeamCode(normalized)
      pendingPersistCountRef.current += 1
      setProfileSaving(true)

      const save = async () => {
        try {
          // Clearing favorite team is persisted explicitly as null.
          await writeUserProfile(
            mode,
            viewerId,
            { favoriteTeamCode: normalized ?? null },
            authState.user?.email ?? null
          )
          refreshCurrentUser()
        } catch {
          showToast({
            tone: 'danger',
            title: 'Could not save favorite team',
            message: 'Try again in a moment.'
          })
        } finally {
          pendingPersistCountRef.current = Math.max(0, pendingPersistCountRef.current - 1)
          if (pendingPersistCountRef.current === 0) {
            setProfileSaving(false)
          }
        }
      }

      persistQueueRef.current = persistQueueRef.current.then(save, save)
    },
    [authState.user?.email, mode, profileFavoriteTeamCode, profileLoaded, showToast, viewerId]
  )

  const value = useMemo<FavoriteTeamPreferenceContextValue>(
    () => ({
      favoriteTeamCode: resolvedFavoriteTeamCode,
      isLoading: profileLoading,
      isSaving: profileSaving,
      setFavoriteTeamCode
    }),
    [profileLoading, profileSaving, resolvedFavoriteTeamCode, setFavoriteTeamCode]
  )

  return <FavoriteTeamPreferenceContext.Provider value={value}>{children}</FavoriteTeamPreferenceContext.Provider>
}

export function useFavoriteTeamPreference(): FavoriteTeamPreferenceContextValue {
  const context = useContext(FavoriteTeamPreferenceContext)
  if (!context) {
    throw new Error('useFavoriteTeamPreference must be used within FavoriteTeamPreferenceProvider')
  }
  return context
}
