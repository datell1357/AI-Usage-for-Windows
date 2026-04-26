# OpenUsage Windows First Design

## Summary

Build a Windows version of OpenUsage that initially supports Claude and Codex only. The first version should preserve the existing Tauri, React, Rust, and plugin architecture, while replacing macOS-only integration points with Windows implementations. Existing provider/plugin files should not be deleted. Unsupported providers can remain in the repository and be disabled or excluded from the first Windows bundle.

## Goals

- Run OpenUsage as a Windows desktop tray app.
- Show Claude and Codex usage in the existing panel UI.
- Keep the current plugin runtime and provider output schema.
- Preserve the local HTTP API at `127.0.0.1:6736`.
- Support auto-refresh, manual refresh, global shortcut, settings persistence, and start-on-login where Tauri supports them on Windows.
- Avoid deleting existing files or provider implementations.

## Non-Goals

- Do not make every existing provider work on Windows in the first version.
- Do not redesign the UI.
- Do not replace Tauri or the plugin engine.
- Do not require users to manually copy credentials into OpenUsage.
- Do not implement a new plugin marketplace or external plugin loading system.

## Current Architecture

OpenUsage is a Tauri 2 desktop app. The frontend is React with Zustand stores and Tauri IPC calls. The backend is Rust and owns plugin discovery, plugin execution, tray integration, local HTTP API, logging, global shortcuts, autostart, and updater setup.

At startup, Rust loads bundled plugins from `src-tauri/resources/bundled_plugins`, starts the local HTTP API, creates the tray icon, and exposes Tauri commands. The React app calls `list_plugins` to discover providers, then calls `start_probe_batch` to run provider probes. Each plugin is a JavaScript file executed by QuickJS through `rquickjs`. The host injects APIs for filesystem, environment variables, HTTP, credential access, SQLite, crypto, and ccusage. Probe results are emitted back to the frontend through `probe:result`.

The major macOS-specific pieces are the `tauri-nspanel` panel implementation, macOS Keychain access through the `security` command, macOS shell environment probing, macOS file paths inside some providers, and the macOS-only release workflow.

## Recommended Approach

Use the existing repository as a Windows-first fork and keep the current architecture intact. Add Windows-specific modules behind `cfg(target_os = "windows")`, keep macOS modules behind `cfg(target_os = "macos")`, and adjust shared code only where the current macOS assumption leaks into cross-platform behavior.

This is lower risk than rewriting because the plugin schema, UI state flow, provider parsing, local HTTP API, settings storage, and large parts of the host API are already implemented and tested.

## Components

### Panel and Tray

Keep the existing macOS `panel.rs` behavior for macOS, but add a Windows implementation that uses the normal Tauri `WebviewWindow` API. On Windows, tray click should toggle the hidden `main` window, position it near the tray icon when Tauri provides a tray rect, and fall back to the primary monitor bottom-right area when a tray rect is unavailable.

The Windows panel should remain undecorated, fixed size, hidden at launch, and close-on-blur if practical. If native focus-loss behavior is unreliable, the first version can keep explicit hide behavior through tray click and existing UI actions.

### Credential Host API

Keep the JavaScript-facing API name as `ctx.host.keychain` so Claude and Codex plugins do not need broad rewrites. On Windows, implement the same methods with Windows Credential Manager rather than macOS Keychain:

- `readGenericPassword(service)`
- `writeGenericPassword(service, value)`
- `readGenericPasswordForCurrentUser(service)`
- `writeGenericPasswordForCurrentUser(service, value)`

The current-user variants can map to the same Windows target naming scheme with a user-qualified target name. Errors should be explicit and should not silently fall back to empty credentials.

### Environment and Path Resolution

Keep process environment lookup as the first source. On Windows, add conservative lookup for `CODEX_HOME` and `CLAUDE_CONFIG_DIR` from the process environment. Avoid complex PowerShell profile parsing in the first version unless evidence shows the app cannot see common user environment variables.

Path expansion should continue to support `~`, but on Windows it should resolve to `%USERPROFILE%`. Plugin logic should rely on `ctx.app.platform === "windows"` when provider-specific paths differ.

Claude should look for:

- `CLAUDE_CONFIG_DIR/.credentials.json` when `CLAUDE_CONFIG_DIR` is set
- `~/.claude/.credentials.json` otherwise
- Windows Credential Manager fallback using the Claude service names

Codex should look for:

- `CODEX_HOME/auth.json` when `CODEX_HOME` is set
- `~/.config/codex/auth.json`
- `~/.codex/auth.json`
- Windows Credential Manager fallback using `Codex Auth`

### ccusage

Keep `ctx.host.ccusage.query` and the existing Claude/Codex plugin calls. The Windows implementation should search common package runners in this order:

1. `bunx`
2. `pnpm`
3. `yarn`
4. `npm`
5. `npx`

The existing package versions should remain pinned. The Windows path enrichment should include `%USERPROFILE%\\.bun\\bin`, `%APPDATA%\\npm`, and the current `PATH`, while preserving de-duplication. Commands should be spawned without shell interpolation.

### Provider Scope

Do not delete existing provider directories. For the first Windows version, bundle only `claude` and `codex` for Windows builds while keeping every provider source file in `plugins`. This prevents unsupported providers from creating noisy errors while still preserving source files.

### Frontend

Reuse the existing UI. Rename user-facing "menu bar" wording where it appears in settings to a neutral "tray" label for Windows. The first version should keep layout and provider cards unchanged.

The global shortcut recorder currently displays `CommandOrControl` as `Cmd`. On Windows, display should map `CommandOrControl` to `Ctrl`. The stored shortcut string can remain Tauri-compatible.

### Local HTTP API

Keep the existing local API unchanged:

- `GET /v1/usage`
- `GET /v1/usage/{providerId}`

The cache should only expose enabled providers. Default enabled provider constants should be updated for the Windows-first scope to `claude` and `codex`.

### Logging

Replace the macOS-only `get_log_path` construction with a cross-platform path. On Windows, return Tauri's log directory or a path under the app data/log directory if the plugin API does not expose the final path directly.

### Packaging

Add a Windows release path without removing the macOS workflow. The Windows release should use GitHub Actions `windows-latest`, install Rust and Bun, bundle plugins, run tests where feasible, and build a Tauri Windows artifact such as NSIS or MSI. Updater metadata should include Windows artifacts only after signing/update behavior is confirmed.

## Data Flow

1. User starts OpenUsage.
2. Tauri initializes logging, settings, plugins, local HTTP API, and tray.
3. React loads plugin metadata and settings.
4. Enabled plugin IDs are `claude` and `codex`.
5. React invokes `start_probe_batch`.
6. Rust runs each plugin in QuickJS with the host API.
7. Claude/Codex plugins read credentials from local files or Windows Credential Manager.
8. Plugins refresh tokens when needed and fetch live usage.
9. Plugins query ccusage for local token usage when a runner is available.
10. Rust emits probe results to React and caches successful results for the local HTTP API.

## Error Handling

Expected user-facing failures should be explicit:

- Missing Claude credentials: tell the user to run `claude` login/authentication.
- Missing Codex credentials: tell the user to run `codex` login/authentication.
- Missing ccusage runner: show live usage when available and omit local token usage, or show a non-fatal note.
- Credential Manager read/write failure: surface a provider error rather than pretending the user is logged out.
- Network failure: reuse existing provider messages such as "check your connection."

Unexpected host failures should log loudly and emit an error badge line.

## Testing

Add or update Rust tests for:

- Windows path expansion behavior.
- Windows ccusage PATH enrichment.
- Credential target naming and error mapping, with the OS calls isolated behind a testable wrapper.
- Default enabled providers in the local HTTP cache.

Add or update frontend tests for:

- Windows shortcut display using `Ctrl` instead of `Cmd`.
- Settings labels that should say tray rather than menu bar on Windows.

Add plugin tests for:

- Claude and Codex path resolution when `ctx.app.platform` is `windows`.
- Credential fallback behavior through the existing `ctx.host.keychain` mock.
- `CODEX_HOME` and `CLAUDE_CONFIG_DIR` overrides.

Manual verification should include:

- Launch app on Windows.
- Confirm tray icon appears.
- Open and hide panel from tray.
- Confirm Claude provider works after Claude login.
- Confirm Codex provider works after Codex login.
- Confirm `GET http://127.0.0.1:6736/v1/usage` returns cached Claude/Codex data after a successful probe.

## Decisions

- Windows builds bundle only Claude/Codex for the first release, without deleting other provider files.
- Windows Credential Manager reads upstream-compatible service names first and writes back to the same source that was read.
- Windows updater support is not part of the first milestone. Build installable artifacts first, then enable updater after signing and artifact naming are verified.

## Implementation Order

1. Make the backend compile on Windows by gating or replacing `tauri-nspanel`.
2. Add Windows panel/tray behavior.
3. Add Windows credential host implementation behind the existing `host.keychain` API.
4. Adjust environment, path, and ccusage behavior for Windows.
5. Limit first Windows bundle/default enabled providers to Claude and Codex without deleting provider files.
6. Adjust small Windows-facing frontend labels and shortcut display.
7. Add focused tests.
8. Build and smoke test on Windows.
