# Track all your AI coding subscriptions in one place

See your usage at a glance from the Windows tray. No digging through dashboards.

![AI Usage Screenshot](screenshot.png)

## Download

[**Download the latest Windows release**](https://github.com/datell1357/AI-Usage-for-Windows/releases/latest)

This Windows fork is under active development at [datell1357/AI-Usage-for-Windows](https://github.com/datell1357/AI-Usage-for-Windows). The first Windows build targets Claude and Codex only.

The app auto-updates. Install once and you're set.

## What It Does

AI Usage lives in your Windows tray and shows you how much of your AI coding subscriptions you've used. Progress bars, badges, and clear labels. No mental math required.

- **One glance.** All your AI tools, one panel.
- **Always up-to-date.** Refreshes automatically on a schedule you pick.
- **Global shortcut.** Toggle the panel from anywhere with a customizable keyboard shortcut.
- **Lightweight.** Opens instantly, stays out of your way.
- **Plugin-based.** New providers get added without updating the whole app.
- **[Local HTTP API](docs/local-http-api.md).** Other apps can read your usage data from `127.0.0.1:6736`.
- **[Proxy support](docs/proxy.md).** Route provider HTTP requests through a SOCKS5 or HTTP proxy.

## Supported Providers

Windows first build:

- [**Claude**](docs/providers/claude.md) / session, weekly, peak/off-peak, extra usage, local token usage (ccusage)
- [**Codex**](docs/providers/codex.md) / session, weekly, reviews, credits

Other provider source files remain in the repository, but they are not bundled or enabled in the first Windows build.

Community contributions welcome.

Want a provider that's not listed? [Open an issue.](https://github.com/datell1357/AI-Usage-for-Windows/issues/new)

## Open Source, Community Driven

AI Usage is built by its users. Hundreds of people use it daily, and the project grows through community contributions: new providers, bug fixes, and ideas.

I maintain the project as a guide and quality gatekeeper, but this is your app as much as mine. If something is missing or broken, the best way to get it fixed is to contribute by opening an issue, or submitting a PR.

Plugins are currently bundled as we build our the API, but soon will be made flexible so you can build and load their own.

### How to Contribute

- **Add a provider.** Each one is just a plugin. See the [Plugin API](docs/plugins/api.md).
- **Fix a bug.** PRs welcome. Provide before/after screenshots.
- **Request a feature.** [Open an issue](https://github.com/datell1357/AI-Usage-for-Windows/issues/new) and make your case.

Keep it simple. No feature creep, no AI-generated commit messages, test your changes.

## Credits

AI Usage is based on MIT-licensed upstream source code and keeps the original copyright notice in [LICENSE](LICENSE).

## License

[MIT](LICENSE)

---

<details>
<summary><strong>Build from source</strong></summary>

> **Warning**: The `main` branch may not be stable. It is merged directly without staging, so users are advised to use tagged versions for stable builds. Tagged versions are fully tested while `main` may contain unreleased features.

### Stack

...
