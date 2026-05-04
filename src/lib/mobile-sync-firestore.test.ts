import { beforeEach, describe, expect, it, vi } from "vitest"

const firestoreState = vi.hoisted(() => ({
  getDocMock: vi.fn(),
  setDocMock: vi.fn(),
}))

const firebaseState = vi.hoisted(() => ({
  getFirebaseRuntimeStateMock: vi.fn(),
  getFirebaseServicesMock: vi.fn(),
}))

const settingsState = vi.hoisted(() => ({
  loadMobileSyncDeviceIdMock: vi.fn(),
  saveMobileSyncDeviceIdMock: vi.fn(),
  loadMobileSyncDeviceNameMock: vi.fn(),
  saveMobileSyncDeviceNameMock: vi.fn(),
}))

vi.mock("firebase/firestore", () => ({
  doc: (...segments: unknown[]) => {
    const pathSegments =
      typeof segments[0] === "object" ? segments.slice(1) : segments
    return pathSegments.join("/")
  },
  getDoc: firestoreState.getDocMock,
  setDoc: firestoreState.setDocMock,
}))

vi.mock("@/lib/firebase", () => ({
  getFirebaseRuntimeState: firebaseState.getFirebaseRuntimeStateMock,
  getFirebaseServices: firebaseState.getFirebaseServicesMock,
}))

vi.mock("@/lib/settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/settings")>("@/lib/settings")
  return {
    ...actual,
    loadMobileSyncDeviceId: settingsState.loadMobileSyncDeviceIdMock,
    saveMobileSyncDeviceId: settingsState.saveMobileSyncDeviceIdMock,
    loadMobileSyncDeviceName: settingsState.loadMobileSyncDeviceNameMock,
    saveMobileSyncDeviceName: settingsState.saveMobileSyncDeviceNameMock,
  }
})

import { ensureMobileSyncDevice, getStableMobileSyncDeviceId, uploadMobileSyncSnapshot, writeMobileSyncDeviceName } from "@/lib/mobile-sync"
import { DEFAULT_MOBILE_SYNC_DEVICE_NAME } from "@/lib/settings"

function makeUser() {
  return {
    uid: "uid_123",
    email: "user@example.com",
    displayName: "User",
    photoURL: null,
    providerData: [{ providerId: "google.com" }],
  } as any
}

function missingDocument() {
  return {
    exists: () => false,
    data: () => undefined,
  }
}

function existingDocument(data: Record<string, unknown>) {
  return {
    exists: () => true,
    data: () => data,
  }
}

describe("mobile sync firestore helpers", () => {
  beforeEach(() => {
    firestoreState.getDocMock.mockReset()
    firestoreState.setDocMock.mockReset()
    firebaseState.getFirebaseRuntimeStateMock.mockReset()
    firebaseState.getFirebaseServicesMock.mockReset()
    settingsState.loadMobileSyncDeviceIdMock.mockReset()
    settingsState.saveMobileSyncDeviceIdMock.mockReset()
    settingsState.loadMobileSyncDeviceNameMock.mockReset()
    settingsState.saveMobileSyncDeviceNameMock.mockReset()

    firebaseState.getFirebaseRuntimeStateMock.mockReturnValue({
      enabled: true,
      missingKeys: [],
    })
    firebaseState.getFirebaseServicesMock.mockReturnValue({
      db: { id: "db" },
    })
    settingsState.loadMobileSyncDeviceIdMock.mockResolvedValue("dev_fixed")
    settingsState.saveMobileSyncDeviceIdMock.mockResolvedValue(undefined)
    settingsState.loadMobileSyncDeviceNameMock.mockResolvedValue("Home PC")
    settingsState.saveMobileSyncDeviceNameMock.mockResolvedValue(undefined)
    firestoreState.setDocMock.mockResolvedValue(undefined)
  })

  it("generates and stores a stable device id when none exists", async () => {
    const randomUuidSpy = vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "12345678-90ab-cdef-1234-567890abcdef"
    )
    settingsState.loadMobileSyncDeviceIdMock.mockResolvedValueOnce(null)

    try {
      await expect(getStableMobileSyncDeviceId()).resolves.toBe("dev_1234567890ab")
      expect(settingsState.saveMobileSyncDeviceIdMock).toHaveBeenCalledWith("dev_1234567890ab")
    } finally {
      randomUuidSpy.mockRestore()
    }
  })

  it("writes the user and device documents to the expected Firestore paths", async () => {
    firestoreState.getDocMock
      .mockResolvedValueOnce(missingDocument())
      .mockResolvedValueOnce(missingDocument())

    const result = await ensureMobileSyncDevice(makeUser(), "0.2.0")

    expect(result.deviceId).toBe("dev_fixed")
    expect(firestoreState.setDocMock).toHaveBeenNthCalledWith(
      1,
      "users/uid_123",
      expect.objectContaining({
        uid: "uid_123",
        email: "user@example.com",
        displayName: "User",
        authProviders: ["google.com"],
      }),
      { merge: true }
    )
    expect(firestoreState.setDocMock).toHaveBeenNthCalledWith(
      2,
      "users/uid_123/devices/dev_fixed",
      expect.objectContaining({
        deviceId: "dev_fixed",
        name: "Home PC",
        platform: "windows",
        appName: "AI Usage for Windows",
        appVersion: "0.2.0",
        syncEnabled: true,
        revokedAt: null,
      }),
      { merge: true }
    )
  })

  it("writes snapshots/latest for the stable device id", async () => {
    firestoreState.getDocMock
      .mockResolvedValueOnce(missingDocument())
      .mockResolvedValueOnce(missingDocument())

    const result = await uploadMobileSyncSnapshot(makeUser(), "0.2.0", {
      schemaVersion: 1,
      fetchedAt: "2026-04-30T00:00:00.000Z",
      providers: [],
    })

    expect(result.deviceId).toBe("dev_fixed")
    expect(firestoreState.setDocMock).toHaveBeenCalledWith(
      "users/uid_123/devices/dev_fixed/snapshots/latest",
      expect.objectContaining({
        schemaVersion: 1,
        fetchedAt: "2026-04-30T00:00:00.000Z",
        source: "ai-usage-windows",
        providers: [],
      }),
      { merge: false }
    )
  })

  it("removes undefined values before writing Firestore documents", async () => {
    firestoreState.getDocMock
      .mockResolvedValueOnce(missingDocument())
      .mockResolvedValueOnce(missingDocument())

    const user = {
      uid: "uid_123",
      email: undefined,
      displayName: undefined,
      photoURL: undefined,
      providerData: [{ providerId: "google.com" }],
    } as any

    await uploadMobileSyncSnapshot(user, undefined as unknown as string, {
      schemaVersion: 1,
      fetchedAt: "2026-04-30T00:00:00.000Z",
      providers: [
        {
          providerId: "claude",
          displayName: "Claude",
          status: "ok",
          plan: undefined as unknown as null,
          fetchedAt: null,
          lines: [
            {
              type: "text",
              label: "Usage",
              value: "10",
              subtitle: undefined,
            } as any,
          ],
          error: null,
        },
      ],
    })

    const writtenPayloads = firestoreState.setDocMock.mock.calls.map((call) => call[1])
    expect(JSON.stringify(writtenPayloads)).not.toContain("undefined")
    expect(writtenPayloads[0]).toMatchObject({
      uid: "uid_123",
      email: null,
      displayName: null,
    })
    const snapshotPayload = writtenPayloads.find((payload) => Array.isArray(payload.providers))
    expect(snapshotPayload.providers[0]).not.toHaveProperty("plan")
    expect(snapshotPayload.providers[0].lines[0]).not.toHaveProperty("subtitle")
  })

  it("updates the device name locally and in Firestore", async () => {
    firestoreState.getDocMock
      .mockResolvedValueOnce(missingDocument())
      .mockResolvedValueOnce(existingDocument({ linkedAt: "2026-04-30T00:00:00.000Z" }))

    const result = await writeMobileSyncDeviceName(makeUser(), "0.2.0", "  Office PC  ")

    expect(result.deviceName).toBe("Office PC")
    expect(settingsState.saveMobileSyncDeviceNameMock).toHaveBeenCalledWith("Office PC")
    expect(firestoreState.setDocMock).toHaveBeenLastCalledWith(
      "users/uid_123/devices/dev_fixed",
      { name: "Office PC", appVersion: "0.2.0" },
      { merge: true }
    )
  })

  it("falls back to the default device name when an empty name is saved", async () => {
    firestoreState.getDocMock
      .mockResolvedValueOnce(missingDocument())
      .mockResolvedValueOnce(existingDocument({ linkedAt: "2026-04-30T00:00:00.000Z" }))

    await writeMobileSyncDeviceName(makeUser(), "0.2.0", "   ")

    expect(settingsState.saveMobileSyncDeviceNameMock).toHaveBeenCalledWith(
      DEFAULT_MOBILE_SYNC_DEVICE_NAME
    )
  })
})
