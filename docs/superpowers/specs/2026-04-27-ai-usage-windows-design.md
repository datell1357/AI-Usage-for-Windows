# AI Usage Windows Design

## Summary

AI Usage is a Windows tray-only desktop app for viewing AI coding subscription usage. The app opens a compact panel above the Windows system tray, stays out of the taskbar, and keeps provider tracking local to the user's machine.

## Product Direction

- App name: AI Usage
- Primary platform: Windows
- Primary surface: system tray panel
- Installer naming: AI Usage
- Default tray icon style: bars
- Start on Login: enabled by default
- Auto Refresh: 5 minutes by default

## Provider Scope

Bundled providers:

- Claude
- Codex
- Gemini
- Antigravity
- Cursor

Default enabled providers:

- Claude
- Codex
- Gemini
- Antigravity

Cursor is bundled but disabled by default because its Windows account, token refresh, and undocumented usage API behavior need more real-account validation.

## Architecture

AI Usage uses Tauri, React, Rust, and QuickJS provider plugins.

- Rust owns tray/window behavior, plugin execution, local HTTP API, logging, autostart, shortcuts, and installer packaging.
- React owns the tray panel UI, settings, provider ordering, and refresh state.
- Provider plugins read local credentials through host APIs and return normalized usage lines.
- The local HTTP API exposes cached usage data on `127.0.0.1:6736`.

## Credential Safety

Provider plugins may read local credential files, SQLite state databases, or Windows Credential Manager entries. They must not log raw tokens, refresh tokens, cookies, account identifiers, or full provider payloads.

When a provider refreshes credentials, it should write back only to the source that was read and only when the provider requires refresh persistence.

## Branding

User-facing app, installer, release, and documentation text should use AI Usage. Source attribution belongs in `LICENSE` and `TRADEMARK.md`; it should not become product branding.

## Validation Expectations

Release candidates should pass focused provider tests, frontend build, Rust host tests for changed backend behavior, and Tauri release build before installer assets are published.
