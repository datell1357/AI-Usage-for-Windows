# Grok

Tracks xAI Grok usage from the Grok web usage pool.

## Data source

- **Page:** `https://grok.com/?_s=usage`
- **Billing:** `https://grok.com/?_s=billing`
- **Pricing:** `https://x.ai/pricing`
- **Usage endpoint:** `POST https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig`
- **Plan endpoint:** `GET https://grok.com/rest/subscriptions`
- **Protocols:** gRPC-Web protobuf and JSON
- **Auth:** grok.com browser cookies

The usage response contains a shared usage pool and per-product rows. AI Usage shows the shared pool and the `GROK_BUILD` product row. The subscription response supplies the plan shown in the provider header.

## Plans

The plan endpoint can return Grok and X subscription tiers. AI Usage uses these labels:

| Subscription tier | Display label |
|---|---|
| No active subscription | `Free` |
| `SUBSCRIPTION_TIER_X_BASIC` | `X Basic` |
| `SUBSCRIPTION_TIER_X_PREMIUM` | `X Premium` |
| `SUBSCRIPTION_TIER_X_PREMIUM_PLUS` | `X Premium+` |
| `SUBSCRIPTION_TIER_SUPER_GROK_LITE` | `SuperGrok Lite` |
| `SUBSCRIPTION_TIER_GROK_PRO` | `SuperGrok` |
| `SUBSCRIPTION_TIER_SUPER_GROK_PRO` | `SuperGrok Heavy` |

When several subscriptions are active, the provider shows the highest tier. Usage remains available when the plan endpoint is temporarily unavailable.

## Setup

1. Sign in at `https://grok.com/?_s=usage` in a browser.
2. Open DevTools → Application or Storage → Cookies → `https://grok.com`.
3. Copy the Cookies table rows for grok.com.
4. Add the paste to `~/.ai-usage/config.json`:

```json
{
  "grok": {
    "cookie": "sso=...; sso-rw=...; cf_clearance=...; grok_device_id=...; x-userid=..."
  }
}
```

AI Usage keeps the Grok auth, Cloudflare, device, and user cookies from a DevTools Cookies table paste. Stripe, Mixpanel, consent, and locale cookies are dropped.

Environment variable setup is also supported:

```powershell
[Environment]::SetEnvironmentVariable('GROK_COOKIE', 'name=value; another=value', 'User')
```

Config file setup is usually easier for a tray app launched from the Start menu.

## Lines

| Line | Source field | Scope |
|---|---|---|
| `Usage pool` | `config.creditUsagePercent` | Overview |
| `Grok Build` | `config.productUsage[]` where product is `GROK_BUILD` | Overview |
| `Period` | `config.currentPeriod` | Detail |

## Errors

| Error | Meaning |
|---|---|
| `Missing Grok credentials` | No cookie was found in `~/.ai-usage/config.json` or `GROK_COOKIE`. |
| `Grok login required` | The cookie expired or is missing the values required by grok.com. |
| `Grok usage fetch failed` | The usage endpoint returned an HTTP or gRPC error. |
| `Could not parse usage data` | The endpoint response shape changed or the binary frame was incomplete. |
