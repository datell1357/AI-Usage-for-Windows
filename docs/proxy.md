# Proxy Configuration

AI Usage can route provider and plugin HTTP requests through an optional proxy.

- Supported proxy types: `socks5://`, `http://`, `https://`
- Config file: `~/.ai-usage/config.json`
- Default: off
- UI: none

## Config File

Create `~/.ai-usage/config.json`:

```json
{
  "proxy": {
    "enabled": true,
    "url": "socks5://127.0.0.1:10808"
  }
}
```

You can also use an authenticated proxy URL:

```json
{
  "proxy": {
    "enabled": true,
    "url": "http://user:pass@proxy.example.com:8080"
  }
}
```

## Behavior

- Config is loaded once when the app starts.
- Restart AI Usage after changing the file.
- `localhost`, `127.0.0.1`, and `::1` always bypass the proxy.
- Missing, disabled, invalid, or unreadable config leaves proxying off.
- Proxy credentials are redacted in logs.

## Scope

This applies to provider and plugin HTTP requests that go through AI Usage's built-in HTTP client.

It is not a general Windows system proxy setting and does not automatically proxy unrelated subprocess network traffic.
