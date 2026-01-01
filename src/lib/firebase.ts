import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

const hasFirebaseConfig = Object.values(firebaseConfig).every((value) => Boolean(value))
const useEmulators = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1'
const authEmulatorPort = Number(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT || 9099)
const firestoreEmulatorPort = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8080)

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

if (hasFirebaseConfig) {
  app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)
  if (useEmulators && auth && db) {
    const globalState = globalThis as typeof globalThis & { __wcFirebaseEmulators__?: boolean }
    if (!globalState.__wcFirebaseEmulators__) {
      connectAuthEmulator(auth, `http://${emulatorHost}:${authEmulatorPort}`, {
        disableWarnings: true
      })
      connectFirestoreEmulator(db, emulatorHost, firestoreEmulatorPort)
      globalState.__wcFirebaseEmulators__ = true
    }
  }
}

export const firebaseApp = app
export const firebaseAuth = auth
export const firebaseDb = db
export const hasFirebase = hasFirebaseConfig

export function getLeagueId(): string {
  return import.meta.env.VITE_LEAGUE_ID || 'default'
}
