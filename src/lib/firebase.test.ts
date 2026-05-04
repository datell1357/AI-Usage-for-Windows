import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  signInWithCredentialMock: vi.fn(),
  setPersistenceMock: vi.fn(),
  initializeAppMock: vi.fn(),
  getAuthMock: vi.fn(),
  getFirestoreMock: vi.fn(),
  onAuthStateChangedMock: vi.fn(),
  googleCredentialMock: vi.fn(),
  githubCredentialMock: vi.fn(),
}))

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
  GoogleAuthProvider: {
    credential: state.googleCredentialMock,
  },
  GithubAuthProvider: {
    credential: state.githubCredentialMock,
  },
  signInWithCredential: state.signInWithCredentialMock,
  setPersistence: state.setPersistenceMock,
  onAuthStateChanged: state.onAuthStateChangedMock,
  signOut: vi.fn(),
}))

describe("firebase native auth helpers", () => {
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
    state.googleCredentialMock.mockReset()
    state.githubCredentialMock.mockReset()

    vi.stubEnv("VITE_FIREBASE_API_KEY", "firebase-api-key")
    vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "ai-usage-for-mobile.firebaseapp.com")
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "ai-usage-for-mobile")
    vi.stubEnv("VITE_FIREBASE_APP_ID", "firebase-app-id")

    state.initializeAppMock.mockReturnValue({ id: "app" })
    state.getAuthMock.mockReturnValue({ id: "auth" })
    state.getFirestoreMock.mockReturnValue({ id: "db" })
    state.setPersistenceMock.mockResolvedValue(undefined)
    state.onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback(null)
      return () => undefined
    })
  })

  it("signs in with Google using loopback browser auth tokens", async () => {
    vi.stubEnv("VITE_GOOGLE_DESKTOP_CLIENT_ID", "google-desktop-client-id")
    state.invokeMock
      .mockResolvedValueOnce({
        providerId: "google.com",
        flow: "loopback",
        sessionId: "google-session",
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=test",
        callbackUrl: "http://127.0.0.1:43123/oauth/callback",
        expiresInSecs: 900,
      })
      .mockResolvedValueOnce({
        status: "approved",
        accessToken: "google-access-token",
        idToken: "google-id-token",
      })
    state.googleCredentialMock.mockReturnValue({ provider: "google" })
    state.signInWithCredentialMock.mockResolvedValue({
      user: { uid: "user_google" },
    })

    const { signInWithGoogle } = await import("@/lib/firebase")
    await expect(signInWithGoogle()).resolves.toEqual({ uid: "user_google" })

    expect(state.invokeMock).toHaveBeenCalledWith(
      "firebase_start_google_loopback_sign_in",
      { clientId: "google-desktop-client-id" }
    )
    expect(state.invokeMock).toHaveBeenCalledWith(
      "firebase_poll_loopback_sign_in",
      {
        sessionId: "google-session",
      }
    )
    expect(state.googleCredentialMock).toHaveBeenCalledWith(
      "google-id-token",
      "google-access-token"
    )
    expect(state.signInWithCredentialMock).toHaveBeenCalledWith(
      { id: "auth" },
      { provider: "google" }
    )
  })

  it("signs in with GitHub using loopback browser auth tokens", async () => {
    vi.stubEnv("VITE_GITHUB_OAUTH_CLIENT_ID", "github-client-id")
    state.invokeMock
      .mockResolvedValueOnce({
        providerId: "github.com",
        flow: "device_code",
        sessionId: "github-session",
        verificationUri: "https://github.com/login/device",
        userCode: "WDJB-MJHT",
        expiresInSecs: 900,
        pollIntervalSecs: 0,
      })
      .mockResolvedValueOnce({
        status: "approved",
        accessToken: "github-access-token",
        idToken: null,
      })
    state.githubCredentialMock.mockReturnValue({ provider: "github" })
    state.signInWithCredentialMock.mockResolvedValue({
      user: { uid: "user_github" },
    })

    const { signInWithGithub } = await import("@/lib/firebase")
    await expect(signInWithGithub()).resolves.toEqual({ uid: "user_github" })

    expect(state.invokeMock).toHaveBeenCalledWith(
      "firebase_start_github_loopback_sign_in",
      { clientId: "github-client-id" }
    )
    expect(state.invokeMock).toHaveBeenCalledWith(
      "firebase_poll_loopback_sign_in",
      { sessionId: "github-session" }
    )
    expect(state.githubCredentialMock).toHaveBeenCalledWith("github-access-token")
    expect(state.signInWithCredentialMock).toHaveBeenCalledWith(
      { id: "auth" },
      { provider: "github" }
    )
  })

  it("treats Google sign-in as available when only the public client id is configured", async () => {
    vi.stubEnv("VITE_GOOGLE_DESKTOP_CLIENT_ID", "google-desktop-client-id")

    const { getFirebaseRuntimeState } = await import("@/lib/firebase")
    expect(getFirebaseRuntimeState()).toMatchObject({
      enabled: true,
      googleClientConfigured: true,
      githubClientConfigured: false,
    })
  })
})
