import { initializeApp, type FirebaseApp } from "firebase/app"
import {
  browserLocalPersistence,
  getAuth,
  GithubAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithCredential,
  signOut,
  type Auth,
  type Unsubscribe,
  type User,
} from "firebase/auth"
import { invoke } from "@tauri-apps/api/core"
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
  googleClientConfigured: boolean
  githubClientConfigured: boolean
}

type FirebaseServices = {
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

type NativeFirebaseOAuthTokens = {
  providerId: string
  accessToken: string
  idToken?: string | null
}

export type NativeFirebaseDeviceCodeSession = {
  providerId: "google.com" | "github.com"
  providerLabel: "Google" | "GitHub"
  clientId: string
  clientSecret?: string
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresInSecs: number
  intervalSecs: number
  startedAt: number
}

type NativeFirebaseDeviceCodeStart = {
  providerId: "google.com" | "github.com"
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresInSecs: number
  intervalSecs: number
}

type NativeFirebaseDeviceCodePoll = {
  status: "pending" | "approved"
  accessToken?: string | null
  idToken?: string | null
  intervalSecs: number
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
  const googleClientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID
  const githubClientId = import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID
  return {
    enabled: Boolean(config),
    missingKeys,
    googleClientConfigured:
      typeof googleClientId === "string" &&
      googleClientId.trim().length > 0,
    githubClientConfigured: typeof githubClientId === "string" && githubClientId.trim().length > 0,
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

export async function initializeFirebaseAuthFlow(): Promise<null> {
  return null
}

function requiredPublicClientId(envKey: "VITE_GOOGLE_OAUTH_CLIENT_ID" | "VITE_GITHUB_OAUTH_CLIENT_ID", providerName: string): string {
  const value = import.meta.env[envKey]
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${providerName} OAuth client ID is not configured on this Windows device`)
  }
  return value.trim()
}

export async function signInWithNativeTokens(tokens: NativeFirebaseOAuthTokens): Promise<User> {
  const { auth } = requiredServices()
  await ensureAuthPersistence(auth)

  if (tokens.providerId === "google.com") {
    const credential = GoogleAuthProvider.credential(tokens.idToken ?? null, tokens.accessToken)
    const result = await signInWithCredential(auth, credential)
    return result.user
  }

  if (tokens.providerId === "github.com") {
    const credential = GithubAuthProvider.credential(tokens.accessToken)
    const result = await signInWithCredential(auth, credential)
    return result.user
  }

  throw new Error(`Unsupported Firebase auth provider: ${tokens.providerId}`)
}

export async function startGoogleDeviceCodeSignIn(): Promise<NativeFirebaseDeviceCodeSession> {
  const clientId = requiredPublicClientId("VITE_GOOGLE_OAUTH_CLIENT_ID", "Google")
  const response = await invoke<NativeFirebaseDeviceCodeStart>("firebase_start_google_device_code_sign_in", {
    clientId,
  })
  return {
    ...response,
    providerLabel: "Google",
    clientId,
    startedAt: Date.now(),
  }
}

export async function startGithubDeviceCodeSignIn(): Promise<NativeFirebaseDeviceCodeSession> {
  const clientId = requiredPublicClientId("VITE_GITHUB_OAUTH_CLIENT_ID", "GitHub")
  const response = await invoke<NativeFirebaseDeviceCodeStart>("firebase_start_github_device_code_sign_in", {
    clientId,
  })
  return {
    ...response,
    providerLabel: "GitHub",
    clientId,
    startedAt: Date.now(),
  }
}

export async function completeNativeDeviceCodeSignIn(
  session: NativeFirebaseDeviceCodeSession,
  signal?: AbortSignal
): Promise<NativeFirebaseOAuthTokens> {
  while (true) {
    if (signal?.aborted) {
      throw new Error(`${session.providerLabel} sign-in was cancelled`)
    }
    if (Date.now() - session.startedAt >= session.expiresInSecs * 1000) {
      throw new Error(`${session.providerLabel} sign-in expired before completion`)
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, Math.max(session.intervalSecs, 1) * 1000)
    })

    const response = session.providerId === "google.com"
      ? await invoke<NativeFirebaseDeviceCodePoll>("firebase_poll_google_device_code_sign_in", {
          clientId: session.clientId,
          deviceCode: session.deviceCode,
        })
      : await invoke<NativeFirebaseDeviceCodePoll>("firebase_poll_github_device_code_sign_in", {
          clientId: session.clientId,
          deviceCode: session.deviceCode,
        })

    if (response.status === "approved") {
      const accessToken = response.accessToken?.trim()
      if (!accessToken) {
        throw new Error(`${session.providerLabel} sign-in completed without an access token`)
      }
      return {
        providerId: session.providerId,
        accessToken,
        idToken: response.idToken ?? null,
      }
    }

    session.intervalSecs = Math.max(response.intervalSecs, session.intervalSecs, 1)
  }
}

export async function signInWithGoogle(): Promise<User> {
  const session = await startGoogleDeviceCodeSignIn()
  const tokens = await completeNativeDeviceCodeSignIn(session)
  return signInWithNativeTokens(tokens)
}

export async function signInWithGithub(): Promise<User> {
  const session = await startGithubDeviceCodeSignIn()
  const tokens = await completeNativeDeviceCodeSignIn(session)
  return signInWithNativeTokens(tokens)
}

export async function signOutFirebase(): Promise<void> {
  const { auth } = requiredServices()
  await signOut(auth)
}
