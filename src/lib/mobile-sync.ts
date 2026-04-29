import { invoke } from "@tauri-apps/api/core"
import type { PluginMeta, MetricLine } from "@/lib/plugin-types"
import type { PluginState } from "@/hooks/app/types"
import type { PluginSettings } from "@/lib/settings"

export const MOBILE_SYNC_SCHEMA_VERSION = 1 as const

export type MobileSyncProviderStatus = "ok" | "error" | "loading" | "disabled" | "idle"
export type MobileSyncUploadStatus = "idle" | "success" | "error"

export type MobileSyncConnection = {
  deviceId: string
  deviceName: string
  linkedAt: string
  lastUploadedAt: string | null
  lastUploadStatus: MobileSyncUploadStatus
  lastError: string | null
  syncProtocolVersion: number
  schemaVersion: number
}

export type MobileSyncStatus = {
  baseUrlConfigured: boolean
  credentialStored: boolean
  isLinked: boolean
  connection: MobileSyncConnection | null
}

export type MobileSyncProviderSnapshot = {
  providerId: string
  displayName: string
  iconUrl: string
  plan: string | null
  status: MobileSyncProviderStatus
  lines: MetricLine[]
  error: string | null
  refreshedAt: string | null
}

export type MobileSyncSnapshot = {
  schemaVersion: typeof MOBILE_SYNC_SCHEMA_VERSION
  generatedAt: string
  providers: MobileSyncProviderSnapshot[]
}

type BuildMobileSyncSnapshotArgs = {
  pluginSettings: PluginSettings | null
  pluginsMeta: PluginMeta[]
  pluginStates: Record<string, PluginState>
}

export function buildMobileSyncSnapshot({
  pluginSettings,
  pluginsMeta,
  pluginStates,
}: BuildMobileSyncSnapshotArgs): MobileSyncSnapshot {
  if (!pluginSettings) {
    return {
      schemaVersion: MOBILE_SYNC_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      providers: [],
    }
  }

  const pluginMap = new Map(pluginsMeta.map((plugin) => [plugin.id, plugin]))
  const disabled = new Set(pluginSettings.disabled)

  return {
    schemaVersion: MOBILE_SYNC_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    providers: pluginSettings.order
      .map((pluginId) => {
        const meta = pluginMap.get(pluginId)
        if (!meta) return null

        const pluginState = pluginStates[pluginId]
        const isDisabled = disabled.has(pluginId)
        const status: MobileSyncProviderStatus = isDisabled
          ? "disabled"
          : pluginState?.loading
            ? "loading"
            : pluginState?.error
              ? "error"
              : pluginState?.data
                ? "ok"
                : "idle"

        return {
          providerId: pluginId,
          displayName: meta.name,
          iconUrl: meta.iconUrl,
          plan: pluginState?.data?.plan ?? null,
          status,
          lines: pluginState?.data?.lines ?? [],
          error: pluginState?.error ?? null,
          refreshedAt: pluginState?.lastManualRefreshAt
            ? new Date(pluginState.lastManualRefreshAt).toISOString()
            : null,
        } satisfies MobileSyncProviderSnapshot
      })
      .filter((provider): provider is MobileSyncProviderSnapshot => Boolean(provider)),
  }
}

export async function getMobileSyncStatus(): Promise<MobileSyncStatus> {
  return invoke<MobileSyncStatus>("mobile_sync_get_status")
}

export async function linkMobileSyncDevice(
  code: string,
  deviceName: string,
  snapshot: MobileSyncSnapshot
): Promise<MobileSyncStatus> {
  return invoke<MobileSyncStatus>("mobile_sync_link_device", {
    code,
    deviceName,
    snapshot,
  })
}

export async function syncMobileSnapshot(
  snapshot: MobileSyncSnapshot
): Promise<MobileSyncStatus> {
  return invoke<MobileSyncStatus>("mobile_sync_sync_now", { snapshot })
}

export async function unlinkMobileSyncDevice(): Promise<MobileSyncStatus> {
  return invoke<MobileSyncStatus>("mobile_sync_unlink_device")
}
