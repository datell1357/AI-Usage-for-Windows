import { describe, expect, it } from "vitest"
import { buildMobileSyncSnapshot, MOBILE_SYNC_SCHEMA_VERSION } from "@/lib/mobile-sync"
import type { PluginMeta } from "@/lib/plugin-types"
import type { PluginState } from "@/hooks/app/types"

describe("mobile sync snapshot builder", () => {
  const pluginsMeta: PluginMeta[] = [
    { id: "claude", name: "Claude", iconUrl: "/claude.svg", lines: [], primaryCandidates: [] },
    { id: "codex", name: "Codex", iconUrl: "/codex.svg", lines: [], primaryCandidates: [] },
    { id: "cursor", name: "Cursor", iconUrl: "/cursor.svg", lines: [], primaryCandidates: [] },
  ]

  it("returns providers in saved plugin order", () => {
    const snapshot = buildMobileSyncSnapshot({
      pluginSettings: {
        order: ["codex", "claude", "cursor"],
        disabled: ["cursor"],
      },
      pluginsMeta,
      pluginStates: {},
    })

    expect(snapshot.schemaVersion).toBe(MOBILE_SYNC_SCHEMA_VERSION)
    expect(snapshot.providers.map((provider) => provider.providerId)).toEqual([
      "codex",
      "claude",
      "cursor",
    ])
    expect(snapshot.providers[2]?.status).toBe("disabled")
  })

  it("maps loading, error, and ok provider states", () => {
    const pluginStates: Record<string, PluginState> = {
      claude: {
        data: null,
        loading: true,
        error: null,
        lastManualRefreshAt: null,
      },
      codex: {
        data: null,
        loading: false,
        error: "Failed to start probe",
        lastManualRefreshAt: null,
      },
      cursor: {
        data: {
          providerId: "cursor",
          displayName: "Cursor",
          plan: "Pro",
          iconUrl: "/cursor.svg",
          lines: [{ type: "badge", label: "Plan", text: "Pro" }],
        },
        loading: false,
        error: null,
        lastManualRefreshAt: 1_746_000_000_000,
      },
    }

    const snapshot = buildMobileSyncSnapshot({
      pluginSettings: {
        order: ["claude", "codex", "cursor"],
        disabled: [],
      },
      pluginsMeta,
      pluginStates,
    })

    expect(snapshot.providers[0]).toMatchObject({ providerId: "claude", status: "loading" })
    expect(snapshot.providers[1]).toMatchObject({
      providerId: "codex",
      status: "error",
      error: "Failed to start probe",
    })
    expect(snapshot.providers[2]).toMatchObject({
      providerId: "cursor",
      status: "ok",
      plan: "Pro",
    })
    expect(snapshot.providers[2]?.refreshedAt).toBe(
      new Date(1_746_000_000_000).toISOString()
    )
  })

  it("returns an empty payload before plugin settings bootstrap completes", () => {
    const snapshot = buildMobileSyncSnapshot({
      pluginSettings: null,
      pluginsMeta,
      pluginStates: {},
    })

    expect(snapshot.providers).toEqual([])
  })
})
