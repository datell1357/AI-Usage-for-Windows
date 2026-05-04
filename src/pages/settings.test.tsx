import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

let latestOnDragEnd: ((event: any) => void) | undefined

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd }: { children: ReactNode; onDragEnd?: (event: any) => void }) => {
    latestOnDragEnd = onDragEnd
    return <div data-testid="dnd-context">{children}</div>
  },
  closestCenter: vi.fn(),
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: vi.fn((_sensor: any, options?: any) => ({ sensor: _sensor, options })),
  useSensors: vi.fn((...sensors: any[]) => sensors),
}))

vi.mock("@dnd-kit/sortable", () => ({
  arrayMove: (items: any[], from: number, to: number) => {
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
  },
  SortableContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
}))

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}))

import { SettingsPage } from "@/pages/settings"

const defaultProps = {
  plugins: [{ id: "a", name: "Alpha", enabled: true }],
  onReorder: vi.fn(),
  onToggle: vi.fn(),
  autoUpdateInterval: 5 as const,
  onAutoUpdateIntervalChange: vi.fn(),
  themeMode: "system" as const,
  onThemeModeChange: vi.fn(),
  displayMode: "used" as const,
  onDisplayModeChange: vi.fn(),
  resetTimerDisplayMode: "relative" as const,
  onResetTimerDisplayModeChange: vi.fn(),

  globalShortcut: null,
  onGlobalShortcutChange: vi.fn(),
  startOnLogin: false,
  onStartOnLoginChange: vi.fn(),
  mobileSyncStatus: {
    isConfigured: true,
    missingConfigKeys: [],
    googleSignInAvailable: true,
    githubSignInAvailable: true,
    googleDesktopClientId: "",
    githubClientId: "",
    isAuthenticated: false,
    account: null,
    deviceId: "dev_test",
    deviceName: "Windows PC",
    syncEnabled: true,
    linkedAt: null,
    lastSeenAt: null,
    lastUploadedAt: null,
    lastUploadStatus: "idle" as const,
    lastError: null,
  },
  mobileSyncBusy: false,
  mobileSyncError: null,
  mobileSyncPendingDeviceCodeAuth: null,
  onMobileSyncGoogleSignIn: vi.fn(),
  onMobileSyncGithubSignIn: vi.fn(),
  onMobileSyncSyncNow: vi.fn(),
  onMobileSyncSignOut: vi.fn(),
  onMobileSyncSaveDeviceName: vi.fn(),
  onMobileSyncSaveOAuthSettings: vi.fn(),
}

afterEach(() => {
  cleanup()
})

describe("SettingsPage", () => {
  it("toggles plugins", async () => {
    const onToggle = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        plugins={[
          { id: "b", name: "Beta", enabled: false },
        ]}
        onToggle={onToggle}
      />
    )
    const checkboxes = screen.getAllByRole("checkbox")
    await userEvent.click(checkboxes[checkboxes.length - 1])
    expect(onToggle).toHaveBeenCalledWith("b")
  })

  it("reorders plugins on drag end", () => {
    const onReorder = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        plugins={[
          { id: "a", name: "Alpha", enabled: true },
          { id: "b", name: "Beta", enabled: true },
        ]}
        onReorder={onReorder}
      />
    )
    latestOnDragEnd?.({ active: { id: "a" }, over: { id: "b" } })
    expect(onReorder).toHaveBeenCalledWith(["b", "a"])
  })

  it("ignores invalid drag end", () => {
    const onReorder = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onReorder={onReorder}
      />
    )
    latestOnDragEnd?.({ active: { id: "a" }, over: null })
    latestOnDragEnd?.({ active: { id: "a" }, over: { id: "a" } })
    expect(onReorder).not.toHaveBeenCalled()
  })

  it("updates auto-update interval", async () => {
    const onAutoUpdateIntervalChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onAutoUpdateIntervalChange={onAutoUpdateIntervalChange}
      />
    )
    await userEvent.click(screen.getByText("30 min"))
    expect(onAutoUpdateIntervalChange).toHaveBeenCalledWith(30)
  })

  it("shows auto-update helper text", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByText("How obsessive are you")).toBeInTheDocument()
  })

  it("renders app theme section with theme options", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByText("App Theme")).toBeInTheDocument()
    expect(screen.getByText("How it looks around here")).toBeInTheDocument()
    expect(screen.getByText("System")).toBeInTheDocument()
    expect(screen.getByText("Light")).toBeInTheDocument()
    expect(screen.getByText("Dark")).toBeInTheDocument()
  })

  it("updates theme mode", async () => {
    const onThemeModeChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onThemeModeChange={onThemeModeChange}
      />
    )
    await userEvent.click(screen.getByText("Dark"))
    expect(onThemeModeChange).toHaveBeenCalledWith("dark")
  })

  it("updates display mode", async () => {
    const onDisplayModeChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onDisplayModeChange={onDisplayModeChange}
      />
    )
    await userEvent.click(screen.getByRole("radio", { name: "Left" }))
    expect(onDisplayModeChange).toHaveBeenCalledWith("left")
  })

  it("updates reset timer display mode", async () => {
    const onResetTimerDisplayModeChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onResetTimerDisplayModeChange={onResetTimerDisplayModeChange}
      />
    )
    await userEvent.click(screen.getByRole("radio", { name: /Absolute/ }))
    expect(onResetTimerDisplayModeChange).toHaveBeenCalledWith("absolute")
  })

  it("renders renamed usage section heading", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByText("Usage Mode")).toBeInTheDocument()
  })

  it("renders reset timers section heading", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByText("Reset Timers")).toBeInTheDocument()
  })

  it("does not render tray icon section", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.queryByText("Tray Icon")).not.toBeInTheDocument()
    expect(screen.queryByText("What shows in the tray")).not.toBeInTheDocument()
    expect(screen.queryByRole("radio", { name: "Bars" })).not.toBeInTheDocument()
  })

  it("does not render removed bar icon controls", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.queryByText("Bar Icon")).not.toBeInTheDocument()
    expect(screen.queryByText("Show percentage")).not.toBeInTheDocument()
  })

  it("toggles start on login checkbox", async () => {
    const onStartOnLoginChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onStartOnLoginChange={onStartOnLoginChange}
      />
    )
    await userEvent.click(screen.getByText("Start on login"))
    expect(onStartOnLoginChange).toHaveBeenCalledWith(true)
  })

  it("renders mobile sync sign-in controls when no account is linked", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByText("Mobile Sync")).toBeInTheDocument()
    expect(screen.getByLabelText("Google Desktop Client ID")).toBeInTheDocument()
    expect(screen.getByLabelText("GitHub OAuth Client ID")).toBeInTheDocument()
    expect(screen.getByText(/Sign in with the same Firebase account used on Android/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sign In with Google" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sign In with GitHub" })).toBeInTheDocument()
  })

  it("shows the pending browser sign-in state during native provider sign-in", () => {
    render(
      <SettingsPage
        {...defaultProps}
        mobileSyncPendingDeviceCodeAuth={{
          kind: "loopback",
          providerId: "google.com",
          providerLabel: "Google",
          clientId: "google-client-id",
          sessionId: "google-session",
          authorizationUrl: "https://example.com/sign-in",
          callbackUrl: "http://127.0.0.1:43123/oauth/callback",
          expiresInSecs: 900,
          startedAt: Date.now(),
        }}
      />
    )

    expect(screen.getByText(/Finish Google sign-in in your browser/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Complete the sign-in page in your browser/i)
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Reopen sign-in page" })).toHaveAttribute(
      "href",
      "https://example.com/sign-in"
    )
  })

  it("shows the pending GitHub device code when native OAuth needs browser verification", () => {
    render(
      <SettingsPage
        {...defaultProps}
        mobileSyncPendingDeviceCodeAuth={{
          kind: "device_code",
          providerId: "github.com",
          providerLabel: "GitHub",
          clientId: "github-client-id",
          sessionId: "github-session",
          verificationUri: "https://github.com/login/device",
          userCode: "WDJB-MJHT",
          pollIntervalSecs: 5,
          expiresInSecs: 900,
          startedAt: Date.now(),
        }}
      />
    )

    expect(screen.getByText(/Finish GitHub sign-in in your browser/i)).toBeInTheDocument()
    expect(screen.getByText("WDJB-MJHT")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open verification page" })).toHaveAttribute(
      "href",
      "https://github.com/login/device"
    )
  })

  it("disables provider sign-in buttons when native OAuth provider settings are missing", () => {
    render(
      <SettingsPage
        {...defaultProps}
        mobileSyncStatus={{
          ...defaultProps.mobileSyncStatus,
          googleSignInAvailable: false,
          githubSignInAvailable: true,
        }}
      />
    )

    expect(screen.getByRole("button", { name: "Sign In with Google" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Sign In with GitHub" })).toBeEnabled()
    expect(screen.getByText(/Native OAuth provider settings are missing/i)).toBeInTheDocument()
    expect(screen.getByText(/Google requires VITE_GOOGLE_DESKTOP_CLIENT_ID or VITE_GOOGLE_OAUTH_CLIENT_ID/i)).toBeInTheDocument()
    expect(screen.queryByText(/GitHub requires VITE_GITHUB_OAUTH_CLIENT_ID/i)).not.toBeInTheDocument()
  })

  it("renders device sync controls when signed in", () => {
    render(
      <SettingsPage
        {...defaultProps}
        mobileSyncStatus={{
          ...defaultProps.mobileSyncStatus,
          isAuthenticated: true,
          account: {
            uid: "uid_123",
            email: "user@example.com",
            displayName: "User",
            photoURL: null,
            providerIds: ["google.com"],
          },
          linkedAt: "2026-04-30T00:00:00.000Z",
          lastUploadedAt: "2026-04-30T00:05:00.000Z",
        }}
      />
    )

    expect(screen.getByDisplayValue("Windows PC")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save Device Name" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sync Now" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeInTheDocument()
  })
})
