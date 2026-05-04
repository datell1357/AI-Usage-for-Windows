import type { User } from "firebase/auth"
import { doc, getDoc, setDoc } from "firebase/firestore"
import type { PluginMeta, MetricLine } from "@/lib/plugin-types"
import type { PluginState } from "@/hooks/app/types"
import type { PluginSettings } from "@/lib/settings"
import {
  DEFAULT_MOBILE_SYNC_DEVICE_NAME,
  loadMobileSyncDeviceId,
  loadMobileSyncDeviceName,
  loadMobileSyncOAuthConfig,
  saveMobileSyncDeviceId,
  saveMobileSyncDeviceName,
} from "@/lib/settings"
import { getFirebaseRuntimeState, getFirebaseServices } from "@/lib/firebase"

export const MOBILE_SYNC_SCHEMA_VERSION = 1 as const
const DEVICE_ID_PREFIX = "dev_"
const DEVICE_ID_LENGTH = 12
const APP_NAME = "AI Usage for Windows"
const SNAPSHOT_SOURCE = "ai-usage-windows"

export type MobileSyncProviderStatus = "ok" | "error" | "loading" | "disabled" | "idle"
export type MobileSyncUploadStatus = "idle" | "syncing" | "success" | "error"

export type MobileSyncAccount = {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  providerIds: string[]
}

export type MobileSyncStatus = {
  isConfigured: boolean
  missingConfigKeys: string[]
  missingOAuthKeys: string[]
  googleSignInAvailable: boolean
  githubSignInAvailable: boolean
  googleDesktopClientId: string
  githubClientId: string
  isAuthenticated: boolean
  account: MobileSyncAccount | null
  deviceId: string | null
  deviceName: string
  syncEnabled: boolean
  linkedAt: string | null
  lastSeenAt: string | null
  lastUploadedAt: string | null
  lastUploadStatus: MobileSyncUploadStatus
  lastError: string | null
}

export type MobileSyncProviderSnapshot = {
  providerId: string
  displayName: string
  status: MobileSyncProviderStatus
  plan: string | null
  fetchedAt: string | null
  lines: MetricLine[]
  error: string | null
}

export type MobileSyncSnapshot = {
  schemaVersion: typeof MOBILE_SYNC_SCHEMA_VERSION
  fetchedAt: string
  providers: MobileSyncProviderSnapshot[]
}

export type MobileSyncUploadResult = {
  linkedAt: string
  lastSeenAt: string
  uploadedAt: string
  deviceId: string
  deviceName: string
}

type BuildMobileSyncSnapshotArgs = {
  pluginSettings: PluginSettings | null
  pluginsMeta: PluginMeta[]
  pluginStates: Record<string, PluginState>
}

function makeDefaultStatus(oauthConfig?: {
  googleDesktopClientId: string | null
  githubClientId: string | null
}): MobileSyncStatus {
  const runtime = getFirebaseRuntimeState()
    return {
      isConfigured: runtime.enabled,
      missingConfigKeys: runtime.missingKeys,
      missingOAuthKeys: runtime.missingOAuthKeys,
      googleSignInAvailable: runtime.enabled && runtime.googleClientConfigured,
    githubSignInAvailable: runtime.enabled && runtime.githubClientConfigured,
    googleDesktopClientId: oauthConfig?.googleDesktopClientId ?? "",
    githubClientId: oauthConfig?.githubClientId ?? "",
    isAuthenticated: false,
    account: null,
    deviceId: null,
    deviceName: DEFAULT_MOBILE_SYNC_DEVICE_NAME,
    syncEnabled: runtime.enabled,
    linkedAt: null,
    lastSeenAt: null,
    lastUploadedAt: null,
    lastUploadStatus: "idle",
    lastError: null,
  }
}

function createDeviceId(): string {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, DEVICE_ID_LENGTH)
  return `${DEVICE_ID_PREFIX}${suffix}`
}

export async function getStableMobileSyncDeviceId(): Promise<string> {
  const existing = await loadMobileSyncDeviceId()
  if (existing) return existing

  const next = createDeviceId()
  await saveMobileSyncDeviceId(next)
  return next
}

export async function getStoredMobileSyncDeviceName(): Promise<string> {
  return loadMobileSyncDeviceName()
}

function sanitizePathLikeValue(value: string): string {
  return value
    .replace(/[A-Za-z]:\\[^\s]+/g, "[redacted]")
    .replace(/(?:^|\s)\/[^\s]+/g, " [redacted]")
}

function sanitizeTextValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  if (normalized.length === 0) return ""
  if (normalized.length > 160 || normalized.includes("\n") || normalized.includes("\r")) {
    return "[redacted]"
  }
  if (/(token|refresh token|api key|apikey|cookie|session|credential|secret|bearer)/i.test(normalized)) {
    return "[redacted]"
  }
  const sanitized = sanitizePathLikeValue(normalized)
  return sanitized.length > 160 ? "[redacted]" : sanitized
}

function sanitizeMetricLine(line: MetricLine): MetricLine {
  if (line.type === "progress") {
    return line
  }

  if (line.type === "text") {
    return {
      ...line,
      value: sanitizeTextValue(line.value) ?? "",
      subtitle: sanitizeTextValue(line.subtitle),
    }
  }

  return {
    ...line,
    text: sanitizeTextValue(line.text) ?? "",
    subtitle: sanitizeTextValue(line.subtitle),
  }
}

export function buildMobileSyncSnapshot({
  pluginSettings,
  pluginsMeta,
  pluginStates,
}: BuildMobileSyncSnapshotArgs): MobileSyncSnapshot {
  const fetchedAt = new Date().toISOString()

  if (!pluginSettings) {
    return {
      schemaVersion: MOBILE_SYNC_SCHEMA_VERSION,
      fetchedAt,
      providers: [],
    }
  }

  const pluginMap = new Map(pluginsMeta.map((plugin) => [plugin.id, plugin]))
  const disabled = new Set(pluginSettings.disabled)

  return {
    schemaVersion: MOBILE_SYNC_SCHEMA_VERSION,
    fetchedAt,
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
          status,
          plan: sanitizeTextValue(pluginState?.data?.plan) ?? null,
          fetchedAt: pluginState?.lastManualRefreshAt
            ? new Date(pluginState.lastManualRefreshAt).toISOString()
            : null,
          lines: (pluginState?.data?.lines ?? []).map(sanitizeMetricLine),
          error: pluginState?.error ? "Provider refresh failed" : null,
        } satisfies MobileSyncProviderSnapshot
      })
      .filter((provider): provider is MobileSyncProviderSnapshot => Boolean(provider)),
  }
}

function mapAccount(user: User): MobileSyncAccount {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    providerIds: user.providerData
      .map((provider) => provider.providerId)
      .filter((providerId): providerId is string => Boolean(providerId)),
  }
}

type EnsureDeviceResult = {
  deviceId: string
  deviceName: string
  linkedAt: string
  syncEnabled: boolean
  revokedAt: string | null
  lastSeenAt: string | null
}

export async function ensureMobileSyncDevice(
  user: User,
  appVersion: string
): Promise<EnsureDeviceResult> {
  const services = getFirebaseServices()
  if (!services) {
    throw new Error("Firebase is not configured on this Windows device")
  }

  const deviceId = await getStableMobileSyncDeviceId()
  const localDeviceName = await loadMobileSyncDeviceName()
  const now = new Date().toISOString()

  const userRef = doc(services.db, "users", user.uid)
  const deviceRef = doc(services.db, "users", user.uid, "devices", deviceId)

  const [userSnapshot, deviceSnapshot] = await Promise.all([getDoc(userRef), getDoc(deviceRef)])
  const existingDevice = deviceSnapshot.exists() ? deviceSnapshot.data() : null
  const existingUser = userSnapshot.exists() ? userSnapshot.data() : null
  const linkedAt = typeof existingDevice?.linkedAt === "string" ? existingDevice.linkedAt : now
  const remoteName =
    typeof existingDevice?.name === "string" && existingDevice.name.trim().length > 0
      ? existingDevice.name.trim()
      : null
  const deviceName = remoteName ?? localDeviceName

  if (remoteName && remoteName !== localDeviceName) {
    await saveMobileSyncDeviceName(remoteName)
  }

  await Promise.all([
    setDoc(
      userRef,
      {
        uid: user.uid,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        authProviders: mapAccount(user).providerIds,
        createdAt:
          typeof existingUser?.createdAt === "string" ? existingUser.createdAt : now,
        updatedAt: now,
      },
      { merge: true }
    ),
    setDoc(
      deviceRef,
      {
        deviceId,
        name: deviceName,
        platform: "windows",
        appName: APP_NAME,
        appVersion,
        linkedAt,
        lastSeenAt: typeof existingDevice?.lastSeenAt === "string" ? existingDevice.lastSeenAt : null,
        syncEnabled: existingDevice?.syncEnabled !== false,
        revokedAt: existingDevice?.revokedAt ?? null,
      },
      { merge: true }
    ),
  ])

  return {
    deviceId,
    deviceName,
    linkedAt,
    syncEnabled: existingDevice?.syncEnabled !== false,
    revokedAt:
      typeof existingDevice?.revokedAt === "string" ? existingDevice.revokedAt : null,
    lastSeenAt:
      typeof existingDevice?.lastSeenAt === "string" ? existingDevice.lastSeenAt : null,
  }
}

export async function writeMobileSyncDeviceName(
  user: User,
  appVersion: string,
  deviceName: string
): Promise<EnsureDeviceResult> {
  const services = getFirebaseServices()
  if (!services) {
    throw new Error("Firebase is not configured on this Windows device")
  }

  const trimmedName =
    sanitizeTextValue(deviceName)?.trim() || DEFAULT_MOBILE_SYNC_DEVICE_NAME
  await saveMobileSyncDeviceName(trimmedName)

  const ensured = await ensureMobileSyncDevice(user, appVersion)
  const deviceRef = doc(services.db, "users", user.uid, "devices", ensured.deviceId)
  await setDoc(deviceRef, { name: trimmedName, appVersion }, { merge: true })

  return {
    ...ensured,
    deviceName: trimmedName,
  }
}

export async function uploadMobileSyncSnapshot(
  user: User,
  appVersion: string,
  snapshot: MobileSyncSnapshot
): Promise<MobileSyncUploadResult> {
  const services = getFirebaseServices()
  if (!services) {
    throw new Error("Firebase is not configured on this Windows device")
  }

  const ensured = await ensureMobileSyncDevice(user, appVersion)
  if (!ensured.syncEnabled || ensured.revokedAt) {
    throw new Error("Mobile Sync is disabled for this device")
  }

  const now = new Date().toISOString()
  const deviceRef = doc(services.db, "users", user.uid, "devices", ensured.deviceId)
  const snapshotRef = doc(
    services.db,
    "users",
    user.uid,
    "devices",
    ensured.deviceId,
    "snapshots",
    "latest"
  )

  await Promise.all([
    setDoc(
      deviceRef,
      {
        name: ensured.deviceName,
        appVersion,
        lastSeenAt: now,
        syncEnabled: true,
        revokedAt: null,
      },
      { merge: true }
    ),
    setDoc(
      snapshotRef,
      {
        ...snapshot,
        uploadedAt: now,
        source: SNAPSHOT_SOURCE,
      },
      { merge: false }
    ),
  ])

  return {
    linkedAt: ensured.linkedAt,
    lastSeenAt: now,
    uploadedAt: now,
    deviceId: ensured.deviceId,
    deviceName: ensured.deviceName,
  }
}

export async function getInitialMobileSyncStatus(): Promise<MobileSyncStatus> {
  const [deviceId, deviceName, oauthConfig] = await Promise.all([
    loadMobileSyncDeviceId(),
    loadMobileSyncDeviceName(),
    loadMobileSyncOAuthConfig(),
  ])
  return {
    ...makeDefaultStatus(oauthConfig),
    deviceId,
    deviceName,
  }
}

export function buildAuthenticatedMobileSyncStatus(
  user: User,
  previousStatus: MobileSyncStatus,
  ensuredDevice: EnsureDeviceResult
): MobileSyncStatus {
  const runtime = getFirebaseRuntimeState()
  return {
    ...previousStatus,
    isConfigured: runtime.enabled,
    missingConfigKeys: runtime.missingKeys,
    missingOAuthKeys: runtime.missingOAuthKeys,
    googleSignInAvailable: runtime.enabled && runtime.googleClientConfigured,
    githubSignInAvailable: runtime.enabled && runtime.githubClientConfigured,
    isAuthenticated: true,
    account: mapAccount(user),
    deviceId: ensuredDevice.deviceId,
    deviceName: ensuredDevice.deviceName,
    syncEnabled: ensuredDevice.syncEnabled && ensuredDevice.revokedAt == null,
    linkedAt: ensuredDevice.linkedAt,
    lastSeenAt: ensuredDevice.lastSeenAt,
  }
}

export function buildSignedOutMobileSyncStatus(previousStatus?: MobileSyncStatus): MobileSyncStatus {
  const fallback = makeDefaultStatus(previousStatus)
  if (!previousStatus) {
    return fallback
  }

  return {
    ...fallback,
    deviceId: previousStatus.deviceId,
    deviceName: previousStatus.deviceName,
    lastUploadedAt: previousStatus.lastUploadedAt,
    lastUploadStatus: previousStatus.lastUploadStatus,
    lastError: previousStatus.lastError,
  }
}
