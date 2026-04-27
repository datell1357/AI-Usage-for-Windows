# AI Usage

AI Usage is a Windows tray app for checking AI coding subscription usage at a glance.

![AI Usage Screenshot](screenshot.png)

## Download

[Download the latest Windows release](https://github.com/datell1357/AI-Usage-for-Windows/releases/latest)

The app runs from the Windows system tray, stays out of the taskbar, and opens a compact panel above the tray icon.

## Features

- Windows tray-only app with left-click panel toggle and right-click tray menu
- Global shortcut support
- Automatic refresh, defaulting to 5 minutes
- Start on login enabled by default
- Local HTTP API at `127.0.0.1:6736`
- Proxy support for provider HTTP requests
- Plugin-based provider architecture

## Supported Providers

The Windows release currently bundles these providers:

| Provider | Default | Notes |
|---|---:|---|
| [Claude](docs/providers/claude.md) | Enabled | Claude Code OAuth usage, weekly/session limits, extra usage, ccusage local token data |
| [Codex](docs/providers/codex.md) | Enabled | Codex/ChatGPT OAuth usage, weekly/session limits, reviews, credits |
| [Gemini](docs/providers/gemini.md) | Enabled | Gemini CLI OAuth credentials and Cloud Code quota APIs |
| [Antigravity](docs/providers/antigravity.md) | Enabled | Windows SQLite/Cloud Code fallback path |
| [Cursor](docs/providers/cursor.md) | Disabled | Cursor Desktop SQLite and CLI credential fallback |

Providers that can be detected and queried successfully appear automatically. Cursor is bundled but left off by default.

## Documentation

- [Claude provider](docs/providers/claude.md)
- [Codex provider](docs/providers/codex.md)
- [Gemini provider](docs/providers/gemini.md)
- [Antigravity provider](docs/providers/antigravity.md)
- [Cursor provider](docs/providers/cursor.md)
- [Plugin API](docs/plugins/api.md)
- [Local HTTP API](docs/local-http-api.md)
- [Proxy support](docs/proxy.md)
- [Capture logs](docs/capture-logs.md)

## Build From Source

### Requirements

- Windows 10 or later
- Node.js 20+
- Rust stable MSVC toolchain
- LLVM installed at `C:\Program Files\LLVM` for the bundled QuickJS build
- WiX Toolset / NSIS dependencies required by Tauri bundling

### Install

```powershell
npm install
```

### Test

```powershell
npm.cmd test
```

Focused provider tests:

```powershell
npm.cmd test -- plugins/gemini/plugin.test.js plugins/antigravity/plugin.test.js
```

### Build Frontend

```powershell
npm.cmd run build
```

### Build Windows Installers

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;C:\Program Files\LLVM\bin;$env:Path"
$env:LIBCLANG_PATH="C:\Program Files\LLVM\bin"
npm.cmd run tauri -- build
```

Installers are written to:

- `src-tauri\target\release\bundle\nsis\AI Usage_0.1.0_x64-setup.exe`
- `src-tauri\target\release\bundle\msi\AI Usage_0.1.0_x64_en-US.msi`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Keep changes focused, include validation evidence, and avoid unrelated refactors.

## Credits

Built by [Yeoreum](https://www.threads.com/@mini.yeoreum).

AI Usage includes modifications to MIT-licensed source code. Required copyright and permission notices are preserved in [LICENSE](LICENSE).

## License

[MIT](LICENSE)
