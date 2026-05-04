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

  it("signs in with Google using native device-flow tokens", async () => {
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "google-client-id")
    state.invokeMock
      .mockResolvedValueOnce({
        providerId: "google.com",
        deviceCode: "google-device-code",
        userCode: "ABCD-EFGH",
        verificationUri: "https://google.example/device",
        expiresInSecs: 900,
        intervalSecs: 0,
      })
      .mockResolvedValueOnce({
        status: "approved",
        accessToken: "google-access-token",
        idToken: "google-id-token",
        intervalSecs: 0,
      })
    state.googleCredentialMock.mockReturnValue({ provider: "google" })
    state.signInWithCredentialMock.mockResolvedValue({
      user: { uid: "user_google" },
    })

    const { signInWithGoogle } = await import("@/lib/firebase")
    await expect(signInWithGoogle()).resolves.toEqual({ uid: "user_google" })

    expect(state.invokeMock).toHaveBeenCalledWith(
      "firebase_start_google_device_code_sign_in",
      { clientId: "google-client-id" }
    )
    expect(state.invokeMock).toHaveBeenCalledWith(
      "firebase_poll_google_device_code_sign_in",
      { clientId: "google-client-id", deviceCode: "google-device-code" }
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

  it("signs in with GitHub using native device-flow tokens", async () => {
    vi.stubEnv("VITE_GITHUB_OAUTH_CLIENT_ID", "github-client-id")
    state.invokeMock
      .mockResolvedValueOnce({
        providerId: "github.com",
        deviceCode: "github-device-code",
        userCode: "ZXCV-BNMQ",
        verificationUri: "https://github.com/login/device",
        expiresInSecs: 900,
        intervalSecs: 0,
      })
      .mockResolvedValueOnce({
        status: "approved",
        accessToken: "github-access-token",
        idToken: null,
        intervalSecs: 0,
      })
    state.githubCredentialMock.mockReturnValue({ provider: "github" })
    state.signInWithCredentialMock.mockResolvedValue({
      user: { uid: "user_github" },
    })

    const { signInWithGithub } = await import("@/lib/firebase")
    await expect(signInWithGithub()).resolves.toEqual({ uid: "user_github" })

    expect(state.invokeMock).toHaveBeenCalledWith(
      "firebase_start_github_device_code_sign_in",
      { clientId: "github-client-id" }
    )
    expect(state.invokeMock).toHaveBeenCalledWith(
      "firebase_poll_github_device_code_sign_in",
      { clientId: "github-client-id", deviceCode: "github-device-code" }
    )
    expect(state.githubCredentialMock).toHaveBeenCalledWith("github-access-token")
    expect(state.signInWithCredentialMock).toHaveBeenCalledWith(
      { id: "auth" },
      { provider: "github" }
    )
  })
})
