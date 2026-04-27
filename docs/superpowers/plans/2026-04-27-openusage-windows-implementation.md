# AI Usage Windows 우선 지원 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI Usage를 Windows tray 앱으로 빌드하고, 1차 범위에서 Claude와 Codex 사용량만 안정적으로 표시한다.

**Architecture:** 기존 Tauri 2 + React + Rust + QuickJS plugin 구조를 유지한다. macOS 전용 패널, credential, env/path, ccusage 경계를 OS별 모듈로 나누고, Windows 구현을 추가한다. 기존 provider 파일은 삭제하지 않고 Windows 빌드/기본 활성화 범위만 Claude와 Codex로 제한한다.

**Tech Stack:** Tauri 2, Rust 2024, React 19, TypeScript, Zustand, Vitest, rquickjs, Windows Credential Manager API, GitHub Actions.

---

## 파일 구조

- Modify: `src-tauri/Cargo.toml`
  - Windows Credential Manager 호출을 위한 `windows` crate target dependency를 추가한다.
- Modify: `src-tauri/src/lib.rs`
  - `tauri_nspanel` plugin 등록과 `hide_panel` 구현을 OS별로 분기한다.
  - `get_log_path`를 cross-platform 함수로 바꾼다.
- Modify: `src-tauri/src/panel.rs`
  - macOS 구현으로 유지하고 `cfg(target_os = "macos")`에서만 컴파일되게 한다.
- Create: `src-tauri/src/panel_windows.rs`
  - Windows용 tray popup window show/hide/positioning 구현을 담당한다.
- Modify: `src-tauri/src/tray.rs`
  - `panel` import를 OS별 alias로 바꾼다.
  - tray click 흐름을 Windows panel 구현과 호환되게 한다.
- Create: `src-tauri/src/plugin_engine/credential_store.rs`
  - macOS Keychain과 Windows Credential Manager를 같은 Rust API로 감싼다.
- Modify: `src-tauri/src/plugin_engine/host_api.rs`
  - keychain 함수들이 `credential_store`를 호출하도록 변경한다.
  - Windows `~`, env, ccusage runner PATH 처리를 보강한다.
- Modify: `copy-bundled.cjs`
  - Windows 빌드에서는 `claude`, `codex`만 번들한다. 기존 provider 파일은 건드리지 않는다.
- Modify: `src/lib/settings.ts`
  - 기본 활성 provider를 `claude`, `codex`로 제한한다.
- Modify: `src-tauri/src/local_http_api/cache.rs`
  - 로컬 HTTP API의 기본 활성 provider를 `claude`, `codex`로 제한한다.
- Modify: `src/components/global-shortcut-section.tsx`
  - Windows에서 `CommandOrControl` 표시를 `Ctrl`로 바꾼다.
- Modify: `plugins/claude/plugin.js`, `plugins/claude/plugin.test.js`
  - Windows auth path 케이스를 명시적으로 테스트한다.
- Modify: `plugins/codex/plugin.js`, `plugins/codex/plugin.test.js`
  - Windows auth path 케이스를 명시적으로 테스트한다.
- Create or Modify: `.github/workflows/publish.yml`
  - 기존 macOS release matrix를 보존하고 Windows artifact 빌드 job을 추가한다.
- Modify: `README.md`, `docs/capture-logs.md`
  - Windows 1차 지원 범위와 로그 위치 안내를 문서화한다.

---

### Task 1: Windows 컴파일 경계 만들기

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/panel.rs`
- Create: `src-tauri/src/panel_windows.rs`
- Modify: `src-tauri/src/tray.rs`

- [ ] **Step 1: Rust 테스트 명령으로 현재 실패를 확인한다**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: 현재 Windows 환경에서는 `tauri_nspanel`, `objc2`, 또는 macOS panel API 관련 컴파일 실패가 발생한다.

- [ ] **Step 2: `Cargo.toml`에서 `tauri-nspanel`을 macOS target dependency로 이동한다**

Edit `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-png"] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
time = { version = "0.3.47", features = ["formatting"] }
dirs = "6"
log = "0.4"
reqwest = { version = "0.13", features = ["blocking", "socks"] }
rquickjs = { version = "0.11", features = ["bindgen"] }
tauri-plugin-store = "2.4.2"
base64 = "0.22"
uuid = { version = "1", features = ["v4"] }
tauri-plugin-log = "2"
tauri-plugin-aptabase = { git = "https://github.com/aptabase/tauri-plugin-aptabase", rev = "e896cceb" }
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
tauri-plugin-global-shortcut = "2"
tauri-plugin-autostart = "2.5.1"
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
regex-lite = "0.1.9"
aes-gcm = "0.10.3"

[target.'cfg(target_os = "macos")'.dependencies]
tauri-nspanel = { git = "https://github.com/ahkohd/tauri-nspanel", branch = "v2.1" }
objc2 = "0.6"
objc2-foundation = { version = "0.3", features = ["NSProcessInfo", "NSString"] }
objc2-app-kit = { version = "0.3", features = ["NSEvent", "NSScreen", "NSGraphics"] }
objc2-web-kit = { version = "0.3", features = ["WKPreferences", "WKWebView", "WKWebViewConfiguration"] }
```

- [ ] **Step 3: `lib.rs`에서 panel module을 OS별로 선언한다**

Change the module declarations near the top:

```rust
#[cfg(target_os = "macos")]
mod app_nap;
mod config;
mod local_http_api;
#[cfg(target_os = "macos")]
mod panel;
#[cfg(target_os = "windows")]
mod panel_windows;
mod plugin_engine;
mod tray;
#[cfg(target_os = "macos")]
mod webkit_config;
```

- [ ] **Step 4: `hide_panel`을 OS별로 분리한다**

Replace the current `hide_panel` command with:

```rust
#[tauri::command]
fn hide_panel(app_handle: tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::ManagerExt;
        if let Ok(panel) = app_handle.get_webview_panel("main") {
            panel.hide();
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(window) = app_handle.get_webview_window("main") {
            let _ = window.hide();
        }
    }
}
```

- [ ] **Step 5: `init_panel`을 Windows 구현으로 연결한다**

Replace `init_panel` with:

```rust
#[tauri::command]
fn init_panel(app_handle: tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    panel::init(&app_handle).expect("Failed to initialize panel");

    #[cfg(target_os = "windows")]
    panel_windows::init(&app_handle).expect("Failed to initialize panel");
}
```

- [ ] **Step 6: `tauri_nspanel` plugin 등록을 macOS로 제한한다**

In the Tauri builder chain, replace:

```rust
.plugin(tauri_nspanel::init())
```

with a setup-time plugin registration block:

```rust
let mut builder = tauri::Builder::default()
    .plugin(tauri_plugin_aptabase::Builder::new("A-US-6435241436").build())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_store::Builder::default().build());

#[cfg(target_os = "macos")]
{
    builder = builder.plugin(tauri_nspanel::init());
}

builder
    .plugin(
        tauri_plugin_log::Builder::new()
            .targets([
                Target::new(TargetKind::Stdout),
                Target::new(TargetKind::LogDir { file_name: None }),
            ])
            .max_file_size(10_000_000)
            .level(log::LevelFilter::Trace)
            .level_for("hyper", log::LevelFilter::Warn)
            .level_for("reqwest", log::LevelFilter::Warn)
            .level_for("tao", log::LevelFilter::Info)
            .level_for("tauri_plugin_updater", log::LevelFilter::Info)
            .build(),
    )
```

Keep the rest of the existing builder chain after this block.

- [ ] **Step 7: `panel_windows.rs`를 만든다**

Create `src-tauri/src/panel_windows.rs`:

```rust
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size};

const WINDOW_LABEL: &str = "main";
const PANEL_MARGIN: i32 = 12;

pub fn init(app_handle: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app_handle.get_webview_window(WINDOW_LABEL) {
        window.set_decorations(false)?;
        window.set_resizable(false)?;
    }
    Ok(())
}

pub fn show_panel(app_handle: &AppHandle) {
    let Some(window) = app_handle.get_webview_window(WINDOW_LABEL) else {
        log::warn!("show_panel: main window not found");
        return;
    };
    position_window_near_tray(app_handle, None, None);
    let _ = window.show();
    let _ = window.set_focus();
}

pub fn toggle_panel(app_handle: &AppHandle) {
    let Some(window) = app_handle.get_webview_window(WINDOW_LABEL) else {
        log::warn!("toggle_panel: main window not found");
        return;
    };
    match window.is_visible() {
        Ok(true) => {
            let _ = window.hide();
        }
        _ => show_panel(app_handle),
    }
}

pub fn position_panel_at_tray_icon(
    app_handle: &AppHandle,
    icon_position: Position,
    icon_size: Size,
) {
    position_window_near_tray(app_handle, Some(icon_position), Some(icon_size));
}

fn position_window_near_tray(
    app_handle: &AppHandle,
    icon_position: Option<Position>,
    icon_size: Option<Size>,
) {
    let Some(window) = app_handle.get_webview_window(WINDOW_LABEL) else {
        return;
    };

    let panel_size = window.outer_size().unwrap_or(PhysicalSize {
        width: 400,
        height: 500,
    });

    if let (Some(position), Some(size)) = (icon_position, icon_size) {
        let (icon_x, icon_y) = physical_position(position);
        let (icon_w, icon_h) = physical_size(size);
        let x = icon_x + (icon_w as i32 / 2) - (panel_size.width as i32 / 2);
        let y = icon_y - panel_size.height as i32 - PANEL_MARGIN;
        let _ = window.set_position(PhysicalPosition::new(x.max(0), y.max(0)));
        return;
    }

    if let Ok(Some(monitor)) = window.current_monitor().or_else(|_| window.primary_monitor()) {
        let origin = monitor.position();
        let size = monitor.size();
        let x = origin.x + size.width as i32 - panel_size.width as i32 - PANEL_MARGIN;
        let y = origin.y + size.height as i32 - panel_size.height as i32 - 48;
        let _ = window.set_position(PhysicalPosition::new(x.max(origin.x), y.max(origin.y)));
    }
}

fn physical_position(position: Position) -> (i32, i32) {
    match position {
        Position::Physical(pos) => (pos.x, pos.y),
        Position::Logical(pos) => (pos.x.round() as i32, pos.y.round() as i32),
    }
}

fn physical_size(size: Size) -> (u32, u32) {
    match size {
        Size::Physical(size) => (size.width, size.height),
        Size::Logical(size) => (size.width.round() as u32, size.height.round() as u32),
    }
}
```

- [ ] **Step 8: `tray.rs` import를 OS별 alias로 바꾼다**

Replace:

```rust
use tauri_nspanel::ManagerExt;

use crate::panel::{get_or_init_panel, position_panel_at_tray_icon, show_panel};
```

with:

```rust
#[cfg(target_os = "macos")]
use tauri_nspanel::ManagerExt;

#[cfg(target_os = "macos")]
use crate::panel::{get_or_init_panel, position_panel_at_tray_icon, show_panel};
#[cfg(target_os = "windows")]
use crate::panel_windows::{position_panel_at_tray_icon, show_panel, toggle_panel};
```

Then wrap the tray click body:

```rust
#[cfg(target_os = "macos")]
{
    let Some(panel) = get_or_init_panel!(app_handle) else {
        return;
    };

    if panel.is_visible() {
        log::debug!("tray click: hiding panel");
        panel.hide();
        return;
    }
    log::debug!("tray click: showing panel");
    panel.show_and_make_key();
    position_panel_at_tray_icon(app_handle, rect.position, rect.size);
}

#[cfg(target_os = "windows")]
{
    log::debug!("tray click: toggling window panel");
    toggle_panel(app_handle);
    position_panel_at_tray_icon(app_handle, rect.position, rect.size);
}
```

- [ ] **Step 9: Rust tests를 실행한다**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: macOS-only panel 관련 컴파일 오류가 사라진다. 남는 실패가 있으면 다음 task로 넘기지 말고 이 task에서 해결한다.

- [ ] **Step 10: 커밋한다**

Run:

```powershell
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/src/panel.rs src-tauri/src/panel_windows.rs src-tauri/src/tray.rs
git commit -m "feat: add windows panel compile boundary"
```

---

### Task 2: 로그 경로와 기본 provider 범위 정리

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/settings.ts`
- Modify: `src/lib/settings.test.ts`
- Modify: `src-tauri/src/local_http_api/cache.rs`

- [ ] **Step 1: frontend 기본 provider 테스트를 먼저 수정한다**

In `src/lib/settings.test.ts`, update expectations that mention default enabled plugins so `cursor` is disabled when newly discovered.

Use this expected value in the relevant normalize test:

```ts
expect(normalizePluginSettings(
  { order: [], disabled: [] },
  [
    plugin("claude"),
    plugin("codex"),
    plugin("cursor"),
  ]
)).toEqual({
  order: ["claude", "codex", "cursor"],
  disabled: ["cursor"],
})
```

- [ ] **Step 2: Rust cache 기본 provider 테스트를 추가한다**

Add to `src-tauri/src/local_http_api/cache.rs` tests:

```rust
#[test]
fn default_enabled_plugins_are_claude_and_codex_only() {
    let default_enabled: HashSet<&str> = DEFAULT_ENABLED_PLUGINS.iter().copied().collect();
    assert!(default_enabled.contains("claude"));
    assert!(default_enabled.contains("codex"));
    assert!(!default_enabled.contains("cursor"));
}
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run:

```powershell
bun test src/lib/settings.test.ts
cargo test --manifest-path src-tauri/Cargo.toml default_enabled_plugins_are_claude_and_codex_only
```

Expected: 현재 `cursor`가 기본 enabled라 두 테스트 중 하나 이상이 실패한다.

- [ ] **Step 4: frontend 기본 enabled provider를 수정한다**

In `src/lib/settings.ts`, replace:

```ts
const DEFAULT_ENABLED_PLUGINS = new Set(["claude", "codex", "cursor"]);
```

with:

```ts
const DEFAULT_ENABLED_PLUGINS = new Set(["claude", "codex"]);
```

- [ ] **Step 5: Rust local HTTP API 기본 enabled provider를 수정한다**

In `src-tauri/src/local_http_api/cache.rs`, replace:

```rust
const DEFAULT_ENABLED_PLUGINS: &[&str] = &["claude", "codex", "cursor"];
```

with:

```rust
const DEFAULT_ENABLED_PLUGINS: &[&str] = &["claude", "codex"];
```

- [ ] **Step 6: `get_log_path`를 cross-platform으로 바꾼다**

In `src-tauri/src/lib.rs`, replace `get_log_path` with:

```rust
#[tauri::command]
fn get_log_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let home = dirs::home_dir().ok_or("no home dir")?;
        let bundle_id = app_handle.config().identifier.clone();
        let log_dir = home.join("Library").join("Logs").join(&bundle_id);
        let log_file = log_dir.join(format!("{}.log", app_handle.package_info().name));
        return Ok(log_file.to_string_lossy().to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let log_dir = app_handle
            .path()
            .app_log_dir()
            .map_err(|error| error.to_string())?;
        let log_file = log_dir.join(format!("{}.log", app_handle.package_info().name));
        return Ok(log_file.to_string_lossy().to_string());
    }

    #[allow(unreachable_code)]
    Err("unsupported platform".to_string())
}
```

- [ ] **Step 7: 테스트를 실행한다**

Run:

```powershell
bun test src/lib/settings.test.ts
cargo test --manifest-path src-tauri/Cargo.toml default_enabled_plugins_are_claude_and_codex_only
```

Expected: both PASS.

- [ ] **Step 8: 커밋한다**

Run:

```powershell
git add src-tauri/src/lib.rs src/lib/settings.ts src/lib/settings.test.ts src-tauri/src/local_http_api/cache.rs
git commit -m "feat: limit default providers to claude and codex"
```

---

### Task 3: Windows Credential Manager host API 추가

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/plugin_engine/credential_store.rs`
- Modify: `src-tauri/src/plugin_engine/mod.rs`
- Modify: `src-tauri/src/plugin_engine/host_api.rs`

- [ ] **Step 1: credential target naming 테스트를 작성한다**

Create `src-tauri/src/plugin_engine/credential_store.rs` with tests first:

```rust
pub fn current_user_target(service: &str, user: &str) -> String {
    format!("{}:{}", service.trim(), user.trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_user_target_joins_service_and_user() {
        assert_eq!(
            current_user_target("Claude Code-credentials", "alice"),
            "Claude Code-credentials:alice"
        );
    }

    #[test]
    fn current_user_target_trims_inputs() {
        assert_eq!(current_user_target(" Codex Auth ", " alice "), "Codex Auth:alice");
    }
}
```

- [ ] **Step 2: 테스트가 통과하는 최소 상태를 확인한다**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml credential_store
```

Expected: PASS. 이 단계는 OS API 추가 전 순수 함수부터 잠근다.

- [ ] **Step 3: module export를 추가한다**

In `src-tauri/src/plugin_engine/mod.rs`, add:

```rust
pub mod credential_store;
```

- [ ] **Step 4: Windows dependency를 추가한다**

In `src-tauri/Cargo.toml`:

```toml
[target.'cfg(target_os = "windows")'.dependencies]
windows = { version = "0.61", features = [
  "Win32_Foundation",
  "Win32_Security_Credentials",
] }
```

- [ ] **Step 5: credential store 구현을 완성한다**

Replace `credential_store.rs` with:

```rust
pub fn current_user_target(service: &str, user: &str) -> String {
    format!("{}:{}", service.trim(), user.trim())
}

pub fn current_user_name() -> String {
    std::env::var("USERNAME")
        .ok()
        .and_then(|value| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .unwrap_or_else(|| "ai-usage-user".to_string())
}

#[cfg(target_os = "macos")]
pub fn read_generic_password(service: &str) -> Result<String, String> {
    let output = std::process::Command::new("security")
        .args(["find-generic-password", "-s", service, "-w"])
        .output()
        .map_err(|error| format!("keychain read failed: {}", error))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("keychain item not found: {}", stderr.lines().next().unwrap_or("")));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim_end().to_string())
}

#[cfg(target_os = "macos")]
pub fn write_generic_password(service: &str, value: &str) -> Result<(), String> {
    let output = std::process::Command::new("security")
        .args(["add-generic-password", "-U", "-s", service, "-w", value])
        .output()
        .map_err(|error| format!("keychain write failed: {}", error))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("keychain write failed: {}", stderr.lines().next().unwrap_or("")));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn read_generic_password(service: &str) -> Result<String, String> {
    use windows::core::PCWSTR;
    use windows::Win32::Security::Credentials::{CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC};

    let target: Vec<u16> = service.encode_utf16().chain(std::iter::once(0)).collect();
    let mut credential: *mut CREDENTIALW = std::ptr::null_mut();
    let ok = unsafe { CredReadW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, 0, &mut credential) };
    if !ok.as_bool() {
        return Err("credential item not found".to_string());
    }
    if credential.is_null() {
        return Err("credential read returned null".to_string());
    }

    let cred = unsafe { &*credential };
    let bytes = unsafe {
        std::slice::from_raw_parts(
            cred.CredentialBlob,
            cred.CredentialBlobSize as usize,
        )
    };
    let value = String::from_utf8(bytes.to_vec())
        .map_err(|error| format!("credential value is not UTF-8: {}", error));
    unsafe { CredFree(Some(credential.cast())) };
    value
}

#[cfg(target_os = "windows")]
pub fn write_generic_password(service: &str, value: &str) -> Result<(), String> {
    use windows::core::PWSTR;
    use windows::Win32::Security::Credentials::{CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC};

    let mut target: Vec<u16> = service.encode_utf16().chain(std::iter::once(0)).collect();
    let mut username: Vec<u16> = "AI Usage".encode_utf16().chain(std::iter::once(0)).collect();
    let blob = value.as_bytes();
    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(target.as_mut_ptr()),
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_ptr() as *mut u8,
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        UserName: PWSTR(username.as_mut_ptr()),
        ..Default::default()
    };
    let ok = unsafe { CredWriteW(&credential, 0) };
    if ok.as_bool() {
        Ok(())
    } else {
        Err("credential write failed".to_string())
    }
}

pub fn read_generic_password_for_current_user(service: &str) -> Result<String, String> {
    read_generic_password(&current_user_target(service, &current_user_name()))
        .or_else(|_| read_generic_password(service))
}

pub fn write_generic_password_for_current_user(service: &str, value: &str) -> Result<(), String> {
    write_generic_password(&current_user_target(service, &current_user_name()), value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_user_target_joins_service_and_user() {
        assert_eq!(
            current_user_target("Claude Code-credentials", "alice"),
            "Claude Code-credentials:alice"
        );
    }

    #[test]
    fn current_user_target_trims_inputs() {
        assert_eq!(current_user_target(" Codex Auth ", " alice "), "Codex Auth:alice");
    }
}
```

- [ ] **Step 6: `host_api.rs`의 keychain functions를 credential_store로 연결한다**

At the top of `host_api.rs`, add:

```rust
use crate::plugin_engine::credential_store;
```

Inside `inject_keychain`, replace command-based read/write bodies with calls:

```rust
credential_store::read_generic_password(&service)
    .map_err(|e| Exception::throw_message(&ctx_inner, &e))
```

```rust
credential_store::read_generic_password_for_current_user(&service)
    .map_err(|e| Exception::throw_message(&ctx_inner, &e))
```

```rust
credential_store::write_generic_password(&service, &value)
    .map_err(|e| Exception::throw_message(&ctx_inner, &e))
```

```rust
credential_store::write_generic_password_for_current_user(&service, &value)
    .map_err(|e| Exception::throw_message(&ctx_inner, &e))
```

Do not keep `if !cfg!(target_os = "macos")` guards in these JS functions; the API must work on Windows.

- [ ] **Step 7: 테스트를 실행한다**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml credential_store
cargo test --manifest-path src-tauri/Cargo.toml keychain_api_exposes_write_variants
```

Expected: both PASS.

- [ ] **Step 8: 커밋한다**

Run:

```powershell
git add src-tauri/Cargo.toml src-tauri/src/plugin_engine/mod.rs src-tauri/src/plugin_engine/credential_store.rs src-tauri/src/plugin_engine/host_api.rs
git commit -m "feat: add windows credential host api"
```

---

### Task 4: Windows env/path/ccusage 처리 보강

**Files:**
- Modify: `src-tauri/src/plugin_engine/host_api.rs`

- [ ] **Step 1: Windows path enrichment 테스트를 추가한다**

Add to `host_api.rs` tests:

```rust
#[test]
fn ccusage_path_entries_with_windows_home_and_appdata_preserves_order() {
    let home = std::path::PathBuf::from(r"C:\Users\alice");
    let appdata = std::path::PathBuf::from(r"C:\Users\alice\AppData\Roaming");
    let existing = std::env::join_paths([
        std::path::PathBuf::from(r"C:\Program Files\nodejs"),
        std::path::PathBuf::from(r"C:\Users\alice\AppData\Roaming\npm"),
    ])
    .expect("join existing path");

    let entries = ccusage_path_entries_with_platform(
        Some(home.as_path()),
        Some(appdata.as_path()),
        Some(existing.as_os_str()),
        "windows",
    );

    assert_eq!(
        entries,
        vec![
            home.join(r".bun\bin"),
            appdata.join("npm"),
            std::path::PathBuf::from(r"C:\Program Files\nodejs"),
        ]
    );
}
```

- [ ] **Step 2: 테스트 실패를 확인한다**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml ccusage_path_entries_with_windows_home_and_appdata_preserves_order
```

Expected: `ccusage_path_entries_with_platform`가 아직 없어서 FAIL.

- [ ] **Step 3: platform-aware path helper를 추가한다**

Add near existing `ccusage_path_entries_with`:

```rust
fn ccusage_path_entries_with_platform(
    home: Option<&Path>,
    appdata: Option<&Path>,
    existing_path: Option<&OsStr>,
    platform: &str,
) -> Vec<PathBuf> {
    let mut entries = Vec::<PathBuf>::new();

    if platform == "windows" {
        if let Some(home) = home {
            entries.push(home.join(".bun").join("bin"));
        }
        if let Some(appdata) = appdata {
            entries.push(appdata.join("npm"));
        }
    } else {
        if let Some(home) = home {
            entries.push(home.join(".bun/bin"));
            entries.push(home.join(".nvm/current/bin"));
            entries.push(home.join(".local/bin"));
        }
        entries.push(PathBuf::from("/opt/homebrew/bin"));
        entries.push(PathBuf::from("/usr/local/bin"));
    }

    if let Some(existing) = existing_path {
        entries.extend(std::env::split_paths(existing));
    }

    let mut deduped = Vec::new();
    for entry in entries {
        if !deduped.iter().any(|existing| existing == &entry) {
            deduped.push(entry);
        }
    }
    deduped
}
```

Then change existing `ccusage_path_entries_with` to call it:

```rust
fn ccusage_path_entries_with(home: Option<&Path>, existing_path: Option<&OsStr>) -> Vec<PathBuf> {
    let appdata = std::env::var_os("APPDATA").map(PathBuf::from);
    ccusage_path_entries_with_platform(
        home,
        appdata.as_deref(),
        existing_path,
        std::env::consts::OS,
    )
}
```

- [ ] **Step 4: `expand_path` Windows 동작 테스트를 추가한다**

Add test:

```rust
#[test]
fn expand_path_keeps_non_tilde_paths() {
    assert_eq!(
        expand_path(r"C:\Users\alice\.codex\auth.json"),
        r"C:\Users\alice\.codex\auth.json"
    );
}
```

- [ ] **Step 5: 테스트를 실행한다**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml ccusage_path_entries_with_windows_home_and_appdata_preserves_order
cargo test --manifest-path src-tauri/Cargo.toml expand_path_keeps_non_tilde_paths
```

Expected: both PASS.

- [ ] **Step 6: 전체 host_api 테스트를 실행한다**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml host_api
```

Expected: PASS.

- [ ] **Step 7: 커밋한다**

Run:

```powershell
git add src-tauri/src/plugin_engine/host_api.rs
git commit -m "feat: support windows ccusage paths"
```

---

### Task 5: Windows 빌드에서 Claude/Codex만 번들

**Files:**
- Modify: `copy-bundled.cjs`

- [ ] **Step 1: bundling script 테스트 명령으로 현재 동작을 확인한다**

Run:

```powershell
bun run bundle:plugins
Get-ChildItem src-tauri\\resources\\bundled_plugins
```

Expected: 현재는 `mock`을 제외한 대부분 provider가 복사된다.

- [ ] **Step 2: Windows provider filter를 추가한다**

Replace `copy-bundled.cjs` with:

```js
const { cpSync, readdirSync, rmSync } = require("fs")
const { join } = require("path")

const root = __dirname
const exclude = new Set(["mock"])
const windowsOnly = new Set(["claude", "codex"])
const srcDir = join(root, "plugins")
const dstDir = join(root, "src-tauri", "resources", "bundled_plugins")
const isWindows = process.platform === "win32"

rmSync(dstDir, { recursive: true, force: true })

const plugins = readdirSync(srcDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !exclude.has(d.name))
  .map((d) => d.name)
  .filter((id) => !isWindows || windowsOnly.has(id))

for (const id of plugins) {
  cpSync(join(srcDir, id), join(dstDir, id), { recursive: true })
}

console.log(`Bundled ${plugins.length} plugins: ${plugins.join(", ")}`)
```

- [ ] **Step 3: bundling 결과를 확인한다**

Run:

```powershell
bun run bundle:plugins
Get-ChildItem src-tauri\\resources\\bundled_plugins
```

Expected on Windows: only `claude`, `codex`.

- [ ] **Step 4: 커밋한다**

Run:

```powershell
git add copy-bundled.cjs
git commit -m "build: bundle claude and codex on windows"
```

---

### Task 6: Claude/Codex plugin Windows path 테스트 추가

**Files:**
- Modify: `plugins/claude/plugin.test.js`
- Modify: `plugins/codex/plugin.test.js`
- Modify: `plugins/claude/plugin.js`
- Modify: `plugins/codex/plugin.js`

- [ ] **Step 1: Codex Windows auth path 테스트를 추가한다**

Add to `plugins/codex/plugin.test.js`:

```js
it("uses CODEX_HOME auth path on windows when set", async () => {
  const ctx = makeCtx()
  const plugin = await loadPlugin()
  ctx.app.platform = "windows"
  ctx.host.env.get.mockImplementation((name) => {
    if (name === "CODEX_HOME") return "C:/Users/alice/AppData/Roaming/Codex"
    return null
  })
  ctx.host.fs.writeText("C:/Users/alice/AppData/Roaming/Codex/auth.json", JSON.stringify({
    tokens: { access_token: "access", refresh_token: "refresh" },
    last_refresh: new Date().toISOString(),
  }))
  ctx.host.http.request.mockReturnValue({
    status: 200,
    headers: {
      "x-codex-primary-used-percent": "10",
      "x-codex-secondary-used-percent": "20",
    },
    bodyText: JSON.stringify({
      rate_limit: {
        primary_window: { used_percent: 10, reset_after_seconds: 3600 },
        secondary_window: { used_percent: 20, reset_after_seconds: 86400 },
      },
    }),
  })
  ctx.host.ccusage.query.mockReturnValue({ status: "ok", data: { daily: [] } })

  const result = plugin.probe(ctx)
  expect(result.lines.some((line) => line.label === "Session")).toBe(true)
})
```

- [ ] **Step 2: Claude Windows config path 테스트를 추가한다**

Add to `plugins/claude/plugin.test.js`:

```js
it("uses CLAUDE_CONFIG_DIR credentials path on windows when set", async () => {
  const ctx = makeCtx()
  const plugin = await loadPlugin()
  ctx.app.platform = "windows"
  ctx.host.env.get.mockImplementation((name) => {
    if (name === "CLAUDE_CONFIG_DIR") return "C:/Users/alice/.claude"
    return null
  })
  ctx.host.fs.writeText("C:/Users/alice/.claude/.credentials.json", JSON.stringify({
    claudeAiOauth: {
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: Date.now() + 60_000,
      scopes: ["user:profile"],
    },
  }))
  ctx.host.http.request.mockImplementation((opts) => {
    const url = String(opts && opts.url ? opts.url : "")
    if (url === "https://promoclock.co/api/status") {
      return {
        status: 200,
        headers: {},
        bodyText: JSON.stringify({
          status: "off_peak",
          isPeak: false,
          isOffPeak: true,
          isWeekend: false,
        }),
      }
    }
    return {
      status: 200,
      headers: {},
      bodyText: JSON.stringify({
        five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00.000Z" },
        seven_day: { utilization: 20, resets_at: "2099-01-01T00:00:00.000Z" },
      }),
    }
  })
  ctx.host.ccusage.query.mockReturnValue({ status: "ok", data: { daily: [] } })

  const result = plugin.probe(ctx)
  expect(result.lines.some((line) => line.label === "Session")).toBe(true)
})
```

Use existing test helpers in those files instead of creating duplicate mock helpers if equivalent helpers already exist.

- [ ] **Step 3: plugin tests를 실행해 실패를 확인한다**

Run:

```powershell
bun test plugins/codex/plugin.test.js plugins/claude/plugin.test.js
```

Expected: 새 테스트가 실패하면 plugin path logic을 수정한다. 이미 통과하면 구현 변경 없이 테스트만 커밋한다.

- [ ] **Step 4: plugin path logic을 현재 기대값과 맞춘다**

For Codex, keep this behavior in `resolveAuthPaths(ctx)`:

```js
const codexHome = readCodexHome(ctx)
if (codexHome) {
  return [joinPath(codexHome, AUTH_FILE)]
}
return CONFIG_AUTH_PATHS.map((basePath) => joinPath(basePath, AUTH_FILE))
```

For Claude, keep this behavior:

```js
function getClaudeHomePath(ctx) {
  return readEnvText(ctx, "CLAUDE_CONFIG_DIR") || DEFAULT_CLAUDE_HOME
}
```

The production path logic should stay as shown above. Do not add Windows-only special cases unless the failing assertion proves that `CODEX_HOME` or `CLAUDE_CONFIG_DIR` is ignored.

- [ ] **Step 5: plugin tests를 다시 실행한다**

Run:

```powershell
bun test plugins/codex/plugin.test.js plugins/claude/plugin.test.js
```

Expected: PASS.

- [ ] **Step 6: 커밋한다**

Run:

```powershell
git add plugins/codex/plugin.test.js plugins/claude/plugin.test.js plugins/codex/plugin.js plugins/claude/plugin.js
git commit -m "test: cover windows auth paths for claude and codex"
```

---

### Task 7: Windows shortcut 표시와 tray 문구 정리

**Files:**
- Modify: `src/components/global-shortcut-section.tsx`
- Modify: `src/components/global-shortcut-section.test.tsx`
- Modify: `src/pages/settings.tsx`
- Modify: `src/pages/settings.test.tsx`

- [ ] **Step 1: shortcut display 테스트를 Windows 기준으로 추가한다**

Add to `src/components/global-shortcut-section.test.tsx`:

```tsx
it("displays CommandOrControl as Ctrl on windows", () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(navigator, "platform")
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: "Win32",
  })

  renderSection("CommandOrControl+Shift+U")
  expect(screen.getByText("Ctrl + Shift + U")).toBeInTheDocument()

  if (originalPlatform) {
    Object.defineProperty(navigator, "platform", originalPlatform)
  }
})
```

- [ ] **Step 2: 테스트 실패를 확인한다**

Run:

```powershell
bun test src/components/global-shortcut-section.test.tsx
```

Expected: 현재는 `Cmd + Shift + U`라 FAIL.

- [ ] **Step 3: platform-aware display helper를 구현한다**

In `src/components/global-shortcut-section.tsx`, add:

```ts
function isWindowsPlatform(): boolean {
  return typeof navigator !== "undefined" && /Win/i.test(navigator.platform)
}
```

Replace `formatShortcutForDisplay` with:

```ts
function formatShortcutForDisplay(shortcut: string): string {
  const commandLabel = isWindowsPlatform() ? "Ctrl" : "Cmd"
  const altLabel = isWindowsPlatform() ? "Alt" : "Opt"
  return shortcut
    .replace(/CommandOrControl/g, commandLabel)
    .replace(/Command/g, "Cmd")
    .replace(/Control/g, "Ctrl")
    .replace(/Option/g, altLabel)
    .replace(/Alt/g, altLabel)
    .replace(/\+/g, " + ")
}
```

In `buildShortcutFromCodes`, replace display labels:

```ts
displayMods.push(isWindowsPlatform() ? "Ctrl" : "Cmd")
```

and:

```ts
displayMods.push(isWindowsPlatform() ? "Alt" : "Opt")
```

- [ ] **Step 4: settings 문구에서 menu bar를 tray로 바꾼다**

Search:

```powershell
rg -n "menu bar|Menu bar|menubar|Menubar" src/pages src/components src/lib
```

For user-facing labels in `src/pages/settings.tsx`, change labels to neutral "Tray icon" or "Tray". Keep internal type names such as `MenubarIconStyle` unchanged to avoid broad churn.

- [ ] **Step 5: frontend tests를 실행한다**

Run:

```powershell
bun test src/components/global-shortcut-section.test.tsx src/pages/settings.test.tsx
```

Expected: PASS.

- [ ] **Step 6: 커밋한다**

Run:

```powershell
git add src/components/global-shortcut-section.tsx src/components/global-shortcut-section.test.tsx src/pages/settings.tsx src/pages/settings.test.tsx
git commit -m "feat: adjust shortcut and tray wording for windows"
```

---

### Task 8: Windows packaging workflow 추가

**Files:**
- Modify: `.github/workflows/publish.yml`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: 현재 workflow가 macOS만 빌드하는지 확인한다**

Run:

```powershell
rg -n "macos-latest|windows-latest|apple-darwin|msi|nsis" .github\\workflows\\publish.yml src-tauri\\tauri.conf.json
```

Expected: `publish.yml`은 macOS matrix만 가진다.

- [ ] **Step 2: Windows bundle target을 명시한다**

In `src-tauri/tauri.conf.json`, change:

```json
"targets": "all"
```

to:

```json
"targets": ["dmg", "nsis", "msi"]
```

If Tauri rejects `dmg` on non-macOS in CI, split target args in workflow instead and keep config as `"all"`.

- [ ] **Step 3: publish workflow에 Windows matrix row를 추가한다**

In `.github/workflows/publish.yml`, extend matrix:

```yaml
          - platform: windows-latest
            args: ""
```

Add Windows-only verification after build:

```yaml
      - name: Verify Windows artifacts
        if: runner.os == 'Windows'
        shell: pwsh
        run: |
          Get-ChildItem src-tauri/target/release/bundle -Recurse
          $installers = Get-ChildItem src-tauri/target/release/bundle -Recurse -Include *.msi,*.exe
          if ($installers.Count -lt 1) {
            throw "No Windows installer artifact found."
          }
```

- [ ] **Step 4: Apple certificate steps를 macOS 전용으로 제한한다**

Add:

```yaml
        if: runner.os == 'macOS'
```

to the "Import Apple Developer Certificate" step.

- [ ] **Step 5: workflow YAML을 정적 검토한다**

Run:

```powershell
git diff -- .github\\workflows\\publish.yml src-tauri\\tauri.conf.json
```

Expected: macOS path remains, Windows runner is additive, no existing macOS signing step runs on Windows.

- [ ] **Step 6: 커밋한다**

Run:

```powershell
git add .github/workflows/publish.yml src-tauri/tauri.conf.json
git commit -m "ci: add windows release build"
```

---

### Task 9: 문서와 최종 검증

**Files:**
- Modify: `README.md`
- Modify: `docs/capture-logs.md`
- Modify: `docs/providers/claude.md`
- Modify: `docs/providers/codex.md`

- [ ] **Step 1: README에 Windows 1차 지원 범위를 추가한다**

Add a concise section:

```md
## Windows support

The first Windows build supports Claude and Codex. Other provider source files remain in the repository, but Windows release builds only bundle Claude and Codex until each provider has a verified Windows credential and data-source path.
```

- [ ] **Step 2: 로그 캡처 문서를 Windows 포함으로 수정한다**

In `docs/capture-logs.md`, add:

```md
### Windows

Open AI Usage from the system tray, go to Settings, and use the log path action. Logs are written through the Tauri log plugin under the app log directory.
```

- [ ] **Step 3: 전체 테스트를 실행한다**

Run:

```powershell
bun test
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 4: Windows dev build를 실행한다**

Run:

```powershell
bun run bundle:plugins
bun run tauri dev
```

Expected:

- tray icon appears
- clicking tray opens the panel
- Settings opens
- Claude and Codex provider cards are available
- unsupported providers are not bundled in Windows resource output

- [ ] **Step 5: Local HTTP API smoke test를 실행한다**

After at least one successful probe, run:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:6736/v1/usage"
```

Expected: JSON array containing cached `claude` and/or `codex` snapshots.

- [ ] **Step 6: 최종 커밋한다**

Run:

```powershell
git add README.md docs/capture-logs.md docs/providers/claude.md docs/providers/codex.md
git commit -m "docs: document windows claude codex support"
```

---

## 자체 검토 체크리스트

- [ ] 설계 문서의 모든 요구사항이 task에 매핑되어 있다.
- [ ] 기존 provider 파일 삭제 작업이 없다.
- [ ] Claude/Codex만 Windows 1차 scope로 제한한다.
- [ ] macOS 동작은 `cfg(target_os = "macos")`로 보존한다.
- [ ] Windows Credential Manager 구현은 JS-facing `ctx.host.keychain` API를 유지한다.
- [ ] ccusage runner 부재는 provider 전체 실패가 아니라 local token usage 생략 또는 non-fatal 상태로 다룬다.
- [ ] 각 task는 테스트 작성 또는 검증 명령을 포함한다.
- [ ] 각 task는 독립 커밋으로 끝난다.
