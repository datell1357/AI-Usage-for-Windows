(function () {
  const BILLING_URL = "https://console.sakana.ai/billing"
  const FIVE_HOUR_MS = 5 * 60 * 60 * 1000
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000
  const DEFAULT_SESSION_COOKIE_NAME = "__Secure-authjs.session-token"
  const CONFIG_PATHS = ["~/.ai-usage/config.json"]
  // Only the Auth.js session token authenticates the billing GET. The csrf-token
  // (checked on POST only) and callback-url cookies are unnecessary, so they are
  // dropped when a session token can be identified.
  const SESSION_COOKIE_BASES = ["__secure-authjs.session-token", "authjs.session-token"]

  function readString(value) {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  function readEnv(ctx, name) {
    try {
      return readString(ctx.host.env.get(name))
    } catch (e) {
      ctx.host.log.warn(name + " read failed: " + String(e))
      return null
    }
  }

  function pickFirstString(values) {
    for (let i = 0; i < values.length; i += 1) {
      const value = readString(values[i])
      if (value) return value
    }
    return null
  }

  // Reads the credential from the app config file (~/.ai-usage/config.json), the
  // same file used for proxy settings. Supported shapes:
  //   { "sakana": { "sessionToken": "eyJ..." } }
  //   { "sakana": { "cookie": "__Secure-authjs.session-token=eyJ..." } }
  //   { "sakana": { "token": "eyJ..." } }
  //   { "sakanaSessionToken": "eyJ..." }   (flat fallback)
  //   { "sakanaCookie": "..." }            (flat fallback)
  function loadFromConfigFile(ctx) {
    for (let i = 0; i < CONFIG_PATHS.length; i += 1) {
      const path = CONFIG_PATHS[i]
      let text = null
      try {
        if (!ctx.host.fs.exists(path)) continue
        text = ctx.host.fs.readText(path)
      } catch (e) {
        ctx.host.log.warn("config read failed (" + path + "): " + String(e))
        continue
      }

      const config = ctx.util.tryParseJson(text)
      if (!config || typeof config !== "object") continue

      const sakana = config.sakana && typeof config.sakana === "object" ? config.sakana : {}
      const raw = pickFirstString([
        sakana.sessionToken,
        sakana.session_token,
        sakana.token,
        sakana.cookie,
        config.sakanaSessionToken,
        config.sakanaCookie,
      ])
      if (!raw) continue

      const header = parseCookieInput(raw)
      if (header) {
        ctx.host.log.info("cookie header loaded from " + path)
        return header
      }
    }
    return null
  }

  function isSessionCookieName(name) {
    const lower = String(name || "").trim().toLowerCase()
    if (!lower) return false
    return SESSION_COOKIE_BASES.some(function (base) {
      // Match the exact cookie name and Auth.js's chunked variants (`.0`, `.1`, ...).
      return lower === base || lower.indexOf(base + ".") === 0
    })
  }

  function looksLikeBareToken(value) {
    return /^[A-Za-z0-9._~%+/-]{16,}={0,2}$/.test(value)
  }

  function dedupeCookiePairs(pairs) {
    const order = []
    const byName = {}
    for (let i = 0; i < pairs.length; i += 1) {
      const pair = pairs[i]
      if (!Object.prototype.hasOwnProperty.call(byName, pair.name)) order.push(pair.name)
      byName[pair.name] = pair.value
    }
    return order
      .map(function (name) {
        return name + "=" + byName[name]
      })
      .join("; ")
  }

  function parseCookieTableRow(line) {
    if (!/(\t|\s{2,})/.test(line)) return null
    const cols = line
      .split(/\t+|\s{2,}/)
      .map(function (col) {
        return col.trim()
      })
      .filter(Boolean)
    if (cols.length < 2) return null

    const name = cols[0]
    const value = cols[1]
    // Reject normal cookie-header fragments such as `a=b;  c=d`; the first
    // column in a browser Cookies table is always just the cookie name.
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) return null
    if (!value) return null
    return { name: name, value: value }
  }

  // Accepts any of the following and returns a minimal cookie header:
  //   - a full "Cookie: a=b; c=d" header (with or without the leading "Cookie:")
  //   - "a=b; c=d" pairs on one or many lines
  //   - the browser DevTools "Cookies" table paste, where each line is
  //     `name <TAB> value <TAB> domain <TAB> ...` (tab- or multi-space-separated)
  //   - a single bare session-token value
  // When an Auth.js session token is present, only that cookie is kept; the
  // csrf-token and callback-url rows are discarded. Otherwise every parsed pair
  // is preserved.
  function parseCookieInput(raw) {
    const text = readString(raw)
    if (!text) return null

    const pairs = []
    const bareCandidates = []
    const lines = text.split(/[\r\n]+/)

    for (let i = 0; i < lines.length; i += 1) {
      let line = lines[i].trim()
      if (!line) continue

      const headerMatch = line.match(/^(?:set-)?cookie\s*:\s*(.*)$/i)
      if (headerMatch) line = headerMatch[1].trim()
      if (!line) continue

      const tablePair = parseCookieTableRow(line)
      if (tablePair) {
        pairs.push(tablePair)
        continue
      }

      if (looksLikeBareToken(line)) {
        bareCandidates.push(line)
        continue
      }

      if (line.indexOf("=") === -1) continue

      const segments = line.split(";")
      for (let j = 0; j < segments.length; j += 1) {
        const segment = segments[j].trim()
        if (!segment) continue
        const eq = segment.indexOf("=")
        if (eq <= 0) continue
        const name = segment.slice(0, eq).trim()
        const value = segment.slice(eq + 1).trim()
        if (name && value) pairs.push({ name: name, value: value })
      }
    }

    if (pairs.length) {
      const sessionPairs = pairs.filter(function (pair) {
        return isSessionCookieName(pair.name)
      })
      return dedupeCookiePairs(sessionPairs.length ? sessionPairs : pairs)
    }

    if (bareCandidates.length) {
      // The session token is the long value; pick the longest bare candidate.
      let token = bareCandidates[0]
      for (let k = 1; k < bareCandidates.length; k += 1) {
        if (bareCandidates[k].length > token.length) token = bareCandidates[k]
      }
      return DEFAULT_SESSION_COOKIE_NAME + "=" + token
    }

    return null
  }

  function loadCookieHeader(ctx) {
    const token = readEnv(ctx, "SAKANA_SESSION_TOKEN")
    if (token) {
      const header = parseCookieInput(token)
      if (header) {
        ctx.host.log.info("cookie header loaded from SAKANA_SESSION_TOKEN")
        return header
      }
    }

    const cookie = readEnv(ctx, "SAKANA_COOKIE")
    if (cookie) {
      const header = parseCookieInput(cookie)
      if (header) {
        ctx.host.log.info("cookie header loaded from SAKANA_COOKIE")
        return header
      }
    }

    return loadFromConfigFile(ctx)
  }

  function fetchBilling(ctx, cookieHeader) {
    let resp
    try {
      resp = ctx.util.request({
        method: "GET",
        url: BILLING_URL,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          Cookie: cookieHeader,
        },
        timeoutMs: 15000,
      })
    } catch (e) {
      ctx.host.log.error("billing request exception: " + String(e))
      throw "Request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status) || (resp.status >= 300 && resp.status < 400)) {
      throw "Sakana login required. Copy a fresh `__Secure-authjs.session-token` from console.sakana.ai into `~/.ai-usage/config.json`."
    }
    if (resp.status !== 200) {
      throw "Sakana billing fetch failed (HTTP " + resp.status + "). Try again later."
    }
    if (!readString(resp.bodyText)) {
      throw "Could not parse usage data."
    }

    return resp.bodyText
  }

  function stripHtmlComments(text) {
    return String(text || "")
      .replace(/<!--.*?-->/g, "")
      .replace(/\s+/g, " ")
      .trim()
  }

  function stripTags(text) {
    return stripHtmlComments(String(text || "").replace(/<[^>]+>/g, " "))
      .replace(/&amp;/g, "&")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, "\"")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
  }

  function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  function firstMatch(pattern, text, flags) {
    try {
      return new RegExp(pattern, flags || "i").exec(text)
    } catch (e) {
      return null
    }
  }

  function capture(pattern, text, flags) {
    const match = firstMatch(pattern, text, flags)
    if (!match) return null
    return match[1] === undefined ? null : stripHtmlComments(match[1])
  }

  function windowBoundaryOffset(html, offset) {
    const boundary = /<p[^>]*>\s*(?:5-hour|Weekly)\s*<\/p>|<div[^>]*data-slot=(?:"card"|'card'|"card-title"|'card-title')[^>]*>/gi
    boundary.lastIndex = offset
    const match = boundary.exec(html)
    return match ? match.index : html.length
  }

  function windowBody(label, html) {
    const labelPattern = "<p[^>]*>\\s*" + escapeRegex(label) + "\\s*<\\/p>"
    const match = firstMatch(labelPattern, html, "i")
    if (!match) return null
    const start = match.index + match[0].length
    const end = windowBoundaryOffset(html, start)
    const body = html.slice(start, end).trim()
    return body || null
  }

  function parseResetDate(text) {
    const raw = readString(text)
    if (!raw) return null

    const match = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
    if (!match) return null

    const months = {
      january: 0,
      february: 1,
      march: 2,
      april: 3,
      may: 4,
      june: 5,
      july: 6,
      august: 7,
      september: 8,
      october: 9,
      november: 10,
      december: 11,
    }
    const month = months[match[1].toLowerCase()]
    if (month === undefined) return null

    let hour = Number(match[4])
    const minute = Number(match[5])
    const ampm = match[6].toUpperCase()
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
    if (ampm === "AM" && hour === 12) hour = 0
    if (ampm === "PM" && hour !== 12) hour += 12

    const ms = Date.UTC(Number(match[3]), month, Number(match[2]), hour, minute, 0, 0)
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null
  }

  function parseWindow(label, html) {
    const body = windowBody(label, html)
    if (!body) return null

    const percentText = capture("<p[^>]*>\\s*([0-9]+(?:\\.[0-9]+)?)% used\\s*<\\/p>", body, "i")
    const percent = percentText === null ? NaN : Number(percentText)
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw "Invalid " + label + " usage percentage."
    }

    const resetText = capture("<p[^>]*>\\s*Resets on ([^<]+?)\\s*<\\/p>", body, "i")
    return {
      used: percent,
      resetsAt: parseResetDate(resetText),
    }
  }

  function parsePlanName(html) {
    return capture("<div[^>]*data-slot=\\\"card-title\\\"[^>]*>[\\s\\S]*?<span>\\s*([^<]+?)\\s*<\\/span>", html, "i")
  }

  function parsePlanPrice(html) {
    return capture(
      "<div[^>]*data-slot=\\\"card-title\\\"[^>]*>[\\s\\S]*?<span>[^<]+<\\/span>\\s*<span[^>]*>\\s*([^<]+?)\\s*<\\/span>",
      html,
      "i",
    )
  }

  function parseSubscription(html) {
    const heading = firstMatch("<h2[^>]*>\\s*Subscription\\s*<\\/h2>", html, "i")
    if (!heading) return null
    const section = html.slice(heading.index, heading.index + 6000)
    const status = capture("<span[^>]*>\\s*(Active|Trial|Ending|Needs attention|Not subscribed)\\s*<\\/span>", section, "i")
    const plan = capture("<p[^>]*class=\\\"[^\\\"]*text-3xl[^\\\"]*\\\"[^>]*>\\s*([^<]+?)\\s*<\\/p>", section, "i")
    let price = null
    if (plan) {
      const planPattern = "<p[^>]*class=\\\"[^\\\"]*text-3xl[^\\\"]*\\\"[^>]*>\\s*" + escapeRegex(plan) + "\\s*<\\/p>\\s*<p[^>]*>\\s*([^<]+?)\\s*<\\/p>"
      price = capture(planPattern, section, "i")
    }
    const renewal = capture("<p[^>]*>\\s*((?:Renews|Ends) on [^<]+?)\\s*<\\/p>", section, "i")
    const parts = []
    if (status) parts.push(stripTags(status))
    if (plan) parts.push(stripTags(plan))
    if (price) parts.push(stripTags(price))
    return parts.length || renewal
      ? {
          summary: parts.join(" · "),
          plan: plan ? stripTags(plan) : null,
          price: price ? stripTags(price) : null,
          renewal: renewal ? stripTags(renewal) : null,
        }
      : null
  }

  function parseBillingHTML(html) {
    const fiveHour = parseWindow("5-hour", html)
    const weekly = parseWindow("Weekly", html)
    if (!fiveHour && !weekly) {
      throw "Usage limit windows were not found."
    }

    const planParts = []
    const planName = parsePlanName(html)
    const planPrice = parsePlanPrice(html)
    if (planName) planParts.push(planName)
    if (planPrice) planParts.push(planPrice)
    const subscription = parseSubscription(html)

    return {
      plan: subscription && subscription.plan
        ? [subscription.plan, subscription.price].filter(Boolean).join(" ")
        : planParts.length ? planParts.join(" ") : null,
      fiveHour,
      weekly,
      subscription,
    }
  }

  function addProgress(lines, ctx, label, window, periodDurationMs) {
    if (!window) return
    const opts = {
      label,
      used: window.used,
      limit: 100,
      format: { kind: "percent" },
      periodDurationMs,
    }
    if (window.resetsAt) opts.resetsAt = window.resetsAt
    lines.push(ctx.line.progress(opts))
  }

  function probe(ctx) {
    const cookieHeader = loadCookieHeader(ctx)
    if (!cookieHeader) {
      throw "Missing Sakana credentials. Copy your `__Secure-authjs.session-token` from console.sakana.ai into `~/.ai-usage/config.json` under `sakana.sessionToken`."
    }

    let parsed
    try {
      parsed = parseBillingHTML(fetchBilling(ctx, cookieHeader))
    } catch (e) {
      if (typeof e === "string") throw e
      ctx.host.log.error("billing parse failed: " + String(e))
      throw "Could not parse usage data."
    }

    const lines = []
    addProgress(lines, ctx, "5-hour", parsed.fiveHour, FIVE_HOUR_MS)
    addProgress(lines, ctx, "Weekly", parsed.weekly, WEEK_MS)
    if (parsed.subscription && parsed.subscription.summary) {
      lines.push(ctx.line.text({ label: "Subscription", value: parsed.subscription.summary }))
    }
    if (parsed.subscription && parsed.subscription.renewal) {
      lines.push(ctx.line.text({ label: "Renewal", value: parsed.subscription.renewal }))
    }

    return { plan: parsed.plan, lines }
  }

  globalThis.__ai_usage_plugin = { id: "sakana", probe: probe }
})()
