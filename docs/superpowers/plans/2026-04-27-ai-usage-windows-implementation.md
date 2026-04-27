# AI Usage Windows Implementation Notes

## Current Release State

AI Usage v0.1.0 ships as a Windows tray-only app with NSIS and MSI installers. The tray panel opens above the Windows taskbar area, the app does not appear in the taskbar during normal use, and setup child processes are hidden from users.

## Completed Windows Work

- Windows tray panel behavior
- Hidden setup process handling
- Start on Login default enabled
- Auto Refresh default set to 5 minutes
- Bars-only tray icon setting
- AI Usage product naming and installer naming
- Home sidebar icon replacement
- GitHub help link pointing to the repository root
- Outside-click panel close behavior
- Right-click tray menu behavior
- Default provider order: Claude, Codex, Gemini, Antigravity, Cursor

## Provider Status

Enabled by default:

- Claude
- Codex
- Gemini
- Antigravity

Bundled but disabled by default:

- Cursor

Cursor remains manual because it depends on Cursor Desktop SQLite state, optional CLI credential fallback, token refresh, and undocumented usage endpoints with account-type-specific responses.

## Release Checklist

1. Run focused tests for changed provider or UI behavior.
2. Run `npm.cmd run build`.
3. Run Tauri release build with LLVM configured.
4. Confirm installer filenames use `AI Usage`.
5. Confirm README, CHANGELOG, LICENSE, SECURITY, CONTRIBUTING, and TRADEMARK match the release.
6. Confirm no accidental product-branding regressions with `rg`.
7. Push the feature branch.
8. Update `main`.
9. Tag the release.
10. Publish GitHub Release assets.

## Rollback

Release documentation and provider-default changes should be committed in focused commits. If a release issue is found, revert the relevant commit, rebuild installers, retag, and replace release assets.
