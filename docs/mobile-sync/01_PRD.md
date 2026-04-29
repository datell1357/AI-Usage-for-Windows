# AI Usage Mobile Sync -- PRD (Product Requirements Document)

> 생성일: 2026-04-29
> 생성 도구: Show Me The PRD (Hermes)
> 기준 설계: 사용자 제공 기초 설계안

---

## 1. 제품 개요

### 한 줄 요약
AI Usage for Windows가 PC에서 Claude, Codex, Gemini, Antigravity, Cursor 사용량을 수집하고, iOS/Android 앱과 위젯이 Firebase를 통해 최신 usage snapshot을 확인하는 모바일 동기화 기능입니다.

### 해결하는 문제
사용자는 AI 도구 구독 사용량을 PC 앱에서는 확인할 수 있지만, 외출 중 모바일이나 홈 화면 위젯에서는 바로 확인하기 어렵습니다. 각 Provider를 모바일에서 직접 인증하면 OAuth, 토큰 보관, Provider별 정책 차이가 커져 구현과 보안 리스크가 커집니다.

### 핵심 가치
- Provider 인증은 기존 PC 앱에만 유지해 보안 리스크를 줄입니다.
- 모바일 앱은 Firebase에 저장된 표시용 snapshot만 읽어 단순하고 안전합니다.
- iOS/Android 위젯으로 Windows 앱이 수집한 Claude, Codex, Gemini, Antigravity, Cursor 사용량을 빠르게 확인합니다.
- GitHub Copilot은 Windows 수집 기능이 추가된 뒤 future provider로 확장합니다.
- 6자리 pairing code로 PC와 모바일 계정을 간단히 연결합니다.

---

## 2. 사용자

### 주요 사용자
- **누구**: Claude, Codex, Gemini, Antigravity, Cursor 등 AI 코딩/LLM 도구를 여러 개 쓰는 사용자
- **상황**: PC 앱에서 사용량은 수집되지만, 모바일 앱/위젯에서도 최신 상태를 보고 싶을 때
- **목표**: Provider별 plan, 사용률, reset time, error state를 모바일에서 빠르게 확인

### 사용자 시나리오
1. 사용자가 모바일 앱에서 Google/GitHub로 로그인합니다.
2. 앱에서 6자리 PC 연결 코드를 발급합니다.
3. Windows 앱 Settings > System > Mobile Sync에서 코드를 입력합니다.
4. PC 앱이 Firebase에 device로 등록되고 usage snapshot을 업로드합니다.
5. 모바일 앱과 위젯이 latest snapshot을 읽어 Provider별 사용량을 표시합니다.

---

## 3. 핵심 기능

| 기능 | 설명 | 우선순위 | 복잡도 |
|------|------|----------|--------|
| Firebase 사용자 로그인 | 모바일에서 Google/GitHub 우선, Apple은 2차로 지원 | P1 (MVP) | 보통 |
| 6자리 PC pairing code | 모바일에서 10분 만료 1회용 코드 발급, PC에서 입력 | P1 (MVP) | 보통 |
| Windows Mobile Sync UI | Settings > System 아래 Link/Sync/Unlink UI 추가 | P1 (MVP) | 간단 |
| Device 등록 | code 검증 후 /users/{uid}/devices/{deviceId} 생성 | P1 (MVP) | 보통 |
| Latest snapshot 업로드 | PC가 Provider 사용량 요약만 Firestore에 업로드 | P1 (MVP) | 보통 |
| 모바일 latest snapshot 표시 | iOS/Android 앱에서 device별 최신 사용량 표시 | P1 (MVP) | 간단 |
| iOS/Android 위젯 | 앱 cache를 기반으로 홈 화면에서 최신 사용량 표시 | P1 (MVP) | 보통 |
| 다중 PC 관리 | Home PC, Office Laptop 선택/rename/revoke | P2 | 보통 |
| stale/offline/provider error UI | 상태별 뱃지와 안내 문구 | P2 | 간단 |
| Push notification | 한도 임박, Provider error 알림 | P2 | 보통 |
| End-to-end snapshot encryption | Firebase 운영자도 snapshot 내용을 볼 수 없게 암호화 | P3 | 복잡 |

---

## 4. Windows 연동 범위

### MVP Provider

Phase 1은 현재 AI Usage for Windows에서 지원하는 provider를 그대로 사용합니다.

```text
Claude, Codex, Gemini, Antigravity, Cursor
```

모바일 앱은 provider별 화면을 하드코딩하지 않고, Windows가 업로드한 `providers[]` 배열을 렌더링합니다. GitHub Copilot은 Windows 수집 기능과 snapshot 매핑이 준비된 뒤 future provider로 추가합니다.

### Windows Sync Version

Mobile Sync는 신규 기능이므로 Windows 앱 버전을 `0.2.0`부터 시작하는 별도 기능 범위로 관리합니다.

| 항목 | 초기 버전 | 의미 |
|------|----------|------|
| Windows 앱 Mobile Sync 지원 | `0.2.0` | Settings > System > Mobile Sync, device credential 저장, snapshot uploader 포함 |
| Mobile 앱 MVP | `0.1.0` | 로그인, pairing code, latest snapshot viewer, widget cache 포함 |
| Snapshot schemaVersion | `1` | Firebase에 업로드되는 snapshot payload 구조 |

앱 버전은 배포/기능 단위로 올리고, `schemaVersion`은 Firebase payload 구조가 바뀔 때만 올립니다. provider가 추가되더라도 payload shape가 같으면 `schemaVersion`은 유지합니다.

---

## 5. 사용자 흐름 (User Flow)

### 핵심 흐름
```
모바일 로그인 -> PC 연결 코드 발급 -> Windows 앱에 코드 입력 -> Firebase device 등록 -> PC snapshot 업로드 -> 모바일/위젯 표시
```

### 상세 흐름
1. **모바일 로그인**: Continue with Google / Apple / GitHub 중 하나로 로그인합니다. MVP는 Google/GitHub 우선입니다.
2. **코드 발급**: No PC linked 화면에서 Generate PC Link Code를 누르면 6자리 코드와 10분 타이머를 보여줍니다.
3. **PC 연결**: Windows Settings > System > Mobile Sync에서 Link Mobile App을 누르고 6자리 코드를 입력합니다.
4. **검증/등록**: Cloud Functions가 code를 검증하고 PC device를 사용자 uid 아래 등록합니다.
5. **업로드**: PC 앱이 앱 시작, refresh 성공, Sync now, 주기적 interval, 종료 전 best-effort 시점에 snapshot을 업로드합니다.
6. **표시**: 모바일 앱은 Firestore latest snapshot을 fetch하고 cache에 저장합니다. 위젯은 cache를 표시합니다.

---

## 6. 상태 정의

| 상태 | 기준 | 사용자 표시 |
|------|------|-------------|
| Not Linked | 연결된 device 없음 | “No PC linked” + Generate PC Link Code |
| Fresh | uploadedAt 또는 fetchedAt이 최근 15분 이내 | 정상 표시 |
| Stale | 15분 이상 업데이트 없음 | “업데이트가 늦어요” |
| Offline | 24시간 이상 PC 업데이트 없음 | “PC가 오랫동안 동기화되지 않았어요” |
| Provider Error | 특정 provider status가 error | 해당 provider 카드에 오류 표시 |
| Revoked | device revokedAt 존재 또는 syncEnabled=false | 업로드/표시 중지 |

---

## 7. 성공 기준

- [ ] 모바일 앱에서 Google/GitHub 로그인 후 uid가 생성됩니다.
- [ ] 모바일 앱에서 6자리 pairing code를 발급하고 10분 후 만료됩니다.
- [ ] PC 앱에서 code 입력 시 device가 /users/{uid}/devices/{deviceId}에 등록됩니다.
- [ ] PC 앱이 Provider credential 없이 표시용 latest snapshot만 Firestore에 업로드합니다.
- [ ] Windows `0.2.0` 이상에서 device upload credential이 Windows Credential Manager에 저장됩니다.
- [ ] 모바일 앱이 `schemaVersion: 1` snapshot을 provider 하드코딩 없이 렌더링합니다.
- [ ] 모바일 앱이 latest snapshot을 3초 이내에 표시합니다.
- [ ] iOS/Android 위젯이 앱 cache 기반으로 latest snapshot을 표시합니다.
- [ ] revoked device는 더 이상 snapshot 업로드가 불가능합니다.
- [ ] Firestore Rules/Cloud Functions 테스트가 자기 uid 외 접근을 차단합니다.

---

## 8. 안 만드는 것 (Out of Scope)

> 이 목록에 있는 건 Phase 1에서 만들지 않습니다.
> AI에게 코드를 시킬 때 이 목록을 함께 공유하세요.

- Apple 로그인 -- 이유: iOS 배포 전 필수에 가깝지만 MVP 검증은 Google/GitHub로 충분합니다.
- GitHub Copilot provider -- 이유: 현재 Windows 앱의 지원 provider와 맞춘 뒤, Windows 수집 기능이 추가되면 future provider로 확장합니다.
- Provider별 모바일 직접 로그인 -- 이유: 이 설계의 핵심은 Provider credential을 PC에만 보관하는 것입니다.
- Provider access token/refresh token/API key 동기화 -- 이유: Firebase에는 표시용 snapshot만 저장합니다.
- end-to-end snapshot encryption -- 이유: 보안 강화로 중요하지만 pairing/upload 흐름 검증 후 진행합니다.
- push notification -- 이유: latest snapshot viewer와 widget이 먼저입니다.
- 복잡한 device 권한 공유/가족 계정 -- 이유: 개인 uid 기반 sync를 먼저 안정화합니다.

---

## 9. [NEEDS CLARIFICATION]

> 아직 결정되지 않은 사항. 개발 전에 정해야 합니다.

- [ ] Firebase 프로젝트를 새로 만들지, 기존 AI Usage 프로젝트에 붙일지 결정
- [ ] PC device upload 인증을 custom auth token 방식으로 할지, signed device upload token + Cloud Functions endpoint 방식으로 할지 결정
- [ ] deviceId 생성 규칙: PC 로컬 stable id 기반인지 Firebase가 생성하는 random id인지 결정
- [ ] 위젯에 표시할 기본 provider 수: 4개 모두 표시 vs Top 2/문제 있는 provider 우선 표시
- [ ] Windows 앱 `0.2.0` Mobile Sync 설정 화면과 uploader 구현 위치 확정
