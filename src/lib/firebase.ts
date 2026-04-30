import { initializeApp, type FirebaseApp } from "firebase/app"
import {
  browserLocalPersistence,
  getAuth,
  GithubAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type Auth,
  type Unsubscribe,
  type User,
} from "firebase/auth"
import { getFirestore, type Firestore } from "firebase/firestore"

type FirebaseConfig = {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket?: string
  messagingSenderId?: string
  appId: string
}

export type FirebaseRuntimeState = {
  enabled: boolean
  missingKeys: string[]
}

type FirebaseServices = {
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

const requiredConfigKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
] as const

let cachedServices: FirebaseServices | null = null
let persistencePromise: Promise<void> | null = null

function readFirebaseConfig(): { config: FirebaseConfig | null; missingKeys: string[] } {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim()
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim()
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim()
  const appId = import.meta.env.VITE_FIREBASE_APP_ID?.trim()
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim()
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim()

  const missingKeys = requiredConfigKeys.filter((key) => {
    const value = import.meta.env[key]
    return typeof value !== "string" || value.trim().length === 0
  })

  if (missingKeys.length > 0 || !apiKey || !authDomain || !projectId || !appId) {
    return { config: null, missingKeys: [...missingKeys] }
  }

  return {
    config: {
      apiKey,
      authDomain,
      projectId,
      appId,
      storageBucket: storageBucket || undefined,
      messagingSenderId: messagingSenderId || undefined,
    },
    missingKeys: [],
  }
}

export function getFirebaseRuntimeState(): FirebaseRuntimeState {
  const { config, missingKeys } = readFirebaseConfig()
  return {
    enabled: Boolean(config),
    missingKeys,
  }
}

export function getFirebaseServices(): FirebaseServices | null {
  if (cachedServices) return cachedServices

  const { config } = readFirebaseConfig()
  if (!config) return null

  const app = initializeApp(config)
  const auth = getAuth(app)
  const db = getFirestore(app)
  cachedServices = { app, auth, db }
  return cachedServices
}

async function ensureAuthPersistence(auth: Auth): Promise<void> {
  if (!persistencePromise) {
    persistencePromise = setPersistence(auth, browserLocalPersistence).catch((error) => {
      persistencePromise = null
      throw error
    })
  }

  await persistencePromise
}

function requiredServices(): FirebaseServices {
  const services = getFirebaseServices()
  if (!services) {
    throw new Error("Firebase is not configured on this Windows device")
  }
  return services
}

export function watchFirebaseUser(callback: (user: User | null) => void): Unsubscribe {
  const services = requiredServices()
  return onAuthStateChanged(services.auth, callback)
}

export async function signInWithGoogle(): Promise<User> {
  const { auth } = requiredServices()
  await ensureAuthPersistence(auth)
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: "select_account" })
  const result = await signInWithPopup(auth, provider)
  return result.user
}

export async function signInWithGithub(): Promise<User> {
  const { auth } = requiredServices()
  await ensureAuthPersistence(auth)
  const provider = new GithubAuthProvider()
  provider.addScope("read:user")
  provider.setCustomParameters({ allow_signup: "true" })
  const result = await signInWithPopup(auth, provider)
  return result.user
}

export async function signOutFirebase(): Promise<void> {
  const { auth } = requiredServices()
  await signOut(auth)
}
