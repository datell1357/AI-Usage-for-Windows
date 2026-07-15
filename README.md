# AI Usage

[English](#english) | [한국어](#한국어)

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
- Automatic refresh, defaulting to 1 minute
- Start on Login enabled by default
- Optional local HTTP API at `127.0.0.1:6736` when `AI_USAGE_ENABLE_LOCAL_HTTP_API=1` is set
- Proxy support for provider HTTP requests
- Plugin-based provider architecture

### Supported Providers

The Windows release currently bundles these providers:

| Provider | Status | Notes |
|---|---:|---|
| [Claude](docs/providers/claude.md) | Available | Claude Code OAuth usage, weekly/session limits, extra usage, ccusage local token data |
| [Codex](docs/providers/codex.md) | Available | Codex/ChatGPT OAuth usage, weekly/session limits, reviews, credits |
| [Gemini](docs/providers/gemini.md) | Available | Gemini CLI / Code Assist OAuth credentials and Cloud Code quota APIs |
| [GitHub Copilot](docs/providers/copilot.md) | Available | GitHub CLI authenticated Copilot usage limits |
| [Sakana AI](docs/providers/sakana.md) | Available | Sakana AI Fugu 5-hour, weekly, and subscription details |
| [Antigravity](docs/providers/antigravity.md) | Available | Windows SQLite and Cloud Code fallback path |
| [Cursor](docs/providers/cursor.md) | Available | Cursor Desktop SQLite and CLI credential fallback |

Provider usage appears when the corresponding third-party tool is installed on the local Windows device, the user has completed sign-in so credentials are available, and the provider is enabled in the app settings.

Gemini usage reflects Gemini CLI / Code Assist quota buckets. Gemini app compute-based limits and Gemini API token accounting are separate Google surfaces.

### Documentation

- [Claude provider](docs/providers/claude.md)
- [Codex provider](docs/providers/codex.md)
- [Gemini provider](docs/providers/gemini.md)
- [GitHub Copilot provider](docs/providers/copilot.md)
- [Sakana AI provider](docs/providers/sakana.md)
- [Antigravity provider](docs/providers/antigravity.md)
- [Cursor provider](docs/providers/cursor.md)
- [Plugin API](docs/plugins/api.md)
- [Local HTTP API](docs/local-http-api.md)
- [Proxy support](docs/proxy.md)
- [Capture logs](docs/capture-logs.md)
- [Privacy Policy](PRIVACY.md)
- [Microsoft Store MSIX submission](docs/microsoft-store-msix.md)

### Build From Source

#### Requirements

- Windows 10 or later
- Node.js 20+
- Rust stable MSVC toolchain
- LLVM installed at `C:\Program Files\LLVM` for the bundled QuickJS build
- WiX Toolset / NSIS dependencies required by Tauri bundling

#### Install

```powershell
npm.cmd install
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

- `src-tauri\target\release\bundle\nsis\AI Usage_0.1.2_x64-setup.exe`
- `src-tauri\target\release\bundle\msi\AI Usage_0.1.2_x64_en-US.msi`

### Credits

Built by [Yeoreum](https://www.threads.com/@mini.yeoreum).

AI Usage is a separate Windows-focused project based on MIT-licensed source code from [robinebers/openusage](https://github.com/robinebers/openusage). It is not an official distribution of the original project.

Required copyright and permission notices are preserved in [LICENSE](LICENSE).

### License

[MIT](LICENSE)

---

## 한국어

AI Usage는 AI 코딩 구독 사용량을 Windows 시스템 트레이에서 빠르게 확인하는 데스크톱 앱입니다.

![AI Usage 한국어 스크린샷](Korean%20Screenshot.png)

### 다운로드

[최신 Windows 릴리스 다운로드](https://github.com/datell1357/AI-Usage-for-Windows/releases/latest)

AI Usage는 Windows 시스템 트레이에서만 동작하며 작업표시줄에는 표시되지 않습니다. 트레이 아이콘을 클릭하면 작업표시줄 우측 하단 기준으로 작은 패널이 위로 열립니다.

### 주요 기능

- Windows 트레이 전용 앱
- 트레이 아이콘 좌클릭 패널 열기/닫기, 우클릭 메뉴
- 전역 단축키 지원
- 기본 1분 자동 새로고침
- Start on Login 기본 활성화
- `AI_USAGE_ENABLE_LOCAL_HTTP_API=1` 설정 시 `127.0.0.1:6736` 로컬 HTTP API 제공
- Provider HTTP 요청 프록시 지원
- 플러그인 기반 provider 구조

### 지원 Provider

현재 Windows 릴리스에는 다음 provider가 포함되어 있습니다.

| Provider | 상태 | 설명 |
|---|---:|---|
| [Claude](docs/providers/claude.md) | 사용 가능 | Claude Code OAuth 사용량, 주간/세션 제한, extra usage, ccusage 로컬 토큰 데이터 |
| [Codex](docs/providers/codex.md) | 사용 가능 | Codex/ChatGPT OAuth 사용량, 주간/세션 제한, reviews, credits |
| [Gemini](docs/providers/gemini.md) | 사용 가능 | Gemini CLI / Code Assist OAuth credentials 및 Cloud Code quota API |
| [GitHub Copilot](docs/providers/copilot.md) | 사용 가능 | GitHub CLI 인증 기반 Copilot 사용량 제한 |
| [Sakana AI](docs/providers/sakana.md) | 사용 가능 | Sakana AI Fugu의 5시간, 주간 및 구독 정보 |
| [Antigravity](docs/providers/antigravity.md) | 사용 가능 | Windows SQLite 및 Cloud Code fallback 경로 |
| [Cursor](docs/providers/cursor.md) | 사용 가능 | Cursor Desktop SQLite 및 CLI credential fallback |

각 provider 사용량은 해당 도구가 로컬 Windows 기기에 설치되어 있고, 사용자가 로그인해 credential을 사용할 수 있으며, 앱 설정에서 provider가 활성화된 경우 표시됩니다.

Gemini 사용량은 Gemini CLI / Code Assist quota bucket 기준입니다. Gemini 앱의 compute 기반 제한과 Gemini API token accounting은 별도 Google 화면입니다.

### 문서

- [Claude provider](docs/providers/claude.md)
- [Codex provider](docs/providers/codex.md)
- [Gemini provider](docs/providers/gemini.md)
- [GitHub Copilot provider](docs/providers/copilot.md)
- [Sakana AI provider](docs/providers/sakana.md)
- [Antigravity provider](docs/providers/antigravity.md)
- [Cursor provider](docs/providers/cursor.md)
- [Plugin API](docs/plugins/api.md)
- [Local HTTP API](docs/local-http-api.md)
- [Proxy support](docs/proxy.md)
- [Capture logs](docs/capture-logs.md)
- [개인정보 처리방침](PRIVACY.md)
- [Microsoft Store MSIX 제출](docs/microsoft-store-msix.md)

### 소스에서 빌드

#### 요구사항

- Windows 10 이상
- Node.js 20 이상
- Rust stable MSVC toolchain
- bundled QuickJS 빌드를 위한 LLVM (`C:\Program Files\LLVM`)
- Tauri 번들링에 필요한 WiX Toolset / NSIS 의존성

#### 설치

```powershell
npm.cmd install
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

- `src-tauri\target\release\bundle\nsis\AI Usage_0.1.2_x64-setup.exe`
- `src-tauri\target\release\bundle\msi\AI Usage_0.1.2_x64_en-US.msi`

### 크레딧

Built by [Yeoreum](https://www.threads.com/@mini.yeoreum).

AI Usage는 [robinebers/openusage](https://github.com/robinebers/openusage)의 MIT 라이선스 소스 코드를 기반으로 Windows용으로 정리한 별도 프로젝트입니다. 원본 프로젝트의 공식 배포본이 아닙니다.

필요한 저작권 및 허가 고지는 [LICENSE](LICENSE)에 보존되어 있습니다.

### 라이선스

[MIT](LICENSE)
