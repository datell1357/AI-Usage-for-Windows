import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  signInWithCredentialMock: vi.fn(),
  setPersistenceMock: vi.fn(),
  initializeAppMock: vi.fn(),
  getAuthMock: vi.fn(),
  getFirestoreMock: vi.fn(),
  onAuthStateChangedMock: vi.fn(),
  signOutMock: vi.fn(),
}))

class MockGoogleAuthProvider {
  static credential = vi.fn((idToken, accessToken) => ({
    providerId: "google.com",
    idToken,
    accessToken,
  }))
  setCustomParameters = vi.fn()
}

class MockGithubAuthProvider {
  static credential = vi.fn((accessToken) => ({
    providerId: "github.com",
    accessToken,
  }))
  addScope = vi.fn()
  setCustomParameters = vi.fn()
}

vi.mock("@tauri-apps/api/core", () => ({
  invoke: state.invokeMock,
}))

vi.mock("firebase/app", () => ({
  initializeApp: state.initializeAppMock,
}))

vi.mock("firebase/firestore", () => ({
  getFirestore: state.getFirestoreMock,
}))

vi.mock("firebase/auth", () => ({
  browserLocalPersistence: { id: "browserLocalPersistence" },
  getAuth: state.getAuthMock,
  GoogleAuthProvider: MockGoogleAuthProvider,
  GithubAuthProvider: MockGithubAuthProvider,
  signInWithCredential: state.signInWithCredentialMock,
  setPersistence: state.setPersistenceMock,
  onAuthStateChanged: state.onAuthStateChangedMock,
  signOut: state.signOutMock,
}))

describe("firebase auth helpers", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    state.invokeMock.mockReset()
    state.signInWithCredentialMock.mockReset()
    state.setPersistenceMock.mockReset()
    state.initializeAppMock.mockReset()
    state.getAuthMock.mockReset()
    state.getFirestoreMock.mockReset()
    state.onAuthStateChangedMock.mockReset()
    state.signOutMock.mockReset()

    vi.stubEnv("VITE_FIREBASE_API_KEY", "firebase-api-key")
    vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "ai-usage-for-mobile.firebaseapp.com")
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "ai-usage-for-mobile")
    vi.stubEnv("VITE_FIREBASE_APP_ID", "firebase-app-id")
    vi.stubEnv("VITE_GOOGLE_DESKTOP_CLIENT_ID", "google-desktop-client-id")
    vi.stubEnv("VITE_GITHUB_OAUTH_CLIENT_ID", "github-client-id")

    state.initializeAppMock.mockReturnValue({ id: "app" })
    state.getAuthMock.mockReturnValue({ id: "auth" })
    state.getFirestoreMock.mockReturnValue({ id: "db" })
    state.setPersistenceMock.mockResolvedValue(undefined)
    state.signInWithCredentialMock.mockResolvedValue({ user: { uid: "firebase_user" } })
    state.onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback(null)
      return () => undefined
    })
  })

  it("starts Google sign-in through native loopback OAuth", async () => {
    state.invokeMock.mockResolvedValue({
      flow: "loopback",
      providerId: "google.com",
      sessionId: "session_google",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      callbackUrl: "http://127.0.0.1:12345/oauth/callback",
      expiresInSecs: 900,
    })

    const { startGoogleBrowserSignIn } = await import("@/lib/firebase")
    await expect(startGoogleBrowserSignIn()).resolves.toMatchObject({
      kind: "loopback",
      providerId: "google.com",
      sessionId: "session_google",
    })

    expect(state.invokeMock).toHaveBeenCalledWith("firebase_start_google_loopback_sign_in", {
      clientId: "google-desktop-client-id",
    })
  })

  it("starts GitHub sign-in through device OAuth", async () => {
    state.invokeMock.mockResolvedValue({
      flow: "device_code",
      providerId: "github.com",
      sessionId: "session_github",
      verificationUri: "https://github.com/login/device",
      userCode: "ABCD-1234",
      pollIntervalSecs: 5,
      expiresInSecs: 900,
    })

    const { startGithubBrowserSignIn } = await import("@/lib/firebase")
    await expect(startGithubBrowserSignIn()).resolves.toMatchObject({
      kind: "device_code",
      providerId: "github.com",
      sessionId: "session_github",
    })

    expect(state.invokeMock).toHaveBeenCalledWith("firebase_start_github_loopback_sign_in", {
      clientId: "github-client-id",
    })
  })

  it("signs in to Firebase with native Google tokens", async () => {
    const { signInWithNativeTokens } = await import("@/lib/firebase")
    await expect(
      signInWithNativeTokens({
        providerId: "google.com",
        accessToken: "google-access-token",
        idToken: "google-id-token",
      })
    ).resolves.toEqual({ uid: "firebase_user" })

    expect(state.signInWithCredentialMock).toHaveBeenCalledWith(
      { id: "auth" },
      {
        providerId: "google.com",
        accessToken: "google-access-token",
        idToken: "google-id-token",
      }
    )
  })

  it("treats Firebase sign-in providers as available when Firebase is configured", async () => {
    const { getFirebaseRuntimeState } = await import("@/lib/firebase")
    expect(getFirebaseRuntimeState()).toMatchObject({
      enabled: true,
      googleClientConfigured: true,
      githubClientConfigured: true,
    })
  })
})
