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
        let (icon_w, _) = physical_size(size);
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
