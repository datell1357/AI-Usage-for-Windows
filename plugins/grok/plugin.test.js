import { readFileSync } from "node:fs"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

let plugin = null

beforeAll(async () => {
  await import("./plugin.js")
  plugin = globalThis.__ai_usage_plugin
})

function bytes(...vals) {
  return Buffer.from(vals)
}

function varint(value) {
  const out = []
  let n = Number(value)
  while (n > 127) {
    out.push((n & 0x7f) | 0x80)
    n = Math.floor(n / 128)
  }
  out.push(n)
  return bytes(...out)
}

function key(field, wire) {
  return varint(field * 8 + wire)
}

function msg(field, body) {
  return Buffer.concat([key(field, 2), varint(body.length), body])
}

function f32(field, value) {
  const buf = Buffer.alloc(4)
  buf.writeFloatLE(value, 0)
  return Buffer.concat([key(field, 5), buf])
}

function enumField(field, value) {
  return Buffer.concat([key(field, 0), varint(value)])
}

function boolField(field, value) {
  return enumField(field, value ? 1 : 0)
}

function timestamp(seconds) {
  return Buffer.concat([enumField(1, seconds)])
}

function usagePeriod() {
  return Buffer.concat([
    enumField(1, 2),
    msg(3, timestamp(4070908800)),
  ])
}

function productUsage(product, percent) {
  return Buffer.concat([
    enumField(1, product),
    f32(2, percent),
  ])
}

function grokUsageResponse({ pool = 62.5, build = 25 } = {}) {
  const config = Buffer.concat([
    f32(1, pool),
    msg(7, productUsage(2, build)),
    msg(8, usagePeriod()),
    boolField(11, true),
  ])
  const response = msg(1, config)
  const frame = Buffer.concat([bytes(0), Buffer.alloc(4), response])
  frame.writeUInt32BE(response.length, 1)
  return frame.toString("base64")
}

function unusedGrokResponse() {
  const config = Buffer.concat([
    msg(8, usagePeriod()),
    boolField(11, true),
  ])
  const response = msg(1, config)
  const frame = Buffer.concat([bytes(0), Buffer.alloc(4), response])
  frame.writeUInt32BE(response.length, 1)
  return frame.toString("base64")
}

function makeGrokCtx({
  cookie = "grok_session=abc",
  bodyBase64 = grokUsageResponse(),
  subscriptionStatus = 200,
  subscriptions = [{ tier: "SUBSCRIPTION_TIER_X_PREMIUM", status: "SUBSCRIPTION_STATUS_ACTIVE" }],
} = {}) {
  const ctx = makeCtx()
  ctx.host.env.get = vi.fn((name) => (name === "GROK_COOKIE" ? cookie : null))
  ctx.host.http.request.mockImplementation((request) => {
    if (request.url === "https://grok.com/rest/subscriptions") {
      return {
        status: subscriptionStatus,
        headers: {},
        bodyText: JSON.stringify({ subscriptions }),
        bodyBase64: "",
      }
    }
    return {
      status: 200,
      headers: { "grpc-status": "0" },
      bodyText: "",
      bodyBase64,
    }
  })
  return ctx
}

describe("grok plugin", () => {
  it("throws when credentials are missing", async () => {
    const ctx = makeCtx()
    const result = () => plugin.probe(ctx)
    expect(result).toThrow("Missing Grok credentials")
  })

  it("fetches Grok usage over grpc-web and renders pool plus Build", async () => {
    const ctx = makeGrokCtx()
    const result = plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      url: "https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig",
      bodyBase64: expect.any(String),
    }))
    const pool = result.lines.find((line) => line.label === "Usage pool")
    const build = result.lines.find((line) => line.label === "Grok Build")
    expect(pool).toMatchObject({ type: "progress", used: 62.5, limit: 100, format: { kind: "percent" } })
    expect(build).toMatchObject({ type: "progress", used: 25, limit: 100, format: { kind: "percent" } })
    expect(result.lines.find((line) => line.label === "Period")?.value).toBe("Weekly · resets 2099-01-01")
    expect(result.plan).toBe("X Premium")
  })

  it.each([
    ["SUBSCRIPTION_TIER_X_BASIC", "X Basic"],
    ["SUBSCRIPTION_TIER_X_PREMIUM_PLUS", "X Premium+"],
    ["SUBSCRIPTION_TIER_SUPER_GROK_LITE", "SuperGrok Lite"],
    ["SUBSCRIPTION_TIER_GROK_PRO", "SuperGrok"],
    ["SUBSCRIPTION_TIER_SUPER_GROK_PRO", "SuperGrok Heavy"],
  ])("maps active plan tier %s to %s", (tier, label) => {
    const ctx = makeGrokCtx({ subscriptions: [{ tier, status: "SUBSCRIPTION_STATUS_ACTIVE" }] })

    const result = plugin.probe(ctx)

    expect(result.plan).toBe(label)
  })

  it("selects the highest active plan and ignores inactive subscriptions", () => {
    const ctx = makeGrokCtx({
      subscriptions: [
        { tier: "SUBSCRIPTION_TIER_GROK_PRO", status: "SUBSCRIPTION_STATUS_INACTIVE" },
        { tier: "SUBSCRIPTION_TIER_X_PREMIUM", status: "SUBSCRIPTION_STATUS_ACTIVE" },
        { tier: "SUBSCRIPTION_TIER_SUPER_GROK_PRO", status: "SUBSCRIPTION_STATUS_ACTIVE" },
      ],
    })

    expect(plugin.probe(ctx).plan).toBe("SuperGrok Heavy")
  })

  it("uses the Free plan when no subscription is active", () => {
    const ctx = makeGrokCtx({ subscriptions: [] })

    expect(plugin.probe(ctx).plan).toBe("Free")
  })

  it("keeps usage available when the optional plan request fails", () => {
    const ctx = makeGrokCtx({ subscriptionStatus: 503 })

    const result = plugin.probe(ctx)

    expect(result.plan).toBeNull()
    expect(result.lines.find((line) => line.label === "Usage pool")?.used).toBe(62.5)
  })

  it("renders zero usage when protobuf scalar and product rows are absent", async () => {
    const ctx = makeGrokCtx({ bodyBase64: unusedGrokResponse() })

    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Usage pool")).toMatchObject({ used: 0, limit: 100 })
    expect(result.lines.find((line) => line.label === "Grok Build")).toMatchObject({ used: 0, limit: 100 })
  })

  it("loads cookie from config when env is empty", async () => {
    const ctx = makeGrokCtx({ cookie: null })
    ctx.host.env.get = vi.fn(() => null)
    ctx.host.fs.exists = (path) => path === "~/.ai-usage/config.json"
    ctx.host.fs.readText = () => JSON.stringify({ grok: { cookie: "grok_session=from-config" } })

    plugin.probe(ctx)

    const headers = ctx.host.http.request.mock.calls[0][0].headers
    expect(headers.Cookie).toBe("grok_session=from-config")
  })

  it("accepts a DevTools cookie table paste", async () => {
    const table = "grok_session\tabc123\tgrok.com\t/\tSession\t20\t✓\t✓\tLax"
    const ctx = makeGrokCtx({ cookie: table })

    plugin.probe(ctx)

    const headers = ctx.host.http.request.mock.calls[0][0].headers
    expect(headers.Cookie).toBe("grok_session=abc123")
  })


  it("drops unrelated cookies from a DevTools table paste", async () => {
    const table = [
      "__stripe_mid\tstripe-value\t.grok.com\t/\t2027-01-01\t54",
      "sso\tsso-value\t.grok.com\t/\t2027-01-01\t155\t✓\t✓\tLax",
      "cf_clearance\tcf-value\t.grok.com\t/\t2027-01-01\t417\t✓\t✓\tNone",
      "mp_ea93da913ddb66b6372b89d97b1029ac_mixpanel\tmixpanel-value\t.grok.com\t/\t2027-01-01\t546",
      "grok_device_id\tdevice-value\t.grok.com\t/\t2027-01-01\t50",
      "x-userid\tuser-value\t.grok.com\t/\tSession\t44",
    ].join("\n")
    const ctx = makeGrokCtx({ cookie: table })

    plugin.probe(ctx)

    const headers = ctx.host.http.request.mock.calls[0][0].headers
    expect(headers.Cookie).toBe("sso=sso-value; cf_clearance=cf-value; grok_device_id=device-value; x-userid=user-value")
  })

  it("throws login required on unauthenticated grpc status", async () => {
    const ctx = makeGrokCtx()
    ctx.host.http.request.mockReturnValue({ status: 200, headers: { "grpc-status": "16" }, bodyText: "", bodyBase64: "" })

    expect(() => plugin.probe(ctx)).toThrow("Grok login required")
  })

  it("throws parse error when response frame is missing", async () => {
    const ctx = makeGrokCtx({ bodyBase64: "" })

    expect(() => plugin.probe(ctx)).toThrow("Could not parse usage data")
  })

  it("uses a transparent glyph-only icon suitable for CSS masking", () => {
    const icon = readFileSync("plugins/grok/icon.svg", "utf8")

    expect(icon).not.toContain("<foreignObject")
    expect(icon).not.toContain("<filter")
    expect(icon).not.toContain("<rect")
    expect(icon.match(/<path\b/g)).toHaveLength(2)
  })
})
