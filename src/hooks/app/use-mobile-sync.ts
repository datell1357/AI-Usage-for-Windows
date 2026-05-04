import type { User } from "firebase/auth"
import { getVersion } from "@tauri-apps/api/app"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PluginMeta } from "@/lib/plugin-types"
import {
  completeNativeDeviceCodeSignIn,
  initializeFirebaseAuthFlow,
  signInWithNativeTokens,
  startGithubDeviceCodeSignIn,
  startGoogleDeviceCodeSignIn,
  signOutFirebase,
  watchFirebaseUser,
  type NativeFirebaseDeviceCodeSession,
} from "@/lib/firebase"
import {
  buildAuthenticatedMobileSyncStatus,
  buildMobileSyncSnapshot,
  buildSignedOutMobileSyncStatus,
  ensureMobileSyncDevice,
  getInitialMobileSyncStatus,
  uploadMobileSyncSnapshot,
  writeMobileSyncDeviceName,
  type MobileSyncStatus,
} from "@/lib/mobile-sync"
import type { PluginSettings } from "@/lib/settings"
import type { PluginState } from "@/hooks/app/types"

type UseMobileSyncArgs = {
  pluginSettings: PluginSettings | null
  pluginsMeta: PluginMeta[]
  pluginStates: Record<string, PluginState>
}

const PERIODIC_SYNC_INTERVAL_MS = 5 * 60 * 1000

function formatErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return fallback
}

export function useMobileSync({
  pluginSettings,
  pluginsMeta,
  pluginStates,
}: UseMobileSyncArgs) {
  const [status, setStatus] = useState<MobileSyncStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [pendingDeviceCodeAuth, setPendingDeviceCodeAuth] =
    useState<NativeFirebaseDeviceCodeSession | null>(null)
  const appVersionRef = useRef("0.2.0")
  const lastUploadedFingerprintRef = useRef<string | null>(null)
  const authAbortControllerRef = useRef<AbortController | null>(null)

  const snapshot = useMemo(
    () =>
      buildMobileSyncSnapshot({
        pluginSettings,
        pluginsMeta,
        pluginStates,
      }),
    [pluginSettings, pluginsMeta, pluginStates]
  )
  const snapshotRef = useRef(snapshot)
  const snapshotFingerprint = useMemo(() => JSON.stringify(snapshot), [snapshot])

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  const applyUploadedStatus = useCallback(
    (uploadedAt: string, lastSeenAt: string, fingerprint: string) => {
      setStatus((currentStatus) =>
        currentStatus
          ? {
              ...currentStatus,
              lastUploadedAt: uploadedAt,
              lastSeenAt,
              lastUploadStatus: "success",
              lastError: null,
            }
          : currentStatus
      )
      lastUploadedFingerprintRef.current = fingerprint
    },
    []
  )

  const syncNow = useCallback(
    async (user: User, fingerprint: string) => {
      setStatus((currentStatus) =>
        currentStatus
          ? {
              ...currentStatus,
              lastUploadStatus: "syncing",
              lastError: null,
            }
          : currentStatus
      )

      const result = await uploadMobileSyncSnapshot(user, appVersionRef.current, snapshotRef.current)
      applyUploadedStatus(result.uploadedAt, result.lastSeenAt, fingerprint)
      return result
    },
    [applyUploadedStatus]
  )

  useEffect(() => {
    let cancelled = false

    getVersion()
      .then((version) => {
        appVersionRef.current = version
      })
      .catch((versionError) => {
        console.error("Failed to load app version for Mobile Sync:", versionError)
      })

    void getInitialMobileSyncStatus()
      .then((initialStatus) => {
        if (!cancelled) {
          setStatus(initialStatus)
        }
      })
      .catch((initialError) => {
        console.error("Failed to load Mobile Sync status:", initialError)
        if (!cancelled) {
          setError("Failed to load Mobile Sync status")
        }
      })

    void initializeFirebaseAuthFlow().catch((redirectError) => {
      console.error("Failed to complete Firebase redirect sign-in:", redirectError)
      if (!cancelled) {
        setError(formatErrorMessage(redirectError, "Failed to complete sign-in"))
      }
    })

    let unsubscribe: (() => void) | undefined

    try {
      unsubscribe = watchFirebaseUser(async (user) => {
        if (cancelled) return

        if (!user) {
          setCurrentUser(null)
          lastUploadedFingerprintRef.current = null
          setStatus((currentStatus) => buildSignedOutMobileSyncStatus(currentStatus ?? undefined))
          return
        }

        try {
          const ensured = await ensureMobileSyncDevice(user, appVersionRef.current)
          if (cancelled) return

          setCurrentUser(user)
          setStatus((currentStatus) =>
            buildAuthenticatedMobileSyncStatus(
              user,
              currentStatus ?? buildSignedOutMobileSyncStatus(),
              ensured
            )
          )
          setError(null)
          await syncNow(user, JSON.stringify(snapshotRef.current))
        } catch (authError) {
          console.error("Failed to initialize Mobile Sync device:", authError)
          if (cancelled) return

          setCurrentUser(user)
          setStatus((currentStatus) =>
            currentStatus
              ? {
                  ...currentStatus,
                  isAuthenticated: true,
                  account: {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                    photoURL: user.photoURL,
                    providerIds: user.providerData
                      .map((provider) => provider.providerId)
                      .filter((providerId): providerId is string => Boolean(providerId)),
                  },
                  syncEnabled: false,
                }
              : currentStatus
          )
          setError(formatErrorMessage(authError, "Failed to initialize Mobile Sync"))
        }
      })
    } catch (watchError) {
      console.error("Failed to watch Firebase auth state:", watchError)
      setError(formatErrorMessage(watchError, "Firebase is not configured on this Windows device"))
    }

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [syncNow])

  const handleGoogleSignIn = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const session = await startGoogleDeviceCodeSignIn()
      setPendingDeviceCodeAuth(session)
      authAbortControllerRef.current?.abort()
      const controller = new AbortController()
      authAbortControllerRef.current = controller
      const tokens = await completeNativeDeviceCodeSignIn(session, controller.signal)
      await signInWithNativeTokens(tokens)
    } catch (signInError) {
      console.error("Failed to sign in with Google:", signInError)
      setError(formatErrorMessage(signInError, "Failed to sign in with Google"))
      throw signInError
    } finally {
      authAbortControllerRef.current = null
      setPendingDeviceCodeAuth(null)
      setBusy(false)
    }
  }, [])

  const handleGithubSignIn = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const session = await startGithubDeviceCodeSignIn()
      setPendingDeviceCodeAuth(session)
      authAbortControllerRef.current?.abort()
      const controller = new AbortController()
      authAbortControllerRef.current = controller
      const tokens = await completeNativeDeviceCodeSignIn(session, controller.signal)
      await signInWithNativeTokens(tokens)
    } catch (signInError) {
      console.error("Failed to sign in with GitHub:", signInError)
      setError(formatErrorMessage(signInError, "Failed to sign in with GitHub"))
      throw signInError
    } finally {
      authAbortControllerRef.current = null
      setPendingDeviceCodeAuth(null)
      setBusy(false)
    }
  }, [])

  const handleSyncNow = useCallback(async () => {
    if (!currentUser) {
      const missingAuthError = new Error("Sign in before syncing with mobile")
      setError(missingAuthError.message)
      throw missingAuthError
    }

    setBusy(true)
    setError(null)
    try {
      await syncNow(currentUser, snapshotFingerprint)
    } catch (syncError) {
      console.error("Failed to sync mobile snapshot:", syncError)
      const message = formatErrorMessage(syncError, "Failed to sync now")
      setError(message)
      setStatus((currentStatus) =>
        currentStatus
          ? {
              ...currentStatus,
              lastUploadStatus: "error",
              lastError: message,
            }
          : currentStatus
      )
      throw syncError
    } finally {
      setBusy(false)
    }
  }, [currentUser, snapshotFingerprint, syncNow])

  const handleSignOut = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await signOutFirebase()
      setCurrentUser(null)
      lastUploadedFingerprintRef.current = null
    } catch (signOutError) {
      console.error("Failed to sign out of Mobile Sync:", signOutError)
      setError(formatErrorMessage(signOutError, "Failed to sign out"))
      throw signOutError
    } finally {
      setBusy(false)
    }
  }, [])

  const handleDeviceNameSave = useCallback(
    async (deviceName: string) => {
      if (!currentUser) {
        const missingAuthError = new Error("Sign in before changing the device name")
        setError(missingAuthError.message)
        throw missingAuthError
      }

      setBusy(true)
      setError(null)
      try {
        const ensured = await writeMobileSyncDeviceName(
          currentUser,
          appVersionRef.current,
          deviceName
        )
        setStatus((currentStatus) =>
          currentStatus
            ? {
                ...currentStatus,
                deviceName: ensured.deviceName,
                deviceId: ensured.deviceId,
                linkedAt: ensured.linkedAt,
                syncEnabled: ensured.syncEnabled && ensured.revokedAt == null,
              }
            : currentStatus
        )
      } catch (renameError) {
        console.error("Failed to save Mobile Sync device name:", renameError)
        setError(formatErrorMessage(renameError, "Failed to save device name"))
        throw renameError
      } finally {
        setBusy(false)
      }
    },
    [currentUser]
  )

  useEffect(() => {
    if (!currentUser || !status?.isAuthenticated || !status.syncEnabled) return
    if (busy) return
    if (lastUploadedFingerprintRef.current === snapshotFingerprint) return

    const timeout = window.setTimeout(() => {
      void syncNow(currentUser, snapshotFingerprint).catch((syncError) => {
        console.error("Failed to auto-sync mobile snapshot:", syncError)
        const message = formatErrorMessage(syncError, "Failed to auto-sync snapshot")
        setError(message)
        setStatus((currentStatus) =>
          currentStatus
            ? {
                ...currentStatus,
                lastUploadStatus: "error",
                lastError: message,
              }
            : currentStatus
        )
      })
    }, 1500)

    return () => window.clearTimeout(timeout)
  }, [busy, currentUser, snapshotFingerprint, status, syncNow])

  useEffect(() => {
    if (!currentUser || !status?.isAuthenticated || !status.syncEnabled) return

    const interval = window.setInterval(() => {
      void syncNow(currentUser, JSON.stringify(snapshotRef.current)).catch((syncError) => {
        console.error("Failed to perform periodic mobile sync:", syncError)
      })
    }, PERIODIC_SYNC_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [currentUser, status, syncNow])

  useEffect(() => {
    return () => {
      authAbortControllerRef.current?.abort()
    }
  }, [])

  return {
    mobileSyncStatus: status,
    mobileSyncBusy: busy,
    mobileSyncError: error,
    mobileSyncPendingDeviceCodeAuth: pendingDeviceCodeAuth,
    handleMobileSyncGoogleSignIn: handleGoogleSignIn,
    handleMobileSyncGithubSignIn: handleGithubSignIn,
    handleMobileSyncSyncNow: handleSyncNow,
    handleMobileSyncSignOut: handleSignOut,
    handleMobileSyncSaveDeviceName: handleDeviceNameSave,
  }
}
