# AI Usage Mobile Sync -- 데이터 모델

> 이 문서는 앱에서 다루는 핵심 데이터의 구조를 정의합니다.
> 개발자가 아니어도 이해할 수 있는 “개념적 ERD”입니다.

---

## 전체 구조

```
[Firebase Auth User]
        |
        | uid
        v
[User Profile] --1:N--> [Device]
        |                   |
        |                   | latest
        |                   v
        |              [Usage Snapshot] --1:N--> [Provider Usage] --1:N--> [Usage Line]
        |
        └--1:N--> [Pairing Code] --consumed by--> [Windows Device]
```

---

## Firestore 경로

```
/users/{uid}
/users/{uid}/devices/{deviceId}
/users/{uid}/devices/{deviceId}/snapshots/latest
/pairingCodes/{code}
```

---

## 엔티티 상세

### User
모바일 앱에 로그인한 사용자입니다. Firebase Auth의 uid가 기준입니다.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| uid | Firebase Auth 사용자 식별자 | firebase_uid_123 | O |
| createdAt | 최초 생성 시간 | 2026-04-29T10:00:00Z | O |
| displayName | 소셜 로그인 표시 이름 | Min | X |
| email | 로그인 이메일 | user@example.com | X |
| authProviders | 연결된 로그인 방식 | ["google.com", "github.com"] | O |

### Device
사용자 계정에 연결된 Windows PC입니다.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| deviceId | device 식별자 | dev_home_pc_abc123 | O |
| name | 사용자가 보는 PC 이름 | Home PC | O |
| platform | 기기 플랫폼 | windows | O |
| appName | 업로드하는 앱 이름 | AI Usage for Windows | O |
| appVersion | PC 앱 버전 | 0.2.0 | O |
| syncProtocolVersion | Windows Mobile Sync protocol 버전 | 1 | O |
| linkedAt | 연결 완료 시간 | 2026-04-29T10:04:00Z | O |
| lastSeenAt | 마지막 업로드/heartbeat 시간 | 2026-04-29T10:12:00Z | O |
| syncEnabled | 동기화 허용 여부 | true | O |
| revokedAt | 연결 해제 시간 | null | X |

### Usage Snapshot
특정 device의 최신 사용량 표시 데이터입니다. Provider credential은 절대 포함하지 않습니다.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| fetchedAt | PC가 provider 사용량을 가져온 시간 | 2026-04-29T10:00:00Z | O |
| uploadedAt | Firebase에 올린 시간 | 2026-04-29T10:00:05Z | O |
| source | 업로드 소스 | ai-usage-windows | O |
| schemaVersion | snapshot schema 버전 | 1 | O |
| minMobileSchemaVersion | 모바일 앱이 이해해야 하는 최소 schema 버전 | 1 | X |
| providers | provider별 사용량 배열 | see below | O |

### Provider Usage
Windows 앱이 업로드한 provider별 요약 정보입니다. Phase 1 provider는 Claude, Codex, Gemini, Antigravity, Cursor입니다. GitHub Copilot은 future provider입니다.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| providerId | provider 고정 id | codex | O |
| displayName | 화면 표시 이름 | Codex | O |
| plan | 구독 plan 이름 | Pro 10x | X |
| status | 수집 상태 | ok / error / unknown | O |
| lines | 표시 줄 목록 | Session 42/100 | O |
| fetchedAt | 해당 provider 수집 시간 | 2026-04-29T10:00:00Z | O |
| errorCode | 오류 코드 | auth_expired | X |
| errorMessage | 사용자용 오류 메시지 | PC에서 다시 로그인 필요 | X |

Phase 1에서 허용하는 `providerId`는 다음과 같습니다.

```text
claude, codex, gemini, antigravity, cursor
```

모바일 앱은 이 목록을 화면에 하드코딩하지 않고 `providers[]`에 포함된 순서와 값을 렌더링합니다. future provider가 추가되어도 payload shape가 동일하면 `schemaVersion`은 유지할 수 있습니다.

### Usage Line
Provider 카드 안에서 하나의 진행률/잔여량을 나타냅니다.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| type | 표시 종류 | progress | O |
| label | 표시 라벨 | Session | O |
| used | 사용량 | 42 | X |
| limit | 한도 | 100 | X |
| remaining | 잔여량 | 58 | X |
| format.kind | 표시 방식 | percent / count / time / text | O |
| resetsAt | reset 시간 | 2026-04-29T15:00:00Z | X |

### Pairing Code
모바일에서 발급하고 PC가 1회 사용하는 연결 코드입니다.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| code | 6자리 숫자 코드, 문서 id | 482193 | O |
| uid | 코드를 만든 사용자 uid | firebase_uid_123 | O |
| createdAt | 발급 시간 | 2026-04-29T10:00:00Z | O |
| expiresAt | 만료 시간 | 2026-04-29T10:10:00Z | O |
| consumedAt | 사용 완료 시간 | null | X |
| consumedByDeviceId | 사용한 device id | dev_home_pc_abc123 | X |

---

## Snapshot JSON 예시

```json
{
  "providerId": "codex",
  "displayName": "Codex",
  "plan": "Pro 10x",
  "status": "ok",
  "lines": [
    {
      "type": "progress",
      "label": "Session",
      "used": 42,
      "limit": 100,
      "format": { "kind": "percent" },
      "resetsAt": "2026-04-29T15:00:00Z"
    }
  ],
  "fetchedAt": "2026-04-29T10:00:00Z"
}
```

---

## 쓰기/읽기 책임

| 데이터 | 생성/수정 주체 | 읽기 주체 | 권장 보호 방식 |
|--------|----------------|-----------|----------------|
| /users/{uid} | 모바일 앱 / Cloud Functions | 해당 사용자 모바일 앱 | request.auth.uid == uid |
| /devices/{deviceId} | Cloud Functions, PC uploader | 해당 사용자 모바일 앱 | uid 일치 + device token 검증 |
| /snapshots/latest | PC uploader via Cloud Functions | 모바일 앱/위젯 cache | schema validation + revoked 체크 |
| /pairingCodes/{code} | 모바일 앱 or Cloud Functions | Cloud Functions | 직접 read 제한, 10분 TTL, 1회 사용 |

---

## 왜 이 구조인가

- 사용자 데이터는 `/users/{uid}` 아래로 모아 Firestore Rules의 uid 기반 접근 제어가 단순합니다.
- device와 latest snapshot을 분리해 다중 PC 확장을 쉽게 합니다.
- snapshot은 최신 표시 목적이므로 `latest` 문서를 우선 사용하고, 히스토리는 MVP 이후 별도 컬렉션으로 확장 가능합니다.
- Firebase 공식 문서 패턴처럼 `request.auth.uid` 일치, 필드 불변성, schema validation을 Rules/Functions에 적용합니다.
- PC 업로드는 모바일 사용자 권한과 다르므로 Cloud Functions에서 pairing/device token을 검증하는 방향이 더 안전합니다.

---

## 업로드 금지 데이터

- Provider access token
- Provider refresh token
- API key
- 로컬 파일 경로
- 로그 원문
- 사용자 인증 파일 내용
- Provider 쿠키/session 파일

---

## 버전 관리

| 버전 항목 | 초기값 | 변경 기준 |
|----------|--------|----------|
| Windows appVersion | `0.2.0` | Mobile Sync 기능이 포함된 Windows 앱 배포 버전 |
| Mobile appVersion | `0.1.0` | 모바일 앱/위젯 MVP 배포 버전 |
| syncProtocolVersion | `1` | pairing, upload token, upload endpoint contract가 깨지는 방식으로 바뀔 때 |
| snapshot schemaVersion | `1` | `/snapshots/latest` payload 구조가 깨지는 방식으로 바뀔 때 |

Provider 추가만으로 payload shape가 바뀌지 않는 경우 `schemaVersion`을 올리지 않습니다. 반대로 필수 필드 추가, 필드 의미 변경, `lines[]` 구조 변경은 `schemaVersion` 증가와 모바일 fallback 설계를 요구합니다.

---

## [NEEDS CLARIFICATION]

- [ ] pairingCodes를 모바일 클라이언트가 직접 write할지, callable function으로만 생성할지 결정
- [ ] PC uploader 인증: Firebase custom auth token vs signed device token + HTTPS function 결정
- [ ] snapshot history 저장 여부와 보존 기간 결정
- [ ] provider errorCode 표준 목록 정의
