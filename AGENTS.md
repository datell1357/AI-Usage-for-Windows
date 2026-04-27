# AGENTS.md

## Purpose

This repository contains AI Usage, a Windows tray application for checking AI coding subscription usage. Agent work in this repo should preserve the Windows tray-only product direction, the AI Usage branding, and credential-safe provider behavior.

## Work Classification

- `trivial`: one small documentation, test, or styling change with low blast radius.
- `normal`: user-facing behavior, multiple files, provider parsing, build settings, or release documentation.
- `high-risk`: credential handling, token refresh, local database access, installer/release changes, security policy, license or trademark wording, destructive filesystem operations, or broad refactors.

## Engineering Rules

- Read the existing code before editing.
- Keep changes focused on the requested behavior.
- Do not revert user changes unless explicitly asked.
- Prefer existing helpers and patterns over new abstractions.
- Use `rg` for searches.
- Use `apply_patch` for manual edits.
- Run focused tests before broad builds.
- Report validation that actually ran.

## Product Rules

- Use `AI Usage` for project name, app name, installer name, release notes, docs, logs, and user-facing copy.
- Do not use another project's name or logo as this app's product identity.
- Keep the app tray-only on Windows and out of the taskbar.
- Keep the default tray icon style as bars.
- Keep Start on Login enabled by default.
- Keep Auto Refresh defaulted to 5 minutes.
- Default provider order is Claude, Codex, Gemini, Antigravity, Cursor.
- Cursor is bundled but disabled by default until Windows account behavior is stable enough for automatic enablement.

## Credential Safety

- Never log raw access tokens, refresh tokens, cookies, account IDs, local credential payloads, or full provider HTTP responses.
- When touching provider auth, audit `src-tauri/src/plugin_engine/host_api.rs` redaction coverage.
- Be careful with SQLite and Windows Credential Manager access; read-only behavior is preferred unless refresh persistence is required.
- Treat undocumented provider APIs as unstable and fail with clear UI errors.

## Release Checklist

Before pushing to `main` or preparing a release:

1. Confirm `README.md` and `CHANGELOG.md` describe the current Windows build.
2. Confirm bundled providers and defaults match code and tests.
3. Run focused tests for changed areas.
4. Run `npm.cmd run build` for shipped frontend changes.
5. Run Tauri release build before publishing installer artifacts.
6. Confirm release assets use `AI Usage` naming.
7. Search for accidental product-brand regressions before publishing.

## Documentation Rules

- Write docs for this repository, not for another project.
- Keep source attribution and license notices in the license/branding files.
- Do not add people lists unless the current repository owner requests them.
- Link support actions to this repository.
