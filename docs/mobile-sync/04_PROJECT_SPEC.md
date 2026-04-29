# AI Usage Mobile Sync -- 프로젝트 스펙

> AI가 코드를 짤 때 지켜야 할 규칙과 절대 하면 안 되는 것.
> 이 문서를 AI에게 항상 함께 공유하세요.

---

## 기술 스택

| 영역 | 선택 | 이유 |
|------|------|------|
| 인증/사용자 식별 | Firebase Auth | 모바일 Google/GitHub/Apple 로그인과 uid 기반 접근 제어가 단순합니다. Firebase 공식 문서도 custom token sign-in과 auth.uid 기반 rules 패턴을 제공합니다. |
| 데이터 저장 | Cloud Firestore | `/users/{uid}/devices/{deviceId}/snapshots/latest` 같은 user-owned document 구조에 적합하고 모바일 SDK 지원이 좋습니다. |
| 서버 검증 | Cloud Functions for Firebase | pairing code 소비, device token 발급, revoked 체크, snapshot schema validation을 클라이언트 밖에서 처리합니다. |
| iOS 앱 | SwiftUI + Firebase Auth + Firestore + Keychain | 네이티브 UI, Firebase 모바일 SDK, 민감한 device/cache metadata 보관에 적합합니다. |
| iOS 위젯 | WidgetKit + App Group cache | 위젯은 네트워크 직접 fetch보다 앱이 저장한 공유 cache 표시가 안정적입니다. |
| Android 앱 | Kotlin + Jetpack Compose + Firebase Auth + Firestore + Android Keystore | 네이티브 UI와 Firebase SDK, 안전한 로컬 저장에 적합합니다. |
| Android 위젯 | WorkManager + Glance Widget 또는 AppWidget | WorkManager로 latest snapshot을 주기적으로 cache하고 위젯은 cache를 표시합니다. |
| Windows 앱 | 기존 AI Usage for Windows 설정 화면 + Firebase/HTTPS uploader | 기존 Provider 수집 능력을 그대로 사용하고 모바일 직접 Provider 인증을 피합니다. |

---

## 아키텍처

```
AI Usage for Windows
  ├─ Provider collectors: Claude / Codex / Gemini / Antigravity / Cursor
  ├─ Settings > System > Mobile Sync
  └─ Firebase Sync Uploader
          |
          v
Firebase Auth + Firestore + Cloud Functions
          |
          +--> iOS App -> App Group cache -> WidgetKit
          |
          +--> Android App -> local cache -> Glance/AppWidget
```

---

## Firebase Rules 방향

### 기본 Rules

```rules
match /users/{userId}/{document=**} {
  allow read, write: if request.auth != null
                     && request.auth.uid == userId;
}
```

### 더 안전한 방향

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return signedIn() && request.auth.uid == userId;
    }

    match /users/{userId} {
      allow read, create, update: if isOwner(userId);
      allow delete: if false;

      match /devices/{deviceId} {
        allow read: if isOwner(userId);
        allow create, update, delete: if false; // Cloud Functions only

        match /snapshots/{snapshotId} {
          allow read: if isOwner(userId);
          allow write: if false; // PC upload via Cloud Functions only
        }
      }
    }

    match /pairingCodes/{code} {
      allow read: if false;
      allow write: if false; // create/consume via Cloud Functions only
    }
  }
}
```

근거: Firebase 공식 문서 패턴은 `request.auth != null`, `request.auth.uid` 일치, 필드 검증, delete 제한을 보안 규칙에 넣는 방식입니다. PC 업로드는 사용자 모바일 세션과 다른 신뢰 경계라 Cloud Functions에서 검증하는 편이 안전합니다.

---

## Cloud Functions API 초안

### createPairingCode

입력:
```json
{ "deviceNameHint": "Home PC" }
```

동작:
- Firebase Auth 사용자만 호출 가능
- 6자리 numeric code 생성
- collision 방지
- `/pairingCodes/{code}` 생성
- expiresAt = now + 10분

출력:
```json
{ "code": "482193", "expiresAt": "2026-04-29T10:10:00Z" }
```

### consumePairingCode

입력:
```json
{
  "code": "482193",
  "deviceName": "Home PC",
  "platform": "windows",
  "appVersion": "0.2.0",
  "syncProtocolVersion": 1
}
```

동작:
- code 존재/만료/미사용 검증
- `/users/{uid}/devices/{deviceId}` 생성
- consumedAt 기록
- PC uploader용 device credential 발급

출력:
```json
{
  "deviceId": "dev_home_pc_abc123",
  "uploadToken": "opaque_or_custom_token",
  "uid": "firebase_uid_123",
  "syncProtocolVersion": 1
}
```

Windows는 `uploadToken`을 Windows Credential Manager에 저장합니다. 설정 파일, 로그, Firestore 문서에는 저장하지 않습니다.

### uploadLatestSnapshot

입력:
```json
{
  "deviceId": "dev_home_pc_abc123",
  "snapshot": { "schemaVersion": 1, "providers": [] }
}
```

동작:
- device token/custom auth 검증
- revokedAt == null, syncEnabled == true 확인
- snapshot schema validation
- 금지 필드(token, path, raw log 등) 존재 시 reject
- `/snapshots/latest` upsert
- device.lastSeenAt update

---

## Provider 및 버전 관리

Phase 1에서 허용하는 provider id는 다음과 같습니다.

```text
claude, codex, gemini, antigravity, cursor
```

모바일 앱은 이 목록을 화면에 하드코딩하지 않고 snapshot의 `providers[]`를 렌더링합니다. GitHub Copilot은 future provider입니다.

| 항목 | 초기 버전 | 기준 |
|------|----------|------|
| Windows Mobile Sync | `0.2.0` | Settings > System > Mobile Sync, upload credential 저장, snapshot uploader 포함 |
| Mobile 앱 MVP | `0.1.0` | 로그인, pairing code, latest snapshot viewer, widget cache 포함 |
| syncProtocolVersion | `1` | Cloud Functions pairing/upload contract |
| snapshot schemaVersion | `1` | Firestore latest snapshot payload |

앱 버전은 제품 기능과 배포 단위를 추적합니다. `schemaVersion`은 Firebase payload 구조 호환성을 추적합니다. provider 추가만으로 payload shape가 바뀌지 않으면 `schemaVersion`을 올리지 않습니다. 필수 필드 추가, 필드 의미 변경, `lines[]` 구조 변경은 `schemaVersion` 증가와 모바일 fallback을 요구합니다.

---

## Windows 앱 UX

위치:
```
Settings
→ System
→ Start on Login
→ Mobile Sync
```

연결 전:
```
Mobile Sync
[ Link Mobile App ]

Open the mobile app and enter the 6-digit code here.
[ 482 193 ]
[ Link ]
```

연결 후:
```
Mobile Sync
Connected as: Home PC
Last sync: 2 min ago
[ Sync now ]
[ Unlink ]
```

동기화 시점:
- 앱 시작 후
- provider refresh 성공 후
- 사용자가 Sync now 클릭
- 주기적 자동 동기화: 기본 5~15분
- 종료 전 best-effort 업로드

---

## 모바일 앱 UX

초기 화면:
```
Continue with Google
Continue with Apple
Continue with GitHub
```

로그인 후, 연결 없음:
```
No PC linked
[ Generate PC Link Code ]
```

코드 발급 후:
```
Your PC link code
482 193
Expires in 10:00
```

연결 완료 후:
```
Devices
- Home PC
- Office Laptop

Usage
- Claude
- Codex
- Gemini
- Antigravity
- Cursor
```

---

## 절대 하지 마 (DO NOT)

> AI에게 코드를 시킬 때 이 목록을 반드시 함께 공유하세요.

- [ ] Provider access token, refresh token, API key를 Firebase에 업로드하지 마
- [ ] 로컬 파일 경로, 로그 원문, 인증 파일 내용을 snapshot에 넣지 마
- [ ] Pairing code를 10분 이상 유효하게 두지 마
- [ ] Pairing code를 2회 이상 사용할 수 있게 만들지 마
- [ ] revokedAt이 있는 device의 업로드를 허용하지 마
- [ ] 모바일 앱에서 Claude/Codex/Gemini/Antigravity/Cursor Provider에 직접 로그인시키지 마
- [ ] Firestore 클라이언트에서 `/pairingCodes`를 직접 read 가능하게 만들지 마
- [ ] 위젯에서 민감정보를 직접 네트워크 fetch하거나 로그로 출력하지 마
- [ ] mock 데이터만으로 “완성”이라고 하지 마

---

## 항상 해 (ALWAYS DO)

- [ ] 변경하기 전에 data path와 auth boundary를 먼저 확인
- [ ] 모든 Firebase write에는 uid/device ownership 검증
- [ ] snapshot schema validation 추가
- [ ] 오류 메시지는 사용자용 메시지와 개발자 로그를 분리
- [ ] 모바일/위젯 cache에는 표시용 데이터만 저장
- [ ] Rules/Functions emulator 테스트 추가
- [ ] Provider별 status가 error여도 다른 provider 표시를 유지
- [ ] time comparison은 server timestamp 기준으로 설계

---

## 테스트 방법

```bash
# Firebase Functions 테스트 예시
npm test
npm run lint
firebase emulators:start

# iOS
xcodebuild test -scheme AIUsageMobile -destination 'platform=iOS Simulator,name=iPhone 15'

# Android
./gradlew test
./gradlew connectedAndroidTest

# Windows 앱은 기존 프로젝트 명령 확인 필요
# 예: npm test / cargo test / dotnet test 중 실제 스택에 맞춤
```

---

## 배포 방법

1. Firebase 프로젝트 생성
2. Auth Provider 활성화: Google, GitHub, Apple(Phase 2)
3. Firestore database 생성
4. Cloud Functions 배포
5. Firestore Rules 배포
6. iOS Firebase plist / Android google-services.json 연결
7. Windows 앱에 Firebase endpoint/config 주입
8. TestFlight / Play Internal Testing / Windows installer beta 배포

---

## 환경변수/시크릿

| 변수명 | 설명 | 어디서 발급 |
|--------|------|------------|
| FIREBASE_PROJECT_ID | Firebase 프로젝트 id | Firebase Console |
| FIREBASE_CLIENT_EMAIL | Admin SDK service account | Google Cloud IAM |
| FIREBASE_PRIVATE_KEY | Admin SDK private key | Google Cloud IAM |
| GITHUB_AUTH_CLIENT_ID | GitHub 로그인 client id | GitHub OAuth Apps |
| GITHUB_AUTH_CLIENT_SECRET | GitHub 로그인 secret | GitHub OAuth Apps / Firebase Auth 설정 |
| APPLE_SERVICE_ID | Apple 로그인 service id | Apple Developer |

> client secret과 private key는 앱 번들에 넣지 않습니다. Functions/CI secret manager에만 저장합니다.

---

## [NEEDS CLARIFICATION]

- [ ] Windows 앱의 실제 기술 스택과 Settings UI 파일 위치
- [ ] Firebase project/organization 이름
- [ ] GitHub 로그인 OAuth 앱을 신규 생성할지 기존 앱 사용할지
- [ ] GitHub Copilot provider 추가 시점과 Windows 수집 방식
- [ ] Android 위젯을 Glance로 갈지 AppWidget으로 갈지 최종 결정
