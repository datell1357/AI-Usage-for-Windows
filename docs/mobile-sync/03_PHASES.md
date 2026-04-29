# AI Usage Mobile Sync -- Phase 분리 계획

> 한 번에 다 만들면 복잡해져서 품질이 떨어집니다.
> Phase별로 나눠서 각각 “진짜 동작하는 제품”을 만듭니다.

---

## Phase 1: MVP Pairing + Latest Snapshot (2~3주)

### 목표
모바일 앱에서 로그인하고 6자리 코드로 Windows PC를 연결한 뒤, PC가 Firebase에 latest snapshot을 업로드하고 모바일 앱/위젯이 표시합니다.

Phase 1 provider 범위는 현재 AI Usage for Windows에서 지원하는 Claude, Codex, Gemini, Antigravity, Cursor입니다. GitHub Copilot은 Windows provider 구현이 추가된 뒤 future phase에서 다룹니다.

### 기능
- [ ] Firebase 프로젝트 생성 및 Auth/Firestore/Functions 설정
- [ ] Google/GitHub 로그인 구현
- [ ] 모바일 앱에서 6자리 pairing code 생성
- [ ] Windows Settings > System > Mobile Sync UI 추가
- [ ] PC에서 code 입력 후 device 등록
- [ ] Windows device upload credential을 Windows Credential Manager에 저장
- [ ] PC가 latest snapshot 업로드
- [ ] 모바일 앱에서 latest snapshot 표시
- [ ] iOS WidgetKit / Android Glance 또는 AppWidget에서 cache 표시

### 데이터
- User
- Device
- PairingCode
- UsageSnapshot
- ProviderUsage
- UsageLine

### 인증
- 모바일: Firebase Auth Google/GitHub
- PC: Cloud Functions pairing 검증 후 signed device upload token 또는 custom token

### 버전
- Windows Mobile Sync 최초 지원 버전: `0.2.0`
- Mobile 앱 MVP 버전: `0.1.0`
- Snapshot `schemaVersion`: `1`

### “진짜 제품” 체크리스트
- [ ] 실제 Firebase 프로젝트 연결 (mock Firebase X)
- [ ] 실제 Google/GitHub 로그인
- [ ] 실제 Firestore Rules 적용
- [ ] 실제 Windows 앱 Settings UI에서 code 입력 가능
- [ ] 실제 PC snapshot 업로드
- [ ] Windows `0.2.0` 이상에서만 Mobile Sync를 지원한다고 문서/앱에 표시
- [ ] 실제 iOS/Android 앱에서 Firestore fetch
- [ ] 위젯은 앱 cache에서 실제 latest snapshot 표시
- [ ] Provider credential은 Firebase에 업로드되지 않음

### Phase 1 시작 프롬프트
```
이 PRD를 읽고 Phase 1을 구현해주세요.
@PRD/01_PRD.md
@PRD/02_DATA_MODEL.md
@PRD/04_PROJECT_SPEC.md

Phase 1 범위:
- Firebase Auth/Firestore/Functions 기본 구성
- Google/GitHub 로그인
- 6자리 pairing code 생성/소비
- Windows Mobile Sync Settings UI
- PC latest snapshot uploader
- 모바일 latest snapshot viewer
- iOS/Android 위젯 cache 표시
- Windows provider 범위: Claude, Codex, Gemini, Antigravity, Cursor
- GitHub Copilot은 future provider로 제외

반드시 지켜야 할 것:
- 04_PROJECT_SPEC.md의 “절대 하지 마” 목록 준수
- Provider token/API key/로컬 인증 파일은 절대 업로드하지 않기
- Windows upload credential은 Windows Credential Manager에 저장하기
- Pairing code는 10분 만료 + 1회 사용
- revoked device 업로드 차단
- Firestore Rules/Functions 테스트 포함
- Windows 앱 버전은 Mobile Sync 포함 시 0.2.0 이상, snapshot schemaVersion은 1로 시작
```

---

## Phase 2: Device 관리 + 상태 UX (1~2주)

### 전제 조건
- Phase 1이 실제 Firebase와 실제 Windows 앱에서 동작
- 모바일 앱/위젯이 latest snapshot 표시 가능

### 목표
사용자가 여러 PC를 관리하고 stale/offline/provider error를 명확히 이해할 수 있게 합니다.

### 기능
- [ ] Apple 로그인 추가
- [ ] 다중 PC 목록 및 선택
- [ ] device rename
- [ ] unlink/revoke
- [ ] Fresh/Stale/Offline/Provider Error/Revoked UI
- [ ] provider별 상세 화면
- [ ] Sync now UX 개선 및 마지막 동기화 시각 표시

### 추가 데이터
- Device display settings
- Provider detail cache
- Revocation audit fields

### 통합 테스트
- Phase 1 pairing/upload/viewer가 기존대로 동작하는지 확인
- 여러 device 중 하나만 revoke했을 때 다른 device 업로드가 유지되는지 확인

---

## Phase 3: 보안 강화 + 알림 + 고급 동기화 (2~4주)

### 전제 조건
- Phase 1 + 2가 안정적으로 운영 중

### 목표
실서비스 수준 보안과 편의 기능을 추가합니다.

### 기능
- [ ] device upload token rotation
- [ ] snapshot schema validation 강화
- [ ] end-to-end snapshot encryption
- [ ] push notification: 한도 임박, Provider error, PC offline
- [ ] snapshot history 저장 및 trend view
- [ ] Cloud Functions rate limiting / abuse 방어
- [ ] GitHub Copilot provider 추가 검토 및 Windows 수집 기능 연동

### 주의사항
- end-to-end encryption은 위젯 cache와 keychain/keystore 설계까지 함께 고려해야 합니다.
- notification은 오탐/과다 발송 UX 리스크가 있어 opt-in으로 설계합니다.

---

## Phase 로드맵 요약

| Phase | 핵심 기능 | 상태 |
|-------|----------|------|
| Phase 1 (MVP) | Firebase pairing, PC uploader, mobile viewer, widgets | 시작 전 |
| Phase 2 | 다중 device 관리, revoke, 상태 UX, 상세 화면 | Phase 1 완료 후 |
| Phase 3 | E2E encryption, push, history, token rotation | Phase 2 완료 후 |

---

## 추천 우선순위

1. Firebase 데이터 모델 + pairing flow
2. AI Usage for Windows sync uploader
3. 모바일 앱 latest snapshot viewer
4. iOS/Android 위젯
5. 보안 강화와 다중 device 관리
