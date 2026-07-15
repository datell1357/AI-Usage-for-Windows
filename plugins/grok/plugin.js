(function () {
  const USAGE_URL = "https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig"
  const SUBSCRIPTIONS_URL = "https://grok.com/rest/subscriptions"
  const CONFIG_PATHS = ["~/.ai-usage/config.json"]
  const PRODUCT_GROK_BUILD = 2
  const USAGE_PERIOD_MONTHLY = 1
  const USAGE_PERIOD_WEEKLY = 2
  const COOKIE_ALLOWLIST = {
    "__cf_bm": true,
    "cf_clearance": true,
    "grok_device_id": true,
    "sso": true,
    "sso-rw": true,
    "x-userid": true,
  }
  const PLAN_TIERS = {
    SUBSCRIPTION_TIER_INVALID: { label: "Free", rank: 0 },
    SUBSCRIPTION_TIER_X_BASIC: { label: "X Basic", rank: 1 },
    SUBSCRIPTION_TIER_X_PREMIUM: { label: "X Premium", rank: 2 },
    SUBSCRIPTION_TIER_X_PREMIUM_PLUS: { label: "X Premium+", rank: 3 },
    SUBSCRIPTION_TIER_SUPER_GROK_LITE: { label: "SuperGrok Lite", rank: 4 },
    SUBSCRIPTION_TIER_GROK_PRO: { label: "SuperGrok", rank: 5 },
    SUBSCRIPTION_TIER_SUPER_GROK_PRO: { label: "SuperGrok Heavy", rank: 6 },
  }

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

  function readConfigValue(ctx) {
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
      const grok = config.grok && typeof config.grok === "object" ? config.grok : {}
      const raw = readString(grok.cookie) || readString(config.grokCookie)
      if (raw) return raw
    }
    return null
  }

  function parseCookieInput(raw) {
    const text = readString(raw)
    if (!text) return null
    const pairs = []
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
    if (!pairs.length) return null
    const selected = pairs.filter(function (pair) {
      return COOKIE_ALLOWLIST[String(pair.name || "").toLowerCase()]
    })
    return dedupeCookiePairs(selected.length ? selected : pairs)
  }

  function parseCookieTableRow(line) {
    if (!/(\t|\s{2,})/.test(line)) return null
    const cols = line
      .split(/\t+|\s{2,}/)
      .map(function (col) { return col.trim() })
      .filter(Boolean)
    if (cols.length < 2) return null
    const name = cols[0]
    const value = cols[1]
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) return null
    if (!value) return null
    return { name: name, value: value }
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
      .map(function (name) { return name + "=" + byName[name] })
      .join("; ")
  }

  function loadCookieHeader(ctx) {
    const envCookie = readEnv(ctx, "GROK_COOKIE")
    if (envCookie) {
      const header = parseCookieInput(envCookie)
      if (header) {
        ctx.host.log.info("cookie header loaded from GROK_COOKIE")
        return header
      }
    }
    const configCookie = readConfigValue(ctx)
    if (configCookie) {
      const header = parseCookieInput(configCookie)
      if (header) {
        ctx.host.log.info("cookie header loaded from ~/.ai-usage/config.json")
        return header
      }
    }
    return null
  }

  function formatUnknownTier(tier) {
    return String(tier || "")
      .replace(/^SUBSCRIPTION_TIER_/, "")
      .toLowerCase()
      .split("_")
      .filter(Boolean)
      .map(function (part) { return part.charAt(0).toUpperCase() + part.slice(1) })
      .join(" ")
  }

  function parsePlan(ctx, bodyText) {
    const data = ctx.util.tryParseJson(bodyText)
    if (!data || !Array.isArray(data.subscriptions)) return null

    let selected = PLAN_TIERS.SUBSCRIPTION_TIER_INVALID
    for (let i = 0; i < data.subscriptions.length; i += 1) {
      const subscription = data.subscriptions[i]
      if (!subscription || subscription.status !== "SUBSCRIPTION_STATUS_ACTIVE") continue
      const known = PLAN_TIERS[subscription.tier]
      if (known && known.rank > selected.rank) selected = known
      else if (!known) {
        const label = formatUnknownTier(subscription.tier)
        if (label) selected = { label: label, rank: Number.MAX_SAFE_INTEGER }
      }
    }
    return selected.label
  }

  function fetchPlan(ctx, cookieHeader) {
    let resp
    try {
      resp = ctx.util.request({
        method: "GET",
        url: SUBSCRIPTIONS_URL,
        headers: {
          Accept: "application/json",
          Referer: "https://grok.com/?_s=billing",
          Cookie: cookieHeader,
        },
        timeoutMs: 15000,
      })
    } catch (e) {
      ctx.host.log.warn("subscription request failed: " + String(e))
      return null
    }

    if (resp.status !== 200) {
      ctx.host.log.warn("subscription request returned HTTP " + resp.status)
      return null
    }
    const plan = parsePlan(ctx, resp.bodyText)
    if (!plan) ctx.host.log.warn("subscription response could not be parsed")
    return plan
  }

  function bytes() {
    let out = ""
    for (let i = 0; i < arguments.length; i += 1) out += String.fromCharCode(arguments[i] & 0xff)
    return out
  }

  function grpcFrame(messageBytes) {
    const len = messageBytes.length
    return bytes(0, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff) + messageBytes
  }

  function readGrpcMessage(ctx, bodyBase64) {
    const data = ctx.base64.decode(String(bodyBase64 || ""))
    let offset = 0
    while (offset + 5 <= data.length) {
      const flags = data.charCodeAt(offset) & 0xff
      const len =
        ((data.charCodeAt(offset + 1) & 0xff) << 24) |
        ((data.charCodeAt(offset + 2) & 0xff) << 16) |
        ((data.charCodeAt(offset + 3) & 0xff) << 8) |
        (data.charCodeAt(offset + 4) & 0xff)
      offset += 5
      if (offset + len > data.length) return null
      const message = data.slice(offset, offset + len)
      offset += len
      if ((flags & 0x80) === 0) return message
    }
    return null
  }

  function readVarint(reader) {
    let shift = 0
    let result = 0
    while (reader.pos < reader.end && shift < 53) {
      const b = reader.data.charCodeAt(reader.pos) & 0xff
      reader.pos += 1
      result += (b & 0x7f) * Math.pow(2, shift)
      if ((b & 0x80) === 0) return result
      shift += 7
    }
    return null
  }

  function readFixed32(reader) {
    if (reader.pos + 4 > reader.end) return null
    const b0 = reader.data.charCodeAt(reader.pos) & 0xff
    const b1 = reader.data.charCodeAt(reader.pos + 1) & 0xff
    const b2 = reader.data.charCodeAt(reader.pos + 2) & 0xff
    const b3 = reader.data.charCodeAt(reader.pos + 3) & 0xff
    reader.pos += 4
    if (typeof DataView !== "undefined") {
      const buffer = new ArrayBuffer(4)
      const view = new DataView(buffer)
      view.setUint8(0, b0)
      view.setUint8(1, b1)
      view.setUint8(2, b2)
      view.setUint8(3, b3)
      return view.getFloat32(0, true)
    }
    const bits = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)
    const sign = bits >>> 31 ? -1 : 1
    const exponent = (bits >>> 23) & 0xff
    const fraction = bits & 0x7fffff
    if (exponent === 255) return fraction ? NaN : sign * Infinity
    if (exponent === 0) return sign * Math.pow(2, -149) * fraction
    return sign * Math.pow(2, exponent - 150) * (fraction + Math.pow(2, 23))
  }

  function skipField(reader, wireType) {
    if (wireType === 0) return readVarint(reader) !== null
    if (wireType === 1) {
      reader.pos += 8
      return reader.pos <= reader.end
    }
    if (wireType === 2) {
      const len = readVarint(reader)
      if (len === null) return false
      reader.pos += len
      return reader.pos <= reader.end
    }
    if (wireType === 5) {
      reader.pos += 4
      return reader.pos <= reader.end
    }
    return false
  }

  function makeReader(data) {
    return { data: data, pos: 0, end: data.length }
  }

  function readMessage(reader) {
    const len = readVarint(reader)
    if (len === null || reader.pos + len > reader.end) return null
    const message = reader.data.slice(reader.pos, reader.pos + len)
    reader.pos += len
    return message
  }

  function timestampToIso(message) {
    const reader = makeReader(message)
    let seconds = null
    let nanos = 0
    while (reader.pos < reader.end) {
      const key = readVarint(reader)
      if (key === null) return null
      const field = Math.floor(key / 8)
      const wire = key & 7
      if (field === 1 && wire === 0) seconds = readVarint(reader)
      else if (field === 2 && wire === 0) nanos = readVarint(reader) || 0
      else if (!skipField(reader, wire)) return null
    }
    if (seconds === null) return null
    const ms = seconds * 1000 + Math.floor(nanos / 1000000)
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null
  }

  function parseUsagePeriod(message) {
    const reader = makeReader(message)
    const period = { type: null, start: null, end: null }
    while (reader.pos < reader.end) {
      const key = readVarint(reader)
      if (key === null) break
      const field = Math.floor(key / 8)
      const wire = key & 7
      if (field === 1 && wire === 0) period.type = readVarint(reader)
      else if (field === 2 && wire === 2) {
        const msg = readMessage(reader)
        if (msg) period.start = timestampToIso(msg)
      } else if (field === 3 && wire === 2) {
        const msg = readMessage(reader)
        if (msg) period.end = timestampToIso(msg)
      } else if (!skipField(reader, wire)) break
    }
    return period
  }

  function parseProductUsage(message) {
    const reader = makeReader(message)
    const usage = { product: null, usagePercent: null }
    while (reader.pos < reader.end) {
      const key = readVarint(reader)
      if (key === null) break
      const field = Math.floor(key / 8)
      const wire = key & 7
      if (field === 1 && wire === 0) usage.product = readVarint(reader)
      else if (field === 2 && wire === 5) usage.usagePercent = readFixed32(reader)
      else if (!skipField(reader, wire)) break
    }
    return usage
  }

  function parseConfig(message) {
    const reader = makeReader(message)
    const config = {
      creditUsagePercent: 0,
      currentPeriod: null,
      billingPeriodEnd: null,
      productUsage: [],
      isUnifiedBillingUser: null,
    }
    while (reader.pos < reader.end) {
      const key = readVarint(reader)
      if (key === null) break
      const field = Math.floor(key / 8)
      const wire = key & 7
      if (field === 1 && wire === 5) config.creditUsagePercent = readFixed32(reader)
      else if (field === 5 && wire === 2) {
        const msg = readMessage(reader)
        if (msg) config.billingPeriodEnd = timestampToIso(msg)
      } else if (field === 7 && wire === 2) {
        const msg = readMessage(reader)
        if (msg) config.productUsage.push(parseProductUsage(msg))
      } else if (field === 8 && wire === 2) {
        const msg = readMessage(reader)
        if (msg) config.currentPeriod = parseUsagePeriod(msg)
      } else if (field === 11 && wire === 0) config.isUnifiedBillingUser = readVarint(reader) === 1
      else if (!skipField(reader, wire)) break
    }
    return config
  }

  function parseUsageResponse(message) {
    const reader = makeReader(message)
    while (reader.pos < reader.end) {
      const key = readVarint(reader)
      if (key === null) break
      const field = Math.floor(key / 8)
      const wire = key & 7
      if (field === 1 && wire === 2) {
        const configMessage = readMessage(reader)
        if (!configMessage) return null
        return parseConfig(configMessage)
      }
      if (!skipField(reader, wire)) break
    }
    return null
  }

  function fetchUsage(ctx, cookieHeader) {
    let resp
    try {
      resp = ctx.util.request({
        method: "POST",
        url: USAGE_URL,
        headers: {
          Accept: "application/grpc-web+proto",
          "Content-Type": "application/grpc-web+proto",
          "X-Grpc-Web": "1",
          "X-User-Agent": "connect-es/2.1.1",
          Origin: "https://grok.com",
          Referer: "https://grok.com/?_s=usage",
          Cookie: cookieHeader,
        },
        bodyBase64: ctx.base64.encode(grpcFrame("")),
        timeoutMs: 15000,
      })
    } catch (e) {
      ctx.host.log.error("usage request exception: " + String(e))
      throw "Request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) {
      throw "Grok login required. Add your grok.com cookie to `~/.ai-usage/config.json` under `grok.cookie`."
    }
    if (resp.status !== 200) {
      throw "Grok usage fetch failed (HTTP " + resp.status + "). Try again later."
    }

    const status = resp.headers && (resp.headers["grpc-status"] || resp.headers["Grpc-Status"])
    if (String(status || "0") === "16") {
      throw "Grok login required. Add your grok.com cookie to `~/.ai-usage/config.json` under `grok.cookie`."
    }
    if (status !== undefined && String(status) !== "0") {
      throw "Grok usage fetch failed (gRPC " + String(status) + "). Try again later."
    }

    const message = readGrpcMessage(ctx, resp.bodyBase64)
    if (!message) throw "Could not parse usage data."
    const parsed = parseUsageResponse(message)
    if (!parsed) throw "Could not parse usage data."
    return parsed
  }

  function periodLabel(period) {
    if (!period) return null
    const name = period.type === USAGE_PERIOD_WEEKLY ? "Weekly" : period.type === USAGE_PERIOD_MONTHLY ? "Monthly" : null
    if (name && period.end) return name + " · resets " + period.end.slice(0, 10)
    if (name) return name
    if (period.end) return "Resets " + period.end.slice(0, 10)
    return null
  }

  function productPercent(config, productId) {
    for (let i = 0; i < config.productUsage.length; i += 1) {
      const row = config.productUsage[i]
      if (row.product === productId && typeof row.usagePercent === "number" && Number.isFinite(row.usagePercent)) {
        return Math.max(0, row.usagePercent)
      }
    }
    return 0
  }

  function addPercentLine(lines, ctx, label, percent, resetsAt) {
    if (typeof percent !== "number" || !Number.isFinite(percent)) return
    const opts = {
      label: label,
      used: Math.max(0, percent),
      limit: 100,
      format: { kind: "percent" },
    }
    if (resetsAt) opts.resetsAt = resetsAt
    lines.push(ctx.line.progress(opts))
  }

  function probe(ctx) {
    const cookieHeader = loadCookieHeader(ctx)
    if (!cookieHeader) {
      throw "Missing Grok credentials. Add your grok.com cookie to `~/.ai-usage/config.json` under `grok.cookie` or set `GROK_COOKIE`."
    }

    const data = fetchUsage(ctx, cookieHeader)
    const plan = fetchPlan(ctx, cookieHeader)
    const lines = []
    const reset = data.currentPeriod && data.currentPeriod.end ? data.currentPeriod.end : data.billingPeriodEnd
    addPercentLine(lines, ctx, "Usage pool", data.creditUsagePercent, reset)
    addPercentLine(lines, ctx, "Grok Build", productPercent(data, PRODUCT_GROK_BUILD), reset)
    const period = periodLabel(data.currentPeriod)
    if (period) lines.push(ctx.line.text({ label: "Period", value: period }))
    if (!lines.length) throw "Could not parse usage data."
    return { plan: plan, lines: lines }
  }

  globalThis.__ai_usage_plugin = { id: "grok", probe: probe }
})()
