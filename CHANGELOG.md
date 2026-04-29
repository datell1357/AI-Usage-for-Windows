# Changelog

## v0.2.0 - 2026-04-29

### Added

- Windows-side Mobile Sync foundation for AI Usage for Mobile
- Mobile Sync settings section with pairing, manual sync, and unlink controls
- Secure Mobile Sync upload token storage in Windows Credential Manager
- Snapshot normalization from current Windows provider state for mobile upload

### Fixed

- Plugin enabled/disabled settings now persist across app restarts instead of re-enabling default providers during bootstrap

## v0.1.0 - 2026-04-27

Initial Windows release of AI Usage.

### Added

- Windows tray-only app behavior with taskbar hidden
- Compact tray panel positioned above the Windows taskbar area
- Global shortcut support
- Start on login enabled by default
- Auto refresh default set to 5 minutes
- Bars-style tray icon
- Local HTTP API at `127.0.0.1:6736`
- Provider support for Claude, Codex, Gemini, Antigravity, and Cursor
- Default provider order: Claude, Codex, Gemini, Antigravity, Cursor
- Default enabled providers: Claude, Codex, Gemini, Antigravity
- Windows Credential Manager fallback for supported provider auth flows
- Windows SQLite state database support for Cursor and Antigravity
- Gemini CLI 0.39.x bundled OAuth client discovery

### Changed

- Rebranded distribution text and product assets to AI Usage
- Installer name and bundle product name set to AI Usage
- About dialog credits updated to Built by Yeoreum
- Help button now opens the repository root

### Fixed

- Right-clicking the tray icon no longer opens the panel, so the tray menu remains accessible
- Panel hides when the window loses focus
- Setup child PowerShell window handling remains hidden for user-facing install flows
