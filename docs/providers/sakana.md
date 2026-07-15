# Sakana AI

Tracks Sakana AI Fugu usage from the Sakana AI console billing page.

## Get your session token

The billing page is authenticated by a single cookie, `__Secure-authjs.session-token`. You only need that value.

1. Sign in at `https://console.sakana.ai/billing` in a browser.
2. Open DevTools (F12) → Application (or Storage) → Cookies → `https://console.sakana.ai`.
3. Copy the **Value** of `__Secure-authjs.session-token`.

## Setup (recommended: config file)

Add the token to AI Usage's config file at `~/.ai-usage/config.json` (on Windows: `C:\Users\<you>\.ai-usage\config.json`). Create the file if it does not exist:

```json
{
  "sakana": {
    "sessionToken": "eyJhbGci...your token..."
  }
}
```

Then restart AI Usage and enable the Sakana AI provider in settings.

This is the same config file used for proxy settings, so both can live together:

```json
{
  "proxy": { "enabled": false, "url": "" },
  "sakana": {
    "sessionToken": "eyJhbGci...your token..."
  }
}
```

Accepted keys under `sakana` (first non-empty wins): `sessionToken`, `token`, `cookie`. A full cookie string works for `cookie`; AI Usage extracts the session token and drops the rest.

## Alternative: environment variables

If you prefer environment variables, set either of these (they take precedence over the config file):

- `SAKANA_SESSION_TOKEN` — the `__Secure-authjs.session-token` value.
- `SAKANA_COOKIE` — accepts a full `Cookie:` header, `a=b; c=d` pairs, or a DevTools **Cookies table** paste; AI Usage extracts the session token.

PowerShell example:

```powershell
[Environment]::SetEnvironmentVariable('SAKANA_SESSION_TOKEN', 'eyJhbGci...', 'User')
```

AI Usage reads these variables from the process environment or the persisted Windows user/machine environment. A temporary shell variable is usually unavailable to a tray app launched from the Start menu.

## Credential resolution order

1. `SAKANA_SESSION_TOKEN` (environment)
2. `SAKANA_COOKIE` (environment)
3. `~/.ai-usage/config.json` → `sakana.sessionToken` / `sakana.token` / `sakana.cookie`

## Data source

- **URL:** `https://console.sakana.ai/billing`
- **Auth:** the `__Secure-authjs.session-token` cookie
- **5-hour usage:** parses the `5-hour` quota card percentage and reset timestamp
- **Weekly usage:** parses the `Weekly` quota card percentage and reset timestamp
- **Subscription:** parses status, plan, monthly price, and renewal date
- **Reset timezone:** server-rendered reset timestamps are interpreted as UTC

The Sakana public API supports Fugu chat and model requests. AI Usage reads quota windows and subscription details from the console billing page.

## Lines

| Line | Source | Scope |
|---|---|---|
| `5-hour` | Five-hour quota card | Overview |
| `Weekly` | Weekly quota card | Overview |
| `Subscription` | Status, plan, and monthly price | Detail |
| `Renewal` | Subscription renewal or end date | Detail |

## Errors

| Error | Meaning |
|-------|---------|
| `Missing Sakana credentials` | No token was found in the environment or `~/.ai-usage/config.json`. |
| `Sakana login required` | The session token expired or the request was redirected. Copy a fresh token. |
| `Sakana billing fetch failed` | The billing page returned a non-200 response. |
| `Could not parse usage data` | The billing page markup is missing supported quota rows. |
