# Security Policy

AI Usage reads local provider credentials and usage data. Security reports should be handled privately until a fix is available.

## Supported Versions

Only the latest published Windows release is supported with security fixes.

## Report a Vulnerability

Use GitHub Security Advisories for private reports:

https://github.com/datell1357/AI-Usage-for-Windows/security/advisories/new

If advisories are unavailable, contact the repository owner privately before sharing exploit details. Do not publish tokens, credential files, account identifiers, or proof-of-concept payloads in public issues.

## Include This Information

- Affected AI Usage version
- Windows version
- Provider involved, if any
- Reproduction steps
- Expected and actual behavior
- Impact and required attacker access
- Whether local credentials, logs, installer behavior, or provider HTTP traffic are involved

## In Scope

- AI Usage desktop application code
- Bundled provider plugins
- Local credential discovery, token refresh, and redaction behavior
- Local HTTP API behavior
- Installer, startup, and tray-only behavior
- Release packaging for this repository

## Out of Scope

- Vulnerabilities in third-party provider services
- Social engineering
- Reports that require public disclosure of another user's credentials
- Denial-of-service reports without a concrete security impact

## Response Targets

- Initial acknowledgement: within 48 hours when possible
- Triage result: within 7 days when possible
- Fix timeline: based on severity and release risk
