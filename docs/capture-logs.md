# How to Capture Logs for a Bug Report

Use this when AI Usage is not working and you need to share debug info.

- Audience: non-technical users
- Time: ~2 minutes
- Platform: Windows

## 1) Set log level to Debug

1. Find the AI Usage icon.
   - On Windows, look in the system tray.
2. Right-click it.
3. Open `Debug Level`.
4. Select `Debug`.

If AI Usage does not open at all, skip this step and continue.

## 2) Reproduce the issue once

1. Do the action that fails.
2. Wait for the failure to happen.
3. Stop after 1-2 attempts (enough data, less noise).

## 3) Open the log folder

1. Press `Windows` + `R`.
2. Paste this path:

```text
%APPDATA%\com.datell.aiusage\logs
```

3. Press `Enter`.
4. If that folder does not exist, open AI Usage Settings and use the log path shown by the app, or search `%APPDATA%` for `ai-usage.log`.

## 4) Attach log files to your GitHub issue

1. Attach `ai-usage.log`.
2. If you also see files like `ai-usage.log.1`, attach those too.
3. Drag the files directly into your issue/comment on GitHub.

## 5) Add this context in the same issue comment

Copy/paste and fill:

```text
What I expected:
What happened instead:
When it happened (local time + timezone):
Which provider was affected (Codex / Claude):
AI Usage version:
Operating system (Windows version):
```

## Privacy note

Logs are redacted for common secrets, but still review before sharing in public.

## Optional: switch log level back

After sending logs, set `Debug Level` back to `Error`.
