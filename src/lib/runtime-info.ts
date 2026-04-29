import { invoke, isTauri } from "@tauri-apps/api/core"

export type RuntimeInfo = {
  isPackagedWindowsApp: boolean
  supportsUpdater: boolean
  supportsAutostart: boolean
}

const DEFAULT_RUNTIME_INFO: RuntimeInfo = {
  isPackagedWindowsApp: false,
  supportsUpdater: true,
  supportsAutostart: true,
}

let runtimeInfoPromise: Promise<RuntimeInfo> | null = null

export function loadRuntimeInfo(): Promise<RuntimeInfo> {
  if (!isTauri()) {
    return Promise.resolve(DEFAULT_RUNTIME_INFO)
  }

  if (!runtimeInfoPromise) {
    runtimeInfoPromise = invoke<RuntimeInfo>("get_runtime_info").catch((error) => {
      console.error("Failed to load runtime info:", error)
      return DEFAULT_RUNTIME_INFO
    })
  }

  return runtimeInfoPromise
}
