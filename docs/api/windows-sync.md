# Windows Sync Contract for the Free Firebase Model

This document describes the direct Firestore contract for AI Usage for Windows when the project runs on the Firebase Spark plan.

## Authentication

- Windows signs in with Firebase Auth using Google or GitHub.
- Google uses desktop OAuth authorization code + PKCE with a loopback callback on `127.0.0.1`.
- GitHub uses OAuth device flow and requires Device Flow to be enabled in the GitHub OAuth App settings.
- Windows completes Firebase sign-in locally with `signInWithCredential`.
- Android signs in with the same Firebase project.
- The same Firebase account produces the same `uid`.
- No pairing code is used.

Required Windows environment variables for sign-in:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_GOOGLE_DESKTOP_CLIENT_ID`
- `VITE_GITHUB_OAUTH_CLIENT_ID`

Google setup notes:

- Create a Google Cloud OAuth client of type `Desktop app`.
- The Firebase web app config is still required for Firebase initialization, but its web client ID is not used for Windows desktop sign-in.

GitHub setup notes:

- Create a GitHub OAuth App and copy its `client_id`.
- Enable `Device Flow` in the app settings before using Windows sign-in.

## Device identity

Each Windows install owns a stable `deviceId`.

The value may be generated locally and stored by the Windows app, but it must stay stable across launches.

## Device document

Path:

`/users/{uid}/devices/{deviceId}`

Example:

```json
{
  "deviceId": "dev_abc123def456",
  "name": "Home PC",
  "platform": "windows",
  "appName": "AI Usage for Windows",
  "appVersion": "0.2.0",
  "linkedAt": "2026-04-29T12:00:00.000Z",
  "lastSeenAt": "2026-04-29T12:05:00.000Z",
  "syncEnabled": true,
  "revokedAt": null
}
```

## Snapshot document

Path:

`/users/{uid}/devices/{deviceId}/snapshots/latest`

Example:

```json
{
  "schemaVersion": 1,
  "fetchedAt": "2026-04-29T12:05:00.000Z",
  "uploadedAt": "2026-04-29T12:05:05.000Z",
  "source": "ai-usage-windows",
  "providers": [
    {
      "providerId": "codex",
      "displayName": "Codex",
      "status": "ok",
      "fetchedAt": "2026-04-29T12:05:00.000Z",
      "lines": [
        {
          "type": "progress",
          "label": "Session",
          "used": 42,
          "limit": 100,
          "format": { "kind": "percent" },
          "resetsAt": "2026-04-29T15:00:00.000Z"
        }
      ]
    }
  ]
}
```

## Upload rules

Windows must never write:

- provider access tokens
- provider refresh tokens
- API keys
- cookies or sessions
- local file paths
- raw logs
- credential files

## Android assumptions

- Android reads the connected device list from `/users/{uid}/devices`
- Android reads `snapshots/latest` for the selected device
- Android may update `devices/{deviceId}.name`
