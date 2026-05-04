import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  signInWithRedirectMock: vi.fn(),
  getRedirectResultMock: vi.fn(),
  setPersistenceMock: vi.fn(),
  initializeAppMock: vi.fn(),
  getAuthMock: vi.fn(),
  getFirestoreMock: vi.fn(),
  onAuthStateChangedMock: vi.fn(),
  signOutMock: vi.fn(),
}))

class MockGoogleAuthProvider {
  setCustomParameters = vi.fn()
}

class MockGithubAuthProvider {
  addScope = vi.fn()
  setCustomParameters = vi.fn()
}

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
  getRedirectResult: state.getRedirectResultMock,
  signInWithRedirect: state.signInWithRedirectMock,
  setPersistence: state.setPersistenceMock,
  onAuthStateChanged: state.onAuthStateChangedMock,
  signOut: state.signOutMock,
}))

describe("firebase auth helpers", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    state.signInWithRedirectMock.mockReset()
    state.getRedirectResultMock.mockReset()
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

    state.initializeAppMock.mockReturnValue({ id: "app" })
    state.getAuthMock.mockReturnValue({ id: "auth" })
    state.getFirestoreMock.mockReturnValue({ id: "db" })
    state.setPersistenceMock.mockResolvedValue(undefined)
    state.getRedirectResultMock.mockResolvedValue(null)
    state.signInWithRedirectMock.mockResolvedValue(undefined)
    state.onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback(null)
      return () => undefined
    })
  })

  it("starts Google sign-in through the Firebase SDK redirect flow", async () => {
    const { signInWithGoogle } = await import("@/lib/firebase")
    await expect(signInWithGoogle()).rejects.toThrow("Redirecting to Google sign-in")

    expect(state.setPersistenceMock).toHaveBeenCalledWith(
      { id: "auth" },
      { id: "browserLocalPersistence" }
    )
    expect(state.signInWithRedirectMock).toHaveBeenCalledWith(
      { id: "auth" },
      expect.any(MockGoogleAuthProvider)
    )
  })

  it("starts GitHub sign-in through the Firebase SDK redirect flow", async () => {
    const { signInWithGithub } = await import("@/lib/firebase")
    await expect(signInWithGithub()).rejects.toThrow("Redirecting to GitHub sign-in")

    expect(state.signInWithRedirectMock).toHaveBeenCalledWith(
      { id: "auth" },
      expect.any(MockGithubAuthProvider)
    )
  })

  it("completes pending Firebase redirect results on startup", async () => {
    state.getRedirectResultMock.mockResolvedValue({ user: { uid: "redirect_user" } })

    const { initializeFirebaseAuthFlow } = await import("@/lib/firebase")
    await expect(initializeFirebaseAuthFlow()).resolves.toEqual({
      user: { uid: "redirect_user" },
    })
    expect(state.getRedirectResultMock).toHaveBeenCalledWith({ id: "auth" })
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
