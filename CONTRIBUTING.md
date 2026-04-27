# Contributing to AI Usage

AI Usage is a Windows tray application for viewing AI coding subscription usage. Contributions should keep the app small, predictable, and safe around local credentials.

## Project Priorities

- Keep the app tray-first and Windows-focused.
- Prefer reliable usage tracking over broad provider coverage.
- Do not log tokens, account IDs, raw credential files, or full provider responses.
- Keep provider behavior easy to disable when an API is unstable.
- Use the AI Usage name, icon, installer name, and release wording for this project.

## Before Opening a PR

1. Fork the repository and create a focused branch.
2. Make one logical change per PR.
3. Run the smallest relevant tests first, then a production build when the change affects shipped behavior.
4. Include validation evidence in the PR description.
5. Include screenshots or screen recordings for visible UI changes.

## Development Commands

Install dependencies:

```powershell
npm install
```

Run tests:

```powershell
npm.cmd test
```

Run focused provider tests:

```powershell
npm.cmd test -- plugins/gemini/plugin.test.js plugins/antigravity/plugin.test.js
```

Build the frontend:

```powershell
npm.cmd run build
```

Build Windows installers:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;C:\Program Files\LLVM\bin;$env:Path"
$env:LIBCLANG_PATH="C:\Program Files\LLVM\bin"
npm.cmd run tauri -- build
```

## Provider Contributions

Provider plugins live under `plugins/` and must include:

- `plugin.json` metadata
- `plugin.js` implementation
- tests for auth discovery, parsing, error states, and redaction-sensitive behavior
- provider documentation under `docs/providers/`

New provider code should avoid writes to credential stores unless refresh persistence is required and tested. If a provider depends on an undocumented API, document the risk and keep the provider disabled by default until real Windows accounts have been verified.

## Documentation Contributions

Documentation should describe this repository and the Windows app directly. Do not copy people lists, product branding, release language, or support promises from other projects. Source attribution and license notices belong in `LICENSE` and `TRADEMARK.md`.

## License

By submitting a contribution, you agree that your contribution is provided under the MIT license terms used by this repository.
