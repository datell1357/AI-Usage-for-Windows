# Privacy Policy

[한국어](#한국어) | [English](#english)

Last updated: 2026-04-27

---

## 한국어

이 개인정보 처리방침은 AI Usage Windows 앱에 적용됩니다.

AI Usage는 Windows 시스템 트레이에서 AI 코딩 구독 사용량을 확인하는 데스크톱 앱입니다. 앱은 provider 사용량을 조회하기 위해 사용자의 로컬 기기와 사용자가 로그인한 provider 서비스에 접근합니다.

### 수집하거나 처리하는 정보

AI Usage는 앱 동작을 위해 다음 정보를 로컬에서 읽거나 처리할 수 있습니다.

- provider 로그인 상태와 사용량 정보
- OAuth access token, refresh token, ID token 또는 provider credential 파일
- Windows Credential Manager 항목
- provider 앱이 저장한 SQLite 상태 데이터베이스
- 앱 설정값: 활성 provider, provider 순서, 테마, 표시 방식, 자동 새로고침, 전역 단축키, 시작 시 실행 여부
- 앱 로그와 오류 정보
- 로컬 HTTP API 캐시 데이터

### Provider credentials

AI Usage는 Claude, Codex, Gemini, Antigravity, Cursor 등의 사용량을 조회하기 위해 로컬 credential 파일, Windows Credential Manager, provider 상태 데이터베이스를 읽을 수 있습니다.

이 정보는 사용자의 기기에서 provider API 요청을 인증하고 사용량을 조회하는 데 사용됩니다. AI Usage 프로젝트 관리자는 사용자의 provider token, refresh token, credential 파일, 계정 비밀번호를 수집하거나 보관하지 않습니다.

일부 provider는 token 갱신이 필요할 수 있으며, AI Usage는 갱신된 access token을 원래 읽은 로컬 저장 위치에 다시 저장할 수 있습니다.

### Analytics

AI Usage는 앱 품질 개선을 위해 제한적인 analytics 이벤트를 전송할 수 있습니다. 현재 코드 기준으로 이벤트는 다음과 같은 앱 사용 동작에 한정됩니다.

- 앱 실행 여부: `app_started`
- 설정 변경: 테마, 표시 방식, 자동 새로고침, 전역 단축키, 시작 시 실행
- provider 활성/비활성 변경
- provider 순서 변경
- provider 수동 새로고침
- 업데이트 수락

Analytics 이벤트에는 provider token, refresh token, credential 파일 내용, 사용자의 코드, 프롬프트, 대화 내용, provider 응답 원문을 포함하지 않도록 설계되어 있습니다.

### Provider API 요청

사용량 조회를 위해 AI Usage는 사용자가 활성화한 provider의 API로 요청을 보낼 수 있습니다. 이 요청은 해당 provider의 약관과 개인정보 처리방침의 적용을 받을 수 있습니다.

AI Usage는 provider 사용량을 앱 화면과 로컬 HTTP API 캐시에 표시하기 위해 처리합니다.

### 로컬 HTTP API

AI Usage는 `127.0.0.1:6736`에서 로컬 HTTP API를 제공할 수 있습니다. 이 API는 같은 기기에서 실행 중인 프로그램이 AI Usage의 cached usage 데이터를 읽을 수 있도록 합니다.

이 API는 외부 네트워크 주소에 바인딩하도록 설계되어 있지 않습니다.

### 로그

AI Usage는 문제 해결을 위해 로컬 로그를 생성할 수 있습니다. 로그에는 일반적인 secret redaction 처리가 적용되지만, 사용자가 GitHub issue 등에 로그를 첨부하기 전에 직접 검토해야 합니다.

### 저장 위치와 보관

대부분의 앱 데이터는 사용자의 Windows 기기에 저장됩니다. 예를 들어 설정, 로그, 로컬 캐시, credential 참조는 Windows 사용자 프로필 또는 Windows Credential Manager에 저장될 수 있습니다.

Analytics 이벤트는 앱 품질 확인을 위해 외부 analytics 서비스로 전송될 수 있습니다. AI Usage는 analytics 이벤트에 provider credential 또는 사용자의 코드/프롬프트 내용을 포함하지 않습니다.

### 제3자 서비스

AI Usage는 다음 유형의 제3자 서비스와 통신할 수 있습니다.

- 사용자가 활성화한 AI provider API
- 앱 analytics 서비스
- GitHub Releases 또는 업데이트 확인 endpoint

각 제3자 서비스는 자체 개인정보 처리방침을 적용할 수 있습니다.

### 사용자의 선택

사용자는 다음 방식으로 데이터 처리를 제한할 수 있습니다.

- Settings에서 provider를 비활성화
- provider 앱에서 로그아웃하거나 provider credential 삭제
- Windows Credential Manager에서 관련 credential 삭제
- 앱 설정과 로그 삭제
- 로컬 HTTP API를 사용하지 않음

### 문의

개인정보 또는 보안 관련 문의는 GitHub repository를 통해 남겨 주세요.

- Repository: https://github.com/datell1357/AI-Usage-for-Windows
- Security advisory: https://github.com/datell1357/AI-Usage-for-Windows/security/advisories/new

---

## English

This Privacy Policy applies to the AI Usage Windows app.

AI Usage is a desktop app for checking AI coding subscription usage from the Windows system tray. The app accesses local data on your device and the provider services you are signed into so it can display usage information.

### Information We Process

AI Usage may read or process the following information locally:

- provider sign-in state and usage information
- OAuth access tokens, refresh tokens, ID tokens, or provider credential files
- Windows Credential Manager entries
- SQLite state databases written by provider apps
- app settings: enabled providers, provider order, theme, display mode, auto refresh, global shortcut, and start-on-login preference
- app logs and error information
- local HTTP API cache data

### Provider Credentials

AI Usage may read local credential files, Windows Credential Manager entries, and provider state databases for Claude, Codex, Gemini, Antigravity, Cursor, and other bundled providers.

This information is used on your device to authenticate provider API requests and fetch usage data. The AI Usage project maintainer does not collect or store your provider tokens, refresh tokens, credential files, or account passwords.

Some providers require token refresh. When this happens, AI Usage may write the refreshed access token back to the same local source it read from.

### Analytics

AI Usage may send limited analytics events to help understand app quality and usage. Based on the current code, these events are limited to actions such as:

- app start: `app_started`
- settings changes: theme, display mode, auto refresh, global shortcut, start on login
- provider enabled/disabled changes
- provider reorder actions
- manual provider refresh
- update accepted

Analytics events are designed not to include provider tokens, refresh tokens, credential file contents, user code, prompts, conversation content, or raw provider responses.

### Provider API Requests

To fetch usage data, AI Usage may send requests to the APIs of providers you enable. Those requests may be subject to each provider's own terms and privacy policy.

AI Usage processes provider usage data so it can display it in the app and cache it for the local HTTP API.

### Local HTTP API

AI Usage may provide a local HTTP API on `127.0.0.1:6736`. This API allows programs running on the same device to read cached AI Usage data.

The API is not designed to bind to external network addresses.

### Logs

AI Usage may create local logs for troubleshooting. Common secrets are redacted from logs, but you should review logs yourself before attaching them to a public GitHub issue or sharing them elsewhere.

### Storage and Retention

Most app data is stored on your Windows device. This can include settings, logs, local cache data, and credential references stored under your Windows user profile or in Windows Credential Manager.

Analytics events may be sent to an external analytics service for product quality purposes. AI Usage does not intentionally include provider credentials or your code/prompt content in analytics events.

### Third-Party Services

AI Usage may communicate with these types of third-party services:

- AI provider APIs you enable
- app analytics service
- GitHub Releases or update-check endpoints

Each third-party service may apply its own privacy policy.

### Your Choices

You can limit data processing by:

- disabling providers in Settings
- signing out of provider apps or deleting provider credentials
- deleting related entries from Windows Credential Manager
- deleting app settings and logs
- not using the local HTTP API

### Contact

For privacy or security questions, use the GitHub repository.

- Repository: https://github.com/datell1357/AI-Usage-for-Windows
- Security advisory: https://github.com/datell1357/AI-Usage-for-Windows/security/advisories/new
