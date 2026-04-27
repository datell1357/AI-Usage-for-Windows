# AI Usage

[한국어](#한국어) | [English](#english)

---

## 한국어

AI Usage는 AI 코딩 구독 사용량을 Windows 시스템 트레이에서 빠르게 확인하는 데스크톱 앱입니다.

![AI Usage 한국어 스크린샷](Korean%20Screenshot.png)

### 다운로드

[최신 Windows 릴리즈 다운로드](https://github.com/datell1357/AI-Usage-for-Windows/releases/latest)

AI Usage는 Windows 시스템 트레이에서만 동작하며 작업표시줄에는 표시되지 않습니다. 트레이 아이콘을 클릭하면 작업표시줄 우측 하단 기준으로 패널이 위로 열립니다.

### 주요 기능

- Windows 트레이 전용 앱
- 트레이 아이콘 좌클릭 패널 토글 및 우클릭 메뉴
- 글로벌 단축키 지원
- 기본 5분 자동 새로고침
- 기본 Start on Login 활성화
- `127.0.0.1:6736` 로컬 HTTP API
- Provider HTTP 요청 프록시 지원
- 플러그인 기반 provider 구조

### 지원 Provider

현재 Windows 릴리즈에 포함된 provider입니다.

| Provider | 기본 상태 | 설명 |
|---|---:|---|
| [Claude](docs/providers/claude.md) | 활성화 | Claude Code OAuth 사용량, 주간/세션 제한, extra usage, ccusage 로컬 토큰 데이터 |
| [Codex](docs/providers/codex.md) | 활성화 | Codex/ChatGPT OAuth 사용량, 주간/세션 제한, reviews, credits |
| [Gemini](docs/providers/gemini.md) | 활성화 | Gemini CLI OAuth credentials 및 Cloud Code quota API |
| [Antigravity](docs/providers/antigravity.md) | 활성화 | Windows SQLite 및 Cloud Code fallback 경로 |
| [Cursor](docs/providers/cursor.md) | 비활성화 | Cursor Desktop SQLite 및 CLI credential fallback |

감지와 조회가 가능한 provider는 자동으로 표시됩니다. Cursor는 번들에 포함되어 있지만 Windows 계정/토큰/API 안정성 검증이 더 필요해 기본 비활성화 상태입니다.

### 문서

- [Claude provider](docs/providers/claude.md)
- [Codex provider](docs/providers/codex.md)
- [Gemini provider](docs/providers/gemini.md)
- [Antigravity provider](docs/providers/antigravity.md)
- [Cursor provider](docs/providers/cursor.md)
- [Plugin API](docs/plugins/api.md)
- [Local HTTP API](docs/local-http-api.md)
- [Proxy support](docs/proxy.md)
- [Capture logs](docs/capture-logs.md)

### 소스에서 빌드

#### 요구사항

- Windows 10 이상
- Node.js 20 이상
- Rust stable MSVC toolchain
- bundled QuickJS 빌드를 위한 LLVM (`C:\Program Files\LLVM`)
- Tauri 번들링에 필요한 WiX Toolset / NSIS 의존성

#### 설치

```powershell
npm install
```

#### 테스트

```powershell
npm.cmd test
```

Provider 중심 테스트:

```powershell
npm.cmd test -- plugins/gemini/plugin.test.js plugins/antigravity/plugin.test.js
```

#### 프론트엔드 빌드

```powershell
npm.cmd run build
```

#### Windows 설치 파일 빌드

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;C:\Program Files\LLVM\bin;$env:Path"
$env:LIBCLANG_PATH="C:\Program Files\LLVM\bin"
npm.cmd run tauri -- build
```

설치 파일은 다음 경로에 생성됩니다.

- `src-tauri\target\release\bundle\nsis\AI Usage_0.1.0_x64-setup.exe`
- `src-tauri\target\release\bundle\msi\AI Usage_0.1.0_x64_en-US.msi`

### 크레딧

Built by [Yeoreum](https://www.threads.com/@mini.yeoreum).

AI Usage는 MIT 라이선스 소스 코드에 대한 수정 사항을 포함합니다. 필요한 저작권 및 허가 고지는 [LICENSE](LICENSE)에 보존되어 있습니다.

### 라이선스

[MIT](LICENSE)

---

## English

AI Usage is a Windows tray app for checking AI coding subscription usage at a glance.

![AI Usage English Screenshot](English%20Screenshot.png)

### Download

[Download the latest Windows release](https://github.com/datell1357/AI-Usage-for-Windows/releases/latest)

The app runs from the Windows system tray, stays out of the taskbar, and opens a compact panel above the tray icon.

### Features

- Windows tray-only app
- Left-click tray panel toggle and right-click tray menu
- Global shortcut support
- Automatic refresh, defaulting to 5 minutes
- Start on Login enabled by default
- Local HTTP API at `127.0.0.1:6736`
- Proxy support for provider HTTP requests
- Plugin-based provider architecture

### Supported Providers

The Windows release currently bundles these providers:

| Provider | Default | Notes |
|---|---:|---|
| [Claude](docs/providers/claude.md) | Enabled | Claude Code OAuth usage, weekly/session limits, extra usage, ccusage local token data |
| [Codex](docs/providers/codex.md) | Enabled | Codex/ChatGPT OAuth usage, weekly/session limits, reviews, credits |
| [Gemini](docs/providers/gemini.md) | Enabled | Gemini CLI OAuth credentials and Cloud Code quota APIs |
| [Antigravity](docs/providers/antigravity.md) | Enabled | Windows SQLite and Cloud Code fallback path |
| [Cursor](docs/providers/cursor.md) | Disabled | Cursor Desktop SQLite and CLI credential fallback |

Providers that can be detected and queried successfully appear automatically. Cursor is bundled but left off by default until Windows account, token, and API behavior is stable enough for automatic enablement.

### Documentation

- [Claude provider](docs/providers/claude.md)
- [Codex provider](docs/providers/codex.md)
- [Gemini provider](docs/providers/gemini.md)
- [Antigravity provider](docs/providers/antigravity.md)
- [Cursor provider](docs/providers/cursor.md)
- [Plugin API](docs/plugins/api.md)
- [Local HTTP API](docs/local-http-api.md)
- [Proxy support](docs/proxy.md)
- [Capture logs](docs/capture-logs.md)

### Build From Source

#### Requirements

- Windows 10 or later
- Node.js 20+
- Rust stable MSVC toolchain
- LLVM installed at `C:\Program Files\LLVM` for the bundled QuickJS build
- WiX Toolset / NSIS dependencies required by Tauri bundling

#### Install

```powershell
npm install
```

#### Test

```powershell
npm.cmd test
```

Focused provider tests:

```powershell
npm.cmd test -- plugins/gemini/plugin.test.js plugins/antigravity/plugin.test.js
```

#### Build Frontend

```powershell
npm.cmd run build
```

#### Build Windows Installers

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;C:\Program Files\LLVM\bin;$env:Path"
$env:LIBCLANG_PATH="C:\Program Files\LLVM\bin"
npm.cmd run tauri -- build
```

Installers are written to:

- `src-tauri\target\release\bundle\nsis\AI Usage_0.1.0_x64-setup.exe`
- `src-tauri\target\release\bundle\msi\AI Usage_0.1.0_x64_en-US.msi`

### Credits

Built by [Yeoreum](https://www.threads.com/@mini.yeoreum).

AI Usage includes modifications to MIT-licensed source code. Required copyright and permission notices are preserved in [LICENSE](LICENSE).

### License

[MIT](LICENSE)
