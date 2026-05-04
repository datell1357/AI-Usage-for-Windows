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
import type { MobileSyncOAuthConfig } from "@/lib/settings"

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

export type NativeFirebasePendingAuthSession =
  | {
      kind: "loopback"
      providerId: "google.com"
      providerLabel: "Google"
      clientId: string
      sessionId: string
      authorizationUrl: string
      callbackUrl: string
      expiresInSecs: number
      startedAt: number
    }
  | {
      kind: "device_code"
      providerId: "github.com"
      providerLabel: "GitHub"
      clientId: string
      sessionId: string
      verificationUri: string
      userCode: string
      pollIntervalSecs: number
      expiresInSecs: number
      startedAt: number
    }

type NativeFirebaseLoopbackStart = {
  providerId: "google.com" | "github.com"
  sessionId: string
  flow: "loopback" | "device_code"
  authorizationUrl?: string | null
  callbackUrl?: string | null
  verificationUri?: string | null
  userCode?: string | null
  expiresInSecs: number
  pollIntervalSecs?: number | null
}

type NativeFirebaseLoopbackPoll = {
  status: "pending" | "approved" | "failed"
  accessToken?: string | null
  idToken?: string | null
  error?: string | null
  intervalSecs?: number | null
}

const requiredConfigKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
] as const

let cachedServices: FirebaseServices | null = null
let persistencePromise: Promise<void> | null = null
const DEFAULT_FIREBASE_OAUTH_POLL_INTERVAL_MS = 2000
let runtimeOAuthConfig: MobileSyncOAuthConfig = {
  googleDesktopClientId: null,
  githubClientId: null,
}

function normalizePublicClientId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getGoogleDesktopClientId(): string | null {
  return (
    runtimeOAuthConfig.googleDesktopClientId ??
    normalizePublicClientId(import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID)
  )
}

function getGithubClientId(): string | null {
  return (
    runtimeOAuthConfig.githubClientId ??
    normalizePublicClientId(import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID)
  )
}

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
  const googleClientId = getGoogleDesktopClientId()
  const githubClientId = getGithubClientId()
  return {
    enabled: Boolean(config),
    missingKeys,
    googleClientConfigured: Boolean(googleClientId),
    githubClientConfigured: Boolean(githubClientId),
  }
}

export function hydrateFirebaseAuthRuntimeConfig(config: Partial<MobileSyncOAuthConfig>): void {
  runtimeOAuthConfig = {
    googleDesktopClientId: normalizePublicClientId(config.googleDesktopClientId),
    githubClientId: normalizePublicClientId(config.githubClientId),
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

function requiredPublicClientId(
  envKey: "VITE_GOOGLE_DESKTOP_CLIENT_ID" | "VITE_GITHUB_OAUTH_CLIENT_ID",
  providerName: string
): string {
  const value =
    envKey === "VITE_GOOGLE_DESKTOP_CLIENT_ID"
      ? getGoogleDesktopClientId()
      : getGithubClientId()
  if (!value) {
    throw new Error(`${providerName} OAuth client ID is not configured on this Windows device`)
  }
  return value
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

export async function startGoogleBrowserSignIn(): Promise<NativeFirebasePendingAuthSession> {
  const clientId = requiredPublicClientId("VITE_GOOGLE_DESKTOP_CLIENT_ID", "Google")
  const response = await invoke<NativeFirebaseLoopbackStart>("firebase_start_google_loopback_sign_in", {
    clientId,
  })
  if (response.flow !== "loopback" || !response.authorizationUrl || !response.callbackUrl) {
    throw new Error("Google sign-in did not return a browser authorization session")
  }
  return {
    kind: "loopback",
    providerId: "google.com",
    providerLabel: "Google",
    clientId,
    sessionId: response.sessionId,
    authorizationUrl: response.authorizationUrl,
    callbackUrl: response.callbackUrl,
    expiresInSecs: response.expiresInSecs,
    startedAt: Date.now(),
  }
}

export async function startGithubBrowserSignIn(): Promise<NativeFirebasePendingAuthSession> {
  const clientId = requiredPublicClientId("VITE_GITHUB_OAUTH_CLIENT_ID", "GitHub")
  const response = await invoke<NativeFirebaseLoopbackStart>("firebase_start_github_loopback_sign_in", {
    clientId,
  })
  if (
    response.flow !== "device_code" ||
    !response.verificationUri ||
    !response.userCode ||
    response.pollIntervalSecs == null
  ) {
    throw new Error("GitHub sign-in did not return a device authorization session")
  }
  return {
    kind: "device_code",
    providerId: "github.com",
    providerLabel: "GitHub",
    clientId,
    sessionId: response.sessionId,
    verificationUri: response.verificationUri,
    userCode: response.userCode,
    pollIntervalSecs: response.pollIntervalSecs,
    expiresInSecs: response.expiresInSecs,
    startedAt: Date.now(),
  }
}

export async function completeNativeBrowserSignIn(
  session: NativeFirebasePendingAuthSession,
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
      const delayMs =
        session.kind === "device_code"
          ? session.pollIntervalSecs * 1000
          : DEFAULT_FIREBASE_OAUTH_POLL_INTERVAL_MS
      window.setTimeout(resolve, delayMs)
    })

    const response = await invoke<NativeFirebaseLoopbackPoll>("firebase_poll_loopback_sign_in", {
      sessionId: session.sessionId,
    })

    if (session.kind === "device_code" && response.intervalSecs && response.intervalSecs > 0) {
      session = {
        ...session,
        pollIntervalSecs: response.intervalSecs,
      }
    }

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
    if (response.status === "failed") {
      throw new Error(response.error?.trim() || `${session.providerLabel} sign-in failed`)
    }
  }
}

export async function signInWithGoogle(): Promise<User> {
  const session = await startGoogleBrowserSignIn()
  const tokens = await completeNativeBrowserSignIn(session)
  return signInWithNativeTokens(tokens)
}

export async function signInWithGithub(): Promise<User> {
  const session = await startGithubBrowserSignIn()
  const tokens = await completeNativeBrowserSignIn(session)
  return signInWithNativeTokens(tokens)
}

export async function signOutFirebase(): Promise<void> {
  const { auth } = requiredServices()
  await signOut(auth)
}
