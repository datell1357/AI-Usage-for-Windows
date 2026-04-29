import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PluginMeta } from "@/lib/plugin-types"
import type { PluginSettings } from "@/lib/settings"
import type { PluginState } from "@/hooks/app/types"
import {
  buildMobileSyncSnapshot,
  getMobileSyncStatus,
  linkMobileSyncDevice,
  syncMobileSnapshot,
  unlinkMobileSyncDevice,
  type MobileSyncStatus,
} from "@/lib/mobile-sync"

type UseMobileSyncArgs = {
  pluginSettings: PluginSettings | null
  pluginsMeta: PluginMeta[]
  pluginStates: Record<string, PluginState>
}

export function useMobileSync({
  pluginSettings,
  pluginsMeta,
  pluginStates,
}: UseMobileSyncArgs) {
  const [status, setStatus] = useState<MobileSyncStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastUploadedFingerprintRef = useRef<string | null>(null)

  const snapshot = useMemo(
    () =>
      buildMobileSyncSnapshot({
        pluginSettings,
        pluginsMeta,
        pluginStates,
      }),
    [pluginSettings, pluginsMeta, pluginStates]
  )
  const snapshotFingerprint = useMemo(() => JSON.stringify(snapshot), [snapshot])

  const refreshStatus = useCallback(async () => {
    const nextStatus = await getMobileSyncStatus()
    setStatus(nextStatus)
    return nextStatus
  }, [])

  useEffect(() => {
    void refreshStatus().catch((refreshError) => {
      console.error("Failed to load mobile sync status:", refreshError)
      setError("Failed to load Mobile Sync status")
    })
  }, [refreshStatus])

  const handleLink = useCallback(
    async (code: string, deviceName: string) => {
      setBusy(true)
      setError(null)
      try {
        const nextStatus = await linkMobileSyncDevice(code, deviceName, snapshot)
        setStatus(nextStatus)
        lastUploadedFingerprintRef.current = snapshotFingerprint
      } catch (linkError) {
        console.error("Failed to link mobile sync device:", linkError)
        setError(linkError instanceof Error ? linkError.message : "Failed to link device")
        throw linkError
      } finally {
        setBusy(false)
      }
    },
    [snapshot, snapshotFingerprint]
  )

  const handleSyncNow = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const nextStatus = await syncMobileSnapshot(snapshot)
      setStatus(nextStatus)
      lastUploadedFingerprintRef.current = snapshotFingerprint
    } catch (syncError) {
      console.error("Failed to sync mobile snapshot:", syncError)
      setError(syncError instanceof Error ? syncError.message : "Failed to sync now")
      throw syncError
    } finally {
      setBusy(false)
    }
  }, [snapshot, snapshotFingerprint])

  const handleUnlink = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const nextStatus = await unlinkMobileSyncDevice()
      setStatus(nextStatus)
      lastUploadedFingerprintRef.current = null
    } catch (unlinkError) {
      console.error("Failed to unlink mobile sync device:", unlinkError)
      setError(unlinkError instanceof Error ? unlinkError.message : "Failed to unlink device")
      throw unlinkError
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!status?.isLinked || !status.baseUrlConfigured || !status.credentialStored) return
    if (busy || snapshot.providers.length === 0) return
    if (lastUploadedFingerprintRef.current === snapshotFingerprint) return

    const timeout = window.setTimeout(() => {
      void syncMobileSnapshot(snapshot)
        .then((nextStatus) => {
          setStatus(nextStatus)
          setError(null)
          lastUploadedFingerprintRef.current = snapshotFingerprint
        })
        .catch((syncError) => {
          console.error("Failed to auto-sync mobile snapshot:", syncError)
          setError(syncError instanceof Error ? syncError.message : "Failed to auto-sync snapshot")
        })
    }, 1500)

    return () => window.clearTimeout(timeout)
  }, [busy, snapshot, snapshot.providers.length, snapshotFingerprint, status])

  return {
    mobileSyncStatus: status,
    mobileSyncBusy: busy,
    mobileSyncError: error,
    refreshMobileSyncStatus: refreshStatus,
    handleMobileSyncLink: handleLink,
    handleMobileSyncSyncNow: handleSyncNow,
    handleMobileSyncUnlink: handleUnlink,
  }
}
