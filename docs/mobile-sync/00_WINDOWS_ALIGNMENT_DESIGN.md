# Windows Mobile Sync Alignment Design

## Context

AI Usage for Mobile is designed as a read-only mobile companion for AI Usage for Windows. The mobile apps and widgets should not authenticate directly with AI providers. The Windows app remains responsible for provider credential access and usage collection, while Firebase stores only display-safe latest usage snapshots.

The source mobile planning documents mention GitHub Copilot in the initial provider examples. The Windows app currently supports Claude, Codex, Gemini, Antigravity, and Cursor. GitHub Copilot should remain a future provider until Windows collection support is added.

## Decisions

- MVP provider scope follows the current Windows app: Claude, Codex, Gemini, Antigravity, and Cursor.
- GitHub Copilot is documented as a future provider.
- Mobile UI renders the uploaded `providers[]` array instead of hardcoding a provider list.
- Firebase receives only normalized snapshot data. Provider tokens, refresh tokens, API keys, cookies, credential files, local paths, and raw logs remain on the Windows device.
- Pairing code creation and consumption are handled through Cloud Functions.
- Windows uploads snapshots through a Cloud Functions endpoint, not direct Firestore writes.
- Windows stores the device upload credential in Windows Credential Manager.
- The first Windows release containing Mobile Sync should be version `0.2.0`.
- The first mobile MVP should be version `0.1.0`.
- Snapshot payload compatibility is tracked independently with `schemaVersion: 1`.

## Versioning Rules

- App versions track shipped product capabilities and release artifacts.
- `schemaVersion` tracks Firebase snapshot payload shape.
- Mobile clients should declare a minimum supported Windows sync version. The Phase 1 minimum is `0.2.0`.
- Any breaking snapshot shape change must increment `schemaVersion` and include a mobile fallback plan.
- Adding a provider without changing payload shape does not require a schema version bump.

## Document Copies

The Windows-aligned copies live under `docs/mobile-sync/`:

- `01_PRD.md`
- `02_DATA_MODEL.md`
- `03_PHASES.md`
- `04_PROJECT_SPEC.md`
- `기초 설계안.md`

The original mobile project documents remain unchanged.

## Risks

- Windows Mobile Sync requires a new Firebase upload credential boundary. The implementation must keep credential storage and upload validation narrow.
- Mobile widgets can show stale data if Windows is offline. The UI must distinguish Fresh, Stale, and Offline.
- Provider display names are useful in the app, but Microsoft Store listing keywords must not use third-party product names as search keywords.
