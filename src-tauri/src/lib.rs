mod config;
mod local_http_api;
#[cfg(target_os = "windows")]
mod panel_windows;
mod plugin_engine;
mod tray;

use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Emitter;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const GLOBAL_SHORTCUT_STORE_KEY: &str = "globalShortcut";
const MOBILE_SYNC_STORE_KEY: &str = "mobileSync";
const MOBILE_SYNC_UPLOAD_TOKEN_SERVICE: &str = "mobile-sync-upload-token";
const MOBILE_SYNC_PROTOCOL_VERSION: u32 = 1;
const MOBILE_SYNC_SCHEMA_VERSION: u32 = 1;
const MOBILE_SYNC_HTTP_TIMEOUT_MS: u64 = 10_000;
const FIREBASE_OAUTH_SESSION_TIMEOUT_SECS: u64 = 900;
const FIREBASE_LOOPBACK_HTML_SUCCESS: &str = "<html><body><h3>AI Usage sign-in completed.</h3><p>You can close this window and return to the app.</p></body></html>";
const FIREBASE_LOOPBACK_HTML_FAILURE: &str = "<html><body><h3>AI Usage sign-in failed.</h3><p>You can close this window and return to the app.</p></body></html>";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFirebaseLoopbackAuthStart {
    provider_id: String,
    session_id: String,
    flow: String,
    authorization_url: Option<String>,
    callback_url: Option<String>,
    verification_uri: Option<String>,
    user_code: Option<String>,
    expires_in_secs: u64,
    poll_interval_secs: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFirebaseLoopbackAuthPoll {
    status: String,
    access_token: Option<String>,
    id_token: Option<String>,
    error: Option<String>,
    interval_secs: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
struct GoogleTokenResponse {
    access_token: Option<String>,
    id_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
struct GithubTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
    interval: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
struct GithubDeviceCodeResponse {
    device_code: Option<String>,
    user_code: Option<String>,
    verification_uri: Option<String>,
    expires_in: Option<u64>,
    interval: Option<u64>,
}

#[derive(Debug, Clone)]
enum NativeFirebaseLoopbackAuthState {
    Pending,
    Approved {
        access_token: String,
        id_token: Option<String>,
    },
    Failed {
        message: String,
    },
}

#[derive(Debug, Clone)]
struct NativeFirebaseLoopbackAuthSession {
    provider_id: String,
    flow: String,
    client_id: String,
    client_secret: Option<String>,
    callback_url: Option<String>,
    state: Option<String>,
    code_verifier: Option<String>,
    device_code: Option<String>,
    poll_interval_secs: Option<u64>,
    created_at: Instant,
    expires_in_secs: u64,
    status: NativeFirebaseLoopbackAuthState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MobileSyncConnection {
    device_id: String,
    device_name: String,
    linked_at: String,
    last_uploaded_at: Option<String>,
    last_upload_status: String,
    last_error: Option<String>,
    sync_protocol_version: u32,
    schema_version: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MobileSyncStatus {
    base_url_configured: bool,
    credential_stored: bool,
    is_linked: bool,
    connection: Option<MobileSyncConnection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MobileSyncSnapshotProvider {
    provider_id: String,
    display_name: String,
    icon_url: String,
    plan: Option<String>,
    status: String,
    lines: Vec<serde_json::Value>,
    error: Option<String>,
    refreshed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MobileSyncSnapshot {
    schema_version: u32,
    generated_at: String,
    providers: Vec<MobileSyncSnapshotProvider>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConsumePairingCodeRequest {
    code: String,
    device_name: String,
    platform: String,
    app_version: String,
    sync_protocol_version: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConsumePairingCodeResponse {
    device_id: String,
    upload_token: String,
    sync_protocol_version: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UploadLatestSnapshotRequest {
    device_id: String,
    snapshot: MobileSyncSnapshot,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    is_packaged_windows_app: bool,
    supports_updater: bool,
    supports_autostart: bool,
}

#[cfg(desktop)]
fn managed_shortcut_slot() -> &'static Mutex<Option<String>> {
    static SLOT: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

fn firebase_loopback_auth_sessions() -> &'static Mutex<HashMap<String, NativeFirebaseLoopbackAuthSession>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, NativeFirebaseLoopbackAuthSession>>> =
        OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Shared shortcut handler that toggles the panel when the shortcut is pressed.
#[cfg(desktop)]
fn handle_global_shortcut(
    app: &tauri::AppHandle,
    event: tauri_plugin_global_shortcut::ShortcutEvent,
) {
    if event.state == ShortcutState::Pressed {
        log::debug!("Global shortcut triggered");
        #[cfg(target_os = "windows")]
        panel_windows::toggle_panel(app);
    }
}

pub struct AppState {
    pub plugins: Vec<plugin_engine::manifest::LoadedPlugin>,
    pub app_data_dir: PathBuf,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMeta {
    pub id: String,
    pub name: String,
    pub icon_url: String,
    pub brand_color: Option<String>,
    pub lines: Vec<ManifestLineDto>,
    pub links: Vec<PluginLinkDto>,
    /// Ordered list of primary metric candidates (sorted by primaryOrder).
    /// Frontend picks the first one that exists in runtime data.
    pub primary_candidates: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestLineDto {
    #[serde(rename = "type")]
    pub line_type: String,
    pub label: String,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginLinkDto {
    pub label: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeBatchStarted {
    pub batch_id: String,
    pub plugin_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub batch_id: String,
    pub output: plugin_engine::runtime::PluginOutput,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeBatchComplete {
    pub batch_id: String,
}

#[tauri::command]
fn init_panel(app_handle: tauri::AppHandle) {
    #[cfg(target_os = "windows")]
    panel_windows::init(&app_handle).expect("Failed to initialize panel");
}

#[tauri::command]
fn hide_panel(app_handle: tauri::AppHandle) {
    #[cfg(target_os = "windows")]
    {
        use tauri::Manager;
        if let Some(window) = app_handle.get_webview_window("main") {
            let _ = window.hide();
        }
    }
}

#[tauri::command]
fn position_panel(app_handle: tauri::AppHandle) {
    #[cfg(target_os = "windows")]
    panel_windows::position_panel_near_tray(&app_handle);
}

#[tauri::command]
fn open_devtools(#[allow(unused)] app_handle: tauri::AppHandle) {
    #[cfg(debug_assertions)]
    {
        use tauri::Manager;
        if let Some(window) = app_handle.get_webview_window("main") {
            window.open_devtools();
        }
    }
}

#[tauri::command]
fn get_runtime_info() -> RuntimeInfo {
    let is_packaged_windows_app = is_windows_packaged_process();
    RuntimeInfo {
        is_packaged_windows_app,
        supports_updater: !is_packaged_windows_app,
        supports_autostart: !is_packaged_windows_app,
    }
}

#[tauri::command]
async fn start_probe_batch(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    batch_id: Option<String>,
    plugin_ids: Option<Vec<String>>,
) -> Result<ProbeBatchStarted, String> {
    let batch_id = batch_id
        .and_then(|id| {
            let trimmed = id.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let (plugins, app_data_dir, app_version) = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        (
            locked.plugins.clone(),
            locked.app_data_dir.clone(),
            locked.app_version.clone(),
        )
    };

    let selected_plugins = match plugin_ids {
        Some(ids) => {
            let mut by_id: HashMap<String, plugin_engine::manifest::LoadedPlugin> = plugins
                .into_iter()
                .map(|plugin| (plugin.manifest.id.clone(), plugin))
                .collect();
            let mut seen = HashSet::new();
            ids.into_iter()
                .filter_map(|id| {
                    if !seen.insert(id.clone()) {
                        return None;
                    }
                    by_id.remove(&id)
                })
                .collect()
        }
        None => plugins,
    };

    let response_plugin_ids: Vec<String> = selected_plugins
        .iter()
        .map(|plugin| plugin.manifest.id.clone())
        .collect();

    log::info!(
        "probe batch {} starting: {:?}",
        batch_id,
        response_plugin_ids
    );

    if selected_plugins.is_empty() {
        let _ = app_handle.emit(
            "probe:batch-complete",
            ProbeBatchComplete {
                batch_id: batch_id.clone(),
            },
        );
        return Ok(ProbeBatchStarted {
            batch_id,
            plugin_ids: response_plugin_ids,
        });
    }

    let remaining = Arc::new(AtomicUsize::new(selected_plugins.len()));
    for plugin in selected_plugins {
        let handle = app_handle.clone();
        let completion_handle = app_handle.clone();
        let bid = batch_id.clone();
        let completion_bid = batch_id.clone();
        let data_dir = app_data_dir.clone();
        let version = app_version.clone();
        let counter = Arc::clone(&remaining);

        tauri::async_runtime::spawn_blocking(move || {
            let plugin_id = plugin.manifest.id.clone();
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                plugin_engine::runtime::run_probe(&plugin, &data_dir, &version)
            }));

            match result {
                Ok(output) => {
                    let has_error = output.lines.iter().any(|line| {
                        matches!(line, plugin_engine::runtime::MetricLine::Badge { label, .. } if label == "Error")
                    });
                    if has_error {
                        log::warn!("probe {} completed with error", plugin_id);
                    } else {
                        log::info!(
                            "probe {} completed ok ({} lines)",
                            plugin_id,
                            output.lines.len()
                        );
                        local_http_api::cache_successful_output(&output);
                    }
                    let _ = handle.emit(
                        "probe:result",
                        ProbeResult {
                            batch_id: bid,
                            output,
                        },
                    );
                }
                Err(_) => {
                    log::error!("probe {} panicked", plugin_id);
                }
            }

            if counter.fetch_sub(1, Ordering::SeqCst) == 1 {
                log::info!("probe batch {} complete", completion_bid);
                let _ = completion_handle.emit(
                    "probe:batch-complete",
                    ProbeBatchComplete {
                        batch_id: completion_bid,
                    },
                );
            }
        });
    }

    Ok(ProbeBatchStarted {
        batch_id,
        plugin_ids: response_plugin_ids,
    })
}

#[tauri::command]
fn get_log_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let log_file = {
        #[cfg(target_os = "windows")]
        {
            use tauri::Manager;

            app_handle
                .path()
                .app_log_dir()
                .map_err(|error| error.to_string())?
                .join(format!("{}.log", app_handle.package_info().name))
        }

        #[cfg(not(target_os = "windows"))]
        {
            return Err("unsupported platform".to_string());
        }
    };

    Ok(log_file.to_string_lossy().to_string())
}

/// Update the global shortcut registration.
/// Pass `null` to disable the shortcut, or a shortcut string like "CommandOrControl+Shift+U".
#[cfg(desktop)]
#[tauri::command]
fn update_global_shortcut(
    app_handle: tauri::AppHandle,
    shortcut: Option<String>,
) -> Result<(), String> {
    let global_shortcut = app_handle.global_shortcut();
    let normalized_shortcut = shortcut.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    let mut managed_shortcut = managed_shortcut_slot()
        .lock()
        .map_err(|e| format!("failed to lock managed shortcut state: {}", e))?;

    if *managed_shortcut == normalized_shortcut {
        log::debug!("Global shortcut unchanged");
        return Ok(());
    }

    let previous_shortcut = managed_shortcut.clone();
    if let Some(existing) = previous_shortcut.as_deref() {
        match global_shortcut.unregister(existing) {
            Ok(()) => {
                // Keep in-memory state aligned with actual registration state.
                *managed_shortcut = None;
            }
            Err(e) => {
                log::warn!(
                    "Failed to unregister existing shortcut '{}': {}",
                    existing,
                    e
                );
            }
        }
    }

    if let Some(shortcut) = normalized_shortcut {
        log::info!("Registering global shortcut: {}", shortcut);
        global_shortcut
            .on_shortcut(shortcut.as_str(), |app, _shortcut, event| {
                handle_global_shortcut(app, event);
            })
            .map_err(|e| format!("Failed to register shortcut '{}': {}", shortcut, e))?;
        *managed_shortcut = Some(shortcut);
    } else {
        log::info!("Global shortcut disabled");
        *managed_shortcut = None;
    }

    Ok(())
}

#[tauri::command]
fn list_plugins(state: tauri::State<'_, Mutex<AppState>>) -> Vec<PluginMeta> {
    let plugins = {
        let locked = state.lock().expect("plugin state poisoned");
        locked.plugins.clone()
    };
    log::debug!("list_plugins: {} plugins", plugins.len());

    plugins
        .into_iter()
        .map(|plugin| {
            // Extract primary candidates: progress lines with primary_order, sorted by order
            let mut candidates: Vec<_> = plugin
                .manifest
                .lines
                .iter()
                .filter(|line| line.line_type == "progress" && line.primary_order.is_some())
                .collect();
            candidates.sort_by_key(|line| line.primary_order.unwrap());
            let primary_candidates: Vec<String> =
                candidates.iter().map(|line| line.label.clone()).collect();

            PluginMeta {
                id: plugin.manifest.id,
                name: plugin.manifest.name,
                icon_url: plugin.icon_data_url,
                brand_color: plugin.manifest.brand_color,
                lines: plugin
                    .manifest
                    .lines
                    .iter()
                    .map(|line| ManifestLineDto {
                        line_type: line.line_type.clone(),
                        label: line.label.clone(),
                        scope: line.scope.clone(),
                    })
                    .collect(),
                links: plugin
                    .manifest
                    .links
                    .iter()
                    .map(|link| PluginLinkDto {
                        label: link.label.clone(),
                        url: link.url.clone(),
                    })
                    .collect(),
                primary_candidates,
            }
        })
        .collect()
}

#[tauri::command]
fn mobile_sync_get_status(app_handle: tauri::AppHandle) -> MobileSyncStatus {
    build_mobile_sync_status(load_mobile_sync_connection(&app_handle))
}

#[tauri::command]
async fn mobile_sync_link_device(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    code: String,
    device_name: String,
    snapshot: MobileSyncSnapshot,
) -> Result<MobileSyncStatus, String> {
    let normalized_code = code.trim().to_string();
    if normalized_code.len() != 6 || !normalized_code.chars().all(|ch| ch.is_ascii_digit()) {
        return Err("Pairing code must be exactly 6 digits".to_string());
    }
    validate_mobile_sync_snapshot(&snapshot)?;

    let base_url = mobile_sync_base_url()?;
    let app_version = {
        let locked = state.lock().map_err(|error| error.to_string())?;
        locked.app_version.clone()
    };
    let resolved_device_name = {
        let trimmed = device_name.trim();
        if trimmed.is_empty() {
            default_mobile_sync_device_name()
        } else {
            trimmed.to_string()
        }
    };

    let request = ConsumePairingCodeRequest {
        code: normalized_code,
        device_name: resolved_device_name.clone(),
        platform: "windows".to_string(),
        app_version,
        sync_protocol_version: MOBILE_SYNC_PROTOCOL_VERSION,
    };

    let response = tauri::async_runtime::spawn_blocking({
        let base_url = base_url.clone();
        let request = request.clone();
        move || consume_pairing_code(&base_url, &request)
    })
    .await
    .map_err(|error| error.to_string())??;

    plugin_engine::host_api::write_keychain_generic_password(
        MOBILE_SYNC_UPLOAD_TOKEN_SERVICE,
        Some(&response.device_id),
        &response.upload_token,
    )?;

    let mut connection = MobileSyncConnection {
        device_id: response.device_id.clone(),
        device_name: resolved_device_name,
        linked_at: now_iso_string(),
        last_uploaded_at: None,
        last_upload_status: "idle".to_string(),
        last_error: None,
        sync_protocol_version: response.sync_protocol_version,
        schema_version: MOBILE_SYNC_SCHEMA_VERSION,
    };

    let upload_result = tauri::async_runtime::spawn_blocking({
        let base_url = base_url.clone();
        let request = UploadLatestSnapshotRequest {
            device_id: response.device_id.clone(),
            snapshot,
        };
        let upload_token = response.upload_token.clone();
        move || upload_mobile_sync_snapshot(&base_url, &upload_token, &request)
    })
    .await
    .map_err(|error| error.to_string())?;

    match upload_result {
        Ok(()) => {
            connection.last_uploaded_at = Some(now_iso_string());
            connection.last_upload_status = "success".to_string();
            connection.last_error = None;
        }
        Err(error) => {
            connection.last_upload_status = "error".to_string();
            connection.last_error = Some(error);
        }
    }

    save_mobile_sync_connection(&app_handle, Some(&connection))?;
    Ok(build_mobile_sync_status(Some(connection)))
}

#[tauri::command]
async fn mobile_sync_sync_now(
    app_handle: tauri::AppHandle,
    snapshot: MobileSyncSnapshot,
) -> Result<MobileSyncStatus, String> {
    validate_mobile_sync_snapshot(&snapshot)?;
    let base_url = mobile_sync_base_url()?;
    let mut connection = load_mobile_sync_connection(&app_handle)
        .ok_or_else(|| "Mobile Sync is not linked on this device".to_string())?;
    let upload_token = plugin_engine::host_api::read_keychain_generic_password(
        MOBILE_SYNC_UPLOAD_TOKEN_SERVICE,
        Some(&connection.device_id),
    )?;

    tauri::async_runtime::spawn_blocking({
        let base_url = base_url.clone();
        let request = UploadLatestSnapshotRequest {
            device_id: connection.device_id.clone(),
            snapshot,
        };
        move || upload_mobile_sync_snapshot(&base_url, &upload_token, &request)
    })
    .await
    .map_err(|error| error.to_string())??;

    connection.last_uploaded_at = Some(now_iso_string());
    connection.last_upload_status = "success".to_string();
    connection.last_error = None;
    save_mobile_sync_connection(&app_handle, Some(&connection))?;
    Ok(build_mobile_sync_status(Some(connection)))
}

#[tauri::command]
fn mobile_sync_unlink_device(app_handle: tauri::AppHandle) -> Result<MobileSyncStatus, String> {
    if let Some(connection) = load_mobile_sync_connection(&app_handle) {
        let _ = plugin_engine::host_api::delete_keychain_generic_password(
            MOBILE_SYNC_UPLOAD_TOKEN_SERVICE,
            Some(&connection.device_id),
        );
    }
    save_mobile_sync_connection(&app_handle, None)?;
    Ok(build_mobile_sync_status(None))
}

#[tauri::command]
fn firebase_start_google_loopback_sign_in(
    client_id: String,
    client_secret: String,
) -> Result<NativeFirebaseLoopbackAuthStart, String> {
    start_google_loopback_sign_in(&client_id, &client_secret)
}

#[tauri::command]
fn firebase_start_github_loopback_sign_in(
    client_id: String,
) -> Result<NativeFirebaseLoopbackAuthStart, String> {
    start_github_loopback_sign_in(&client_id)
}

#[tauri::command]
fn firebase_poll_loopback_sign_in(
    session_id: String,
) -> Result<NativeFirebaseLoopbackAuthPoll, String> {
    poll_loopback_sign_in(&session_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
    let _guard = runtime.enter();

    let packaged_windows_app = is_windows_packaged_process();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build());

    builder = builder.plugin(
        tauri_plugin_log::Builder::new()
            .targets([
                Target::new(TargetKind::Stdout),
                Target::new(TargetKind::LogDir { file_name: None }),
            ])
            .max_file_size(10_000_000) // 10 MB
            .level(log::LevelFilter::Trace) // Allow all levels; runtime filter via tray menu
            .level_for("hyper", log::LevelFilter::Warn)
            .level_for("reqwest", log::LevelFilter::Warn)
            .level_for("tao", log::LevelFilter::Info)
            .level_for("tauri_plugin_updater", log::LevelFilter::Info)
            .build(),
    );

    builder = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

    if packaged_windows_app {
        log::info!("packaged Windows runtime detected; startup updater/autostart disabled");
    } else {
        builder = builder.plugin(tauri_plugin_autostart::Builder::new().build());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            init_panel,
            hide_panel,
            position_panel,
            open_devtools,
            get_runtime_info,
            start_probe_batch,
            list_plugins,
            get_log_path,
            update_global_shortcut,
            mobile_sync_get_status,
            mobile_sync_link_device,
            mobile_sync_sync_now,
            mobile_sync_unlink_device,
            firebase_start_google_loopback_sign_in,
            firebase_start_github_loopback_sign_in,
            firebase_poll_loopback_sign_in
        ])
        .setup(|app| {
            use tauri::Manager;

            let version = app.package_info().version.to_string();
            log::info!("AI Usage v{} starting", version);

            // Load config early (lazy init via OnceLock, zero-cost after)
            let _proxy = config::get_resolved_proxy();

            let app_data_dir = app.path().app_data_dir().expect("no app data dir");
            let resource_dir = app.path().resource_dir().expect("no resource dir");
            let app_data_dir_tail = app_data_dir
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown");
            let redacted_app_data_dir =
                plugin_engine::host_api::redact_log_message(&app_data_dir.display().to_string());
            log::debug!(
                "app_data_dir: tail={}, path={}",
                app_data_dir_tail,
                redacted_app_data_dir
            );

            let (_, plugins) = plugin_engine::initialize_plugins(&app_data_dir, &resource_dir);
            let known_plugin_ids: Vec<String> =
                plugins.iter().map(|p| p.manifest.id.clone()).collect();
            app.manage(Mutex::new(AppState {
                plugins,
                app_data_dir: app_data_dir.clone(),
                app_version: app.package_info().version.to_string(),
            }));

            local_http_api::init(&app_data_dir, known_plugin_ids);
            if std::env::var_os("AI_USAGE_ENABLE_LOCAL_HTTP_API").is_some() {
                local_http_api::start_server();
            } else {
                log::info!("local HTTP API disabled by default");
            }

            tray::create(app.handle())?;

            if !is_windows_packaged_process() {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }

            // Register global shortcut from stored settings
            #[cfg(desktop)]
            {
                use tauri_plugin_store::StoreExt;

                if let Ok(store) = app.handle().store("settings.json") {
                    if let Some(shortcut_value) = store.get(GLOBAL_SHORTCUT_STORE_KEY) {
                        if let Some(shortcut) = shortcut_value.as_str() {
                            let shortcut = shortcut.trim();
                            if !shortcut.is_empty() {
                                let handle = app.handle().clone();
                                log::info!("Registering initial global shortcut: {}", shortcut);
                                if let Err(e) = handle.global_shortcut().on_shortcut(
                                    shortcut,
                                    |app, _shortcut, event| {
                                        handle_global_shortcut(app, event);
                                    },
                                ) {
                                    log::warn!("Failed to register initial global shortcut: {}", e);
                                } else if let Ok(mut managed_shortcut) =
                                    managed_shortcut_slot().lock()
                                {
                                    *managed_shortcut = Some(shortcut.to_string());
                                } else {
                                    log::warn!("Failed to store managed shortcut in memory");
                                }
                            }
                        }
                    }
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_, _| {});
}

fn is_windows_packaged_process() -> bool {
    #[cfg(target_os = "windows")]
    {
        std::env::current_exe()
            .ok()
            .map(|path| {
                path.components().any(|component| {
                    component
                        .as_os_str()
                        .to_str()
                        .map(|value| value.eq_ignore_ascii_case("WindowsApps"))
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false)
    }

    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::{GLOBAL_SHORTCUT_STORE_KEY, is_windows_packaged_process};

    #[test]
    fn global_shortcut_store_key_is_stable() {
        assert_eq!(GLOBAL_SHORTCUT_STORE_KEY, "globalShortcut");
    }

    #[test]
    fn packaged_windows_detection_is_false_in_non_packaged_tests() {
        assert!(!is_windows_packaged_process());
    }
}

fn now_iso_string() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn default_mobile_sync_device_name() -> String {
    std::env::var("COMPUTERNAME")
        .ok()
        .or_else(|| std::env::var("HOSTNAME").ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Windows PC".to_string())
}

fn mobile_sync_base_url() -> Result<String, String> {
    std::env::var("AI_USAGE_MOBILE_SYNC_BASE_URL")
        .map_err(|_| "Mobile Sync backend URL is not configured".to_string())
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .and_then(|value| {
            if value.is_empty() {
                Err("Mobile Sync backend URL is not configured".to_string())
            } else {
                Ok(value)
            }
        })
}

fn load_mobile_sync_connection(app_handle: &tauri::AppHandle) -> Option<MobileSyncConnection> {
    let store = app_handle.store("settings.json").ok()?;
    let value = store.get(MOBILE_SYNC_STORE_KEY)?;
    serde_json::from_value(value).ok()
}

fn save_mobile_sync_connection(
    app_handle: &tauri::AppHandle,
    connection: Option<&MobileSyncConnection>,
) -> Result<(), String> {
    let store = app_handle
        .store("settings.json")
        .map_err(|error| format!("failed to open settings store: {}", error))?;
    let value = match connection {
        Some(connection) => serde_json::to_value(connection)
            .map_err(|error| format!("failed to serialize mobile sync state: {}", error))?,
        None => serde_json::Value::Null,
    };
    store.set(MOBILE_SYNC_STORE_KEY, value);
    store
        .save()
        .map_err(|error| format!("failed to save mobile sync state: {}", error))
}

fn mobile_sync_credential_stored(connection: Option<&MobileSyncConnection>) -> bool {
    connection
        .and_then(|connection| {
            plugin_engine::host_api::read_keychain_generic_password(
                MOBILE_SYNC_UPLOAD_TOKEN_SERVICE,
                Some(&connection.device_id),
            )
            .ok()
        })
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
}

fn build_mobile_sync_status(connection: Option<MobileSyncConnection>) -> MobileSyncStatus {
    let credential_stored = mobile_sync_credential_stored(connection.as_ref());
    MobileSyncStatus {
        base_url_configured: mobile_sync_base_url().is_ok(),
        credential_stored,
        is_linked: connection.is_some(),
        connection,
    }
}

fn validate_mobile_sync_snapshot(snapshot: &MobileSyncSnapshot) -> Result<(), String> {
    if snapshot.schema_version != MOBILE_SYNC_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported mobile sync schema version: {}",
            snapshot.schema_version
        ));
    }

    for provider in &snapshot.providers {
        if provider.provider_id.trim().is_empty() {
            return Err("Mobile Sync snapshot contains an empty provider ID".to_string());
        }
        if provider.display_name.trim().is_empty() {
            return Err(format!(
                "Mobile Sync snapshot provider {} is missing displayName",
                provider.provider_id
            ));
        }
    }

    Ok(())
}

fn build_mobile_sync_http_client() -> Result<reqwest::blocking::Client, String> {
    let mut builder = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_millis(MOBILE_SYNC_HTTP_TIMEOUT_MS))
        .connect_timeout(std::time::Duration::from_millis(MOBILE_SYNC_HTTP_TIMEOUT_MS));

    if let Some(resolved) = crate::config::get_resolved_proxy() {
        builder = builder.proxy(resolved.proxy.clone());
    }

    builder
        .build()
        .map_err(|error| format!("failed to build Mobile Sync HTTP client: {}", error))
}

fn consume_pairing_code(
    base_url: &str,
    request: &ConsumePairingCodeRequest,
) -> Result<ConsumePairingCodeResponse, String> {
    let client = build_mobile_sync_http_client()?;
    let response = client
        .post(format!("{}/consumePairingCode", base_url))
        .json(request)
        .send()
        .map_err(|error| format!("link request failed: {}", error))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        return Err(format!("link request failed: {} {}", status, body));
    }

    response
        .json::<ConsumePairingCodeResponse>()
        .map_err(|error| format!("invalid link response: {}", error))
}

fn upload_mobile_sync_snapshot(
    base_url: &str,
    upload_token: &str,
    request: &UploadLatestSnapshotRequest,
) -> Result<(), String> {
    let client = build_mobile_sync_http_client()?;
    let response = client
        .post(format!("{}/uploadLatestSnapshot", base_url))
        .bearer_auth(upload_token)
        .json(request)
        .send()
        .map_err(|error| format!("snapshot upload failed: {}", error))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        return Err(format!("snapshot upload failed: {} {}", status, body));
    }

    Ok(())
}

fn validated_public_oauth_client_id(client_id: &str, provider_name: &str) -> Result<String, String> {
    let trimmed = client_id.trim();
    if trimmed.is_empty() {
        return Err(format!("{provider_name} OAuth client ID is not configured on this Windows device"));
    }
    if trimmed.len() > 256 || trimmed.contains(char::is_whitespace) {
        return Err(format!("{provider_name} OAuth client ID is invalid"));
    }
    Ok(trimmed.to_string())
}

fn validated_oauth_client_secret(client_secret: &str, provider_name: &str) -> Result<String, String> {
    let trimmed = client_secret.trim();
    if trimmed.is_empty() {
        return Err(format!("{provider_name} OAuth client secret is not configured on this Windows device"));
    }
    if trimmed.len() > 512 || trimmed.contains(char::is_whitespace) {
        return Err(format!("{provider_name} OAuth client secret is invalid"));
    }
    Ok(trimmed.to_string())
}

fn open_external_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn()
            .map_err(|error| format!("failed to open browser: {}", error))?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = url;
        Err("external browser sign-in is only implemented for Windows".to_string())
    }
}

fn encode_form_component(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                output.push(byte as char);
            }
            b' ' => output.push('+'),
            _ => output.push_str(&format!("%{:02X}", byte)),
        }
    }
    output
}

fn encode_form_pairs(pairs: &[(&str, &str)]) -> String {
    pairs
        .iter()
        .map(|(key, value)| format!("{}={}", encode_form_component(key), encode_form_component(value)))
        .collect::<Vec<_>>()
        .join("&")
}

fn start_google_loopback_sign_in(
    client_id: &str,
    client_secret: &str,
) -> Result<NativeFirebaseLoopbackAuthStart, String> {
    start_loopback_sign_in(
        client_id,
        Some(client_secret),
        "Google",
        "google.com",
    )
}

fn start_github_loopback_sign_in(client_id: &str) -> Result<NativeFirebaseLoopbackAuthStart, String> {
    start_github_device_sign_in(client_id)
}

fn start_loopback_sign_in(
    client_id: &str,
    client_secret: Option<&str>,
    provider_name: &str,
    provider_id: &str,
) -> Result<NativeFirebaseLoopbackAuthStart, String> {
    let client_id = validated_public_oauth_client_id(client_id, provider_name)?;
    let client_secret = client_secret
        .map(|secret| validated_oauth_client_secret(secret, provider_name))
        .transpose()?;
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("failed to reserve local OAuth callback port: {}", error))?;
    let local_addr = listener
        .local_addr()
        .map_err(|error| format!("failed to read local OAuth callback address: {}", error))?;
    let callback_url = format!("http://127.0.0.1:{}/oauth/callback", local_addr.port());
    let session_id = Uuid::new_v4().to_string();
    let state = Uuid::new_v4().to_string();
    let code_verifier = build_pkce_code_verifier();
    let authorization_url = build_provider_authorization_url(
        provider_id,
        &client_id,
        &callback_url,
        &state,
        &code_verifier,
    )?;

    let session = NativeFirebaseLoopbackAuthSession {
        provider_id: provider_id.to_string(),
        flow: "loopback".to_string(),
        client_id: client_id.clone(),
        client_secret,
        callback_url: Some(callback_url.clone()),
        state: Some(state.clone()),
        code_verifier: Some(code_verifier.clone()),
        device_code: None,
        poll_interval_secs: None,
        created_at: Instant::now(),
        expires_in_secs: FIREBASE_OAUTH_SESSION_TIMEOUT_SECS,
        status: NativeFirebaseLoopbackAuthState::Pending,
    };

    {
        let mut sessions = firebase_loopback_auth_sessions()
            .lock()
            .map_err(|error| format!("failed to lock OAuth session store: {}", error))?;
        sessions.insert(session_id.clone(), session);
    }

    spawn_loopback_callback_listener(
        session_id.clone(),
        client_id.clone(),
        listener,
    );

    if let Err(error) = open_external_browser(&authorization_url) {
        update_loopback_session_failed(&session_id, format!("failed to open browser: {}", error));
        return Err(error);
    }

    Ok(NativeFirebaseLoopbackAuthStart {
        provider_id: provider_id.to_string(),
        session_id,
        flow: "loopback".to_string(),
        authorization_url: Some(authorization_url),
        callback_url: Some(callback_url),
        verification_uri: None,
        user_code: None,
        expires_in_secs: FIREBASE_OAUTH_SESSION_TIMEOUT_SECS,
        poll_interval_secs: None,
    })
}

fn start_github_device_sign_in(client_id: &str) -> Result<NativeFirebaseLoopbackAuthStart, String> {
    let client_id = validated_public_oauth_client_id(client_id, "GitHub")?;
    let client = build_mobile_sync_http_client()?;
    let response = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(encode_form_pairs(&[
            ("client_id", client_id.as_str()),
            ("scope", "read:user user:email"),
        ]))
        .send()
        .map_err(|error| format!("GitHub device authorization failed: {}", error))?;

    let status = response.status();
    let payload = response
        .json::<GithubDeviceCodeResponse>()
        .map_err(|error| format!("Invalid GitHub device authorization response: {}", error))?;

    if !status.is_success() {
        return Err(format!("GitHub device authorization failed with status {}", status));
    }

    let device_code = payload
        .device_code
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "GitHub device authorization did not return a device code".to_string())?;
    let user_code = payload
        .user_code
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "GitHub device authorization did not return a user code".to_string())?;
    let verification_uri = payload
        .verification_uri
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "GitHub device authorization did not return a verification URL".to_string())?;
    let expires_in_secs = payload.expires_in.unwrap_or(FIREBASE_OAUTH_SESSION_TIMEOUT_SECS);
    let poll_interval_secs = payload.interval.unwrap_or(5);
    let session_id = Uuid::new_v4().to_string();

    let session = NativeFirebaseLoopbackAuthSession {
        provider_id: "github.com".to_string(),
        flow: "device_code".to_string(),
        client_id,
        client_secret: None,
        callback_url: None,
        state: None,
        code_verifier: None,
        device_code: Some(device_code),
        poll_interval_secs: Some(poll_interval_secs),
        created_at: Instant::now(),
        expires_in_secs,
        status: NativeFirebaseLoopbackAuthState::Pending,
    };

    {
        let mut sessions = firebase_loopback_auth_sessions()
            .lock()
            .map_err(|error| format!("failed to lock OAuth session store: {}", error))?;
        sessions.insert(session_id.clone(), session);
    }

    Ok(NativeFirebaseLoopbackAuthStart {
        provider_id: "github.com".to_string(),
        session_id,
        flow: "device_code".to_string(),
        authorization_url: None,
        callback_url: None,
        verification_uri: Some(verification_uri),
        user_code: Some(user_code),
        expires_in_secs,
        poll_interval_secs: Some(poll_interval_secs),
    })
}

fn poll_loopback_sign_in(session_id: &str) -> Result<NativeFirebaseLoopbackAuthPoll, String> {
    let mut sessions = firebase_loopback_auth_sessions()
        .lock()
        .map_err(|error| format!("failed to lock OAuth session store: {}", error))?;
    let session = sessions
        .get(session_id)
        .ok_or_else(|| "OAuth session not found. Start sign-in again.".to_string())?;

    if session.created_at.elapsed() >= Duration::from_secs(session.expires_in_secs) {
        sessions.remove(session_id);
        return Ok(NativeFirebaseLoopbackAuthPoll {
            status: "failed".to_string(),
            access_token: None,
            id_token: None,
            error: Some("Sign-in session expired before completion".to_string()),
            interval_secs: None,
        });
    }

    if session.flow == "device_code"
        && matches!(session.status, NativeFirebaseLoopbackAuthState::Pending)
    {
        let client_id = session.client_id.clone();
        let device_code = session
            .device_code
            .clone()
            .ok_or_else(|| "GitHub device sign-in code was missing".to_string())?;
        let current_interval = session.poll_interval_secs.unwrap_or(5);

        drop(sessions);

        let device_poll = poll_github_device_code(&client_id, &device_code, current_interval)?;

        let mut sessions = firebase_loopback_auth_sessions()
            .lock()
            .map_err(|error| format!("failed to lock OAuth session store: {}", error))?;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| "OAuth session not found. Start sign-in again.".to_string())?;
        if let Some(next_interval) = device_poll.next_interval_secs {
            session.poll_interval_secs = Some(next_interval);
        }
        match device_poll.outcome {
            GithubDevicePollOutcome::Pending => {}
            GithubDevicePollOutcome::Approved { access_token } => {
                session.status = NativeFirebaseLoopbackAuthState::Approved {
                    access_token,
                    id_token: None,
                };
            }
            GithubDevicePollOutcome::Failed { message } => {
                session.status = NativeFirebaseLoopbackAuthState::Failed { message };
            }
        }
        return poll_loopback_sign_in(session_id);
    }

    match &session.status {
        NativeFirebaseLoopbackAuthState::Pending => Ok(NativeFirebaseLoopbackAuthPoll {
            status: "pending".to_string(),
            access_token: None,
            id_token: None,
            error: None,
            interval_secs: session.poll_interval_secs,
        }),
        NativeFirebaseLoopbackAuthState::Approved {
            access_token,
            id_token,
        } => {
            let response = NativeFirebaseLoopbackAuthPoll {
                status: "approved".to_string(),
                access_token: Some(access_token.clone()),
                id_token: id_token.clone(),
                error: None,
                interval_secs: session.poll_interval_secs,
            };
            sessions.remove(session_id);
            Ok(response)
        }
        NativeFirebaseLoopbackAuthState::Failed { message } => {
            let response = NativeFirebaseLoopbackAuthPoll {
                status: "failed".to_string(),
                access_token: None,
                id_token: None,
                error: Some(message.clone()),
                interval_secs: session.poll_interval_secs,
            };
            sessions.remove(session_id);
            Ok(response)
        }
    }
}

enum GithubDevicePollOutcome {
    Pending,
    Approved { access_token: String },
    Failed { message: String },
}

struct GithubDevicePollResult {
    outcome: GithubDevicePollOutcome,
    next_interval_secs: Option<u64>,
}

fn poll_github_device_code(
    client_id: &str,
    device_code: &str,
    current_interval_secs: u64,
) -> Result<GithubDevicePollResult, String> {
    let client = build_mobile_sync_http_client()?;
    let response = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(encode_form_pairs(&[
            ("client_id", client_id),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ]))
        .send()
        .map_err(|error| format!("GitHub device sign-in polling failed: {}", error))?;

    let status = response.status();
    let payload = response
        .json::<GithubTokenResponse>()
        .map_err(|error| format!("Invalid GitHub device sign-in polling response: {}", error))?;

    if status.is_success() {
        let access_token = payload
            .access_token
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "GitHub token response missing access token".to_string())?;
        return Ok(GithubDevicePollResult {
            outcome: GithubDevicePollOutcome::Approved { access_token },
            next_interval_secs: payload.interval,
        });
    }

    let next_interval_secs = payload.interval.or(Some(current_interval_secs));
    let outcome = match payload.error.as_deref() {
        Some("authorization_pending") => GithubDevicePollOutcome::Pending,
        Some("slow_down") => GithubDevicePollOutcome::Pending,
        Some("expired_token") | Some("token_expired") => GithubDevicePollOutcome::Failed {
            message: "GitHub sign-in expired before completion".to_string(),
        },
        Some("access_denied") => GithubDevicePollOutcome::Failed {
            message: "GitHub sign-in was cancelled in the browser".to_string(),
        },
        Some(error_code) => GithubDevicePollOutcome::Failed {
            message: match payload.error_description {
                Some(description) if !description.trim().is_empty() => {
                    format!("GitHub sign-in failed: {} ({})", error_code, description)
                }
                _ => format!("GitHub sign-in failed: {}", error_code),
            },
        },
        None => GithubDevicePollOutcome::Failed {
            message: format!("GitHub sign-in failed with status {}", status),
        },
    };

    Ok(GithubDevicePollResult {
        outcome,
        next_interval_secs,
    })
}

fn build_pkce_code_verifier() -> String {
    format!(
        "{}{}",
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    )
}

fn build_pkce_code_challenge(code_verifier: &str) -> String {
    let digest = Sha256::digest(code_verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn build_provider_authorization_url(
    provider_id: &str,
    client_id: &str,
    callback_url: &str,
    state: &str,
    code_verifier: &str,
) -> Result<String, String> {
    let code_challenge = build_pkce_code_challenge(code_verifier);
    match provider_id {
        "google.com" => Ok(format!(
            "https://accounts.google.com/o/oauth2/v2/auth?{}",
            encode_form_pairs(&[
                ("client_id", client_id),
                ("redirect_uri", callback_url),
                ("response_type", "code"),
                ("scope", "openid email profile"),
                ("state", state),
                ("code_challenge", code_challenge.as_str()),
                ("code_challenge_method", "S256"),
                ("access_type", "offline"),
                ("prompt", "consent"),
            ])
        )),
        "github.com" => Ok(format!(
            "https://github.com/login/oauth/authorize?{}",
            encode_form_pairs(&[
                ("client_id", client_id),
                ("redirect_uri", callback_url),
                ("scope", "read:user user:email"),
                ("state", state),
                ("code_challenge", code_challenge.as_str()),
                ("code_challenge_method", "S256"),
            ])
        )),
        _ => Err(format!("Unsupported Firebase auth provider: {}", provider_id)),
    }
}

fn spawn_loopback_callback_listener(
    session_id: String,
    client_id: String,
    listener: TcpListener,
) {
    thread::spawn(move || {
        if listener.set_nonblocking(true).is_err() {
            update_loopback_session_failed(
                &session_id,
                "Failed to prepare local callback listener".to_string(),
            );
            return;
        }

        let deadline = Instant::now() + Duration::from_secs(FIREBASE_OAUTH_SESSION_TIMEOUT_SECS);
        loop {
            if Instant::now() >= deadline {
                update_loopback_session_failed(
                    &session_id,
                    "Sign-in session expired before completion".to_string(),
                );
                return;
            }

            match listener.accept() {
                Ok((stream, _)) => {
                    handle_loopback_callback_connection(&session_id, &client_id, stream);
                    return;
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(100));
                }
                Err(error) => {
                    update_loopback_session_failed(
                        &session_id,
                        format!("Failed to receive OAuth callback: {}", error),
                    );
                    return;
                }
            }
        }
    });
}

fn handle_loopback_callback_connection(
    session_id: &str,
    client_id: &str,
    mut stream: TcpStream,
) {
    let request_target = match read_loopback_request_target(&mut stream) {
        Ok(target) => target,
        Err(error) => {
            let _ = write_loopback_html_response(&mut stream, 400, FIREBASE_LOOPBACK_HTML_FAILURE);
            update_loopback_session_failed(session_id, error);
            return;
        }
    };

    let callback = match parse_loopback_callback(&request_target) {
        Ok(callback) => callback,
        Err(error) => {
            let _ = write_loopback_html_response(&mut stream, 400, FIREBASE_LOOPBACK_HTML_FAILURE);
            update_loopback_session_failed(session_id, error);
            return;
        }
    };

    let session = match get_loopback_session(session_id) {
        Ok(session) => session,
        Err(error) => {
            let _ = write_loopback_html_response(&mut stream, 410, FIREBASE_LOOPBACK_HTML_FAILURE);
            update_loopback_session_failed(session_id, error.clone());
            return;
        }
    };

    if session.flow != "loopback" {
        let _ = write_loopback_html_response(&mut stream, 400, FIREBASE_LOOPBACK_HTML_FAILURE);
        update_loopback_session_failed(session_id, "Unexpected OAuth callback for non-browser flow".to_string());
        return;
    }

    let Some(expected_state) = session.state.as_ref() else {
        let _ = write_loopback_html_response(&mut stream, 400, FIREBASE_LOOPBACK_HTML_FAILURE);
        update_loopback_session_failed(session_id, "OAuth session state was missing".to_string());
        return;
    };

    if callback.state != *expected_state {
        let _ = write_loopback_html_response(&mut stream, 400, FIREBASE_LOOPBACK_HTML_FAILURE);
        update_loopback_session_failed(session_id, "OAuth state verification failed".to_string());
        return;
    }

    if let Some(error) = callback.error {
        let _ = write_loopback_html_response(&mut stream, 400, FIREBASE_LOOPBACK_HTML_FAILURE);
        update_loopback_session_failed(session_id, error);
        return;
    }

    let Some(code) = callback.code else {
        let _ = write_loopback_html_response(&mut stream, 400, FIREBASE_LOOPBACK_HTML_FAILURE);
        update_loopback_session_failed(session_id, "OAuth callback did not include an authorization code".to_string());
        return;
    };

    match exchange_provider_auth_code(
        &session.provider_id,
        client_id,
        session.client_secret.as_deref(),
        session.callback_url.as_deref(),
        session.code_verifier.as_deref(),
        &code,
    ) {
        Ok((access_token, id_token)) => {
            let _ = write_loopback_html_response(&mut stream, 200, FIREBASE_LOOPBACK_HTML_SUCCESS);
            update_loopback_session_approved(session_id, access_token, id_token);
        }
        Err(error) => {
            let _ = write_loopback_html_response(&mut stream, 400, FIREBASE_LOOPBACK_HTML_FAILURE);
            update_loopback_session_failed(session_id, error);
        }
    }
}

fn read_loopback_request_target(stream: &mut TcpStream) -> Result<String, String> {
    let mut buffer = [0_u8; 8192];
    let bytes_read = stream
        .read(&mut buffer)
        .map_err(|error| format!("Failed to read OAuth callback request: {}", error))?;
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let first_line = request
        .lines()
        .next()
        .ok_or_else(|| "OAuth callback request was empty".to_string())?;
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let target = parts.next().unwrap_or_default();
    if method != "GET" || target.is_empty() {
        return Err("OAuth callback request was invalid".to_string());
    }
    Ok(target.to_string())
}

#[derive(Debug, Clone)]
struct ParsedLoopbackCallback {
    state: String,
    code: Option<String>,
    error: Option<String>,
}

fn parse_loopback_callback(request_target: &str) -> Result<ParsedLoopbackCallback, String> {
    let url = reqwest::Url::parse(&format!("http://127.0.0.1{}", request_target))
        .map_err(|error| format!("Failed to parse OAuth callback URL: {}", error))?;
    let mut state = None;
    let mut code = None;
    let mut error = None;
    let mut error_description = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "state" => state = Some(value.to_string()),
            "code" => code = Some(value.to_string()),
            "error" => error = Some(value.to_string()),
            "error_description" => error_description = Some(value.to_string()),
            _ => {}
        }
    }

    let state = state.ok_or_else(|| "OAuth callback was missing state".to_string())?;
    let error = error.map(|code| match error_description {
        Some(description) if !description.trim().is_empty() => format!("OAuth sign-in failed: {} ({})", code, description),
        _ => format!("OAuth sign-in failed: {}", code),
    });

    Ok(ParsedLoopbackCallback { state, code, error })
}

fn write_loopback_html_response(
    stream: &mut TcpStream,
    status_code: u16,
    html: &str,
) -> Result<(), String> {
    let status_text = match status_code {
        200 => "OK",
        400 => "Bad Request",
        410 => "Gone",
        _ => "OK",
    };
    let response = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status_code,
        status_text,
        html.len(),
        html
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|error| format!("Failed to write OAuth callback response: {}", error))
}

fn exchange_provider_auth_code(
    provider_id: &str,
    client_id: &str,
    client_secret: Option<&str>,
    callback_url: Option<&str>,
    code_verifier: Option<&str>,
    code: &str,
) -> Result<(String, Option<String>), String> {
    match provider_id {
        "google.com" => exchange_google_auth_code(
            client_id,
            client_secret.ok_or_else(|| "Google sign-in client secret was missing".to_string())?,
            callback_url.ok_or_else(|| "Google sign-in callback URL was missing".to_string())?,
            code_verifier.ok_or_else(|| "Google sign-in PKCE verifier was missing".to_string())?,
            code,
        ),
        "github.com" => exchange_github_auth_code(
            client_id,
            callback_url.ok_or_else(|| "GitHub sign-in callback URL was missing".to_string())?,
            code_verifier.ok_or_else(|| "GitHub sign-in PKCE verifier was missing".to_string())?,
            code,
        ),
        _ => Err(format!("Unsupported Firebase auth provider: {}", provider_id)),
    }
}

fn exchange_google_auth_code(
    client_id: &str,
    client_secret: &str,
    callback_url: &str,
    code_verifier: &str,
    code: &str,
) -> Result<(String, Option<String>), String> {
    let client = build_mobile_sync_http_client()?;
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(encode_form_pairs(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("code", code),
            ("code_verifier", code_verifier),
            ("redirect_uri", callback_url),
            ("grant_type", "authorization_code"),
        ]))
        .send()
        .map_err(|error| format!("Google token exchange failed: {}", error))?;

    let status = response.status();
    let payload = response
        .json::<GoogleTokenResponse>()
        .map_err(|error| format!("Invalid Google token response: {}", error))?;

    if !status.is_success() {
        return Err(match (payload.error, payload.error_description) {
            (Some(code), Some(description)) if !description.trim().is_empty() => {
                format!("Google sign-in failed: {} ({})", code, description)
            }
            (Some(code), _) => format!("Google sign-in failed: {}", code),
            _ => format!("Google sign-in failed with status {}", status),
        });
    }

    let access_token = payload
        .access_token
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Google token response missing access token".to_string())?;
    Ok((access_token, payload.id_token.filter(|value| !value.trim().is_empty())))
}

fn exchange_github_auth_code(
    client_id: &str,
    callback_url: &str,
    code_verifier: &str,
    code: &str,
) -> Result<(String, Option<String>), String> {
    let client = build_mobile_sync_http_client()?;
    let response = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(encode_form_pairs(&[
            ("client_id", client_id),
            ("code", code),
            ("redirect_uri", callback_url),
            ("code_verifier", code_verifier),
        ]))
        .send()
        .map_err(|error| format!("GitHub token exchange failed: {}", error))?;

    let status = response.status();
    let payload = response
        .json::<GithubTokenResponse>()
        .map_err(|error| format!("Invalid GitHub token response: {}", error))?;

    if !status.is_success() {
        return Err(match (payload.error, payload.error_description) {
            (Some(code), Some(description)) if !description.trim().is_empty() => {
                format!("GitHub sign-in failed: {} ({})", code, description)
            }
            (Some(code), _) => format!("GitHub sign-in failed: {}", code),
            _ => format!("GitHub sign-in failed with status {}", status),
        });
    }

    let access_token = payload
        .access_token
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "GitHub token response missing access token".to_string())?;
    Ok((access_token, None))
}

fn get_loopback_session(session_id: &str) -> Result<NativeFirebaseLoopbackAuthSession, String> {
    let sessions = firebase_loopback_auth_sessions()
        .lock()
        .map_err(|error| format!("failed to lock OAuth session store: {}", error))?;
    sessions
        .get(session_id)
        .cloned()
        .ok_or_else(|| "OAuth session not found. Start sign-in again.".to_string())
}

fn update_loopback_session_approved(
    session_id: &str,
    access_token: String,
    id_token: Option<String>,
) {
    if let Ok(mut sessions) = firebase_loopback_auth_sessions().lock() {
        if let Some(session) = sessions.get_mut(session_id) {
            session.status = NativeFirebaseLoopbackAuthState::Approved {
                access_token,
                id_token,
            };
        }
    }
}

fn update_loopback_session_failed(session_id: &str, message: String) {
    if let Ok(mut sessions) = firebase_loopback_auth_sessions().lock() {
        if let Some(session) = sessions.get_mut(session_id) {
            session.status = NativeFirebaseLoopbackAuthState::Failed { message };
        }
    }
}
