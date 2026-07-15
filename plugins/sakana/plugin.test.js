import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__ai_usage_plugin
}

const BILLING_HTML = `
<main>
  <div data-slot="card-title"><span>Standard</span><span>$20/mo</span></div>
  <div data-slot="card-title">Usage limit</div>
  <p class="font-medium text-sm">5-hour</p>
  <p class="text-muted-foreground text-xs tabular-nums">Resets on June 23, 2026 at 2:53 PM</p>
  <button aria-label="The 5-hour window starts with your first request."></button>
  <p class="text-muted-foreground text-sm">92% used</p>
  <p class="font-medium text-sm">Weekly</p>
  <p class="text-muted-foreground text-xs tabular-nums">Resets on June 29, 2026 at 12:00 AM</p>
  <button aria-label="Weekly usage resets every Monday at 00:00 UTC."></button>
  <p class="text-muted-foreground text-sm">32% used</p>
</main>
`

const SUBSCRIPTION_HTML = BILLING_HTML.replace(
  "<main>",
  `<main>
  <section>
    <h2>Subscription</h2>
    <span>Active</span>
    <div>
      <p class="font-semibold text-3xl">Max</p>
      <p>$200/mo</p>
    </div>
    <p>Renews on July 22, 2026</p>
  </section>`,
)

function mockCookie(ctx, value = "session=abc; theme=dark") {
  ctx.host.env.get.mockImplementation((name) => (name === "SAKANA_COOKIE" ? value : null))
}

function mockBilling(ctx, body = BILLING_HTML, status = 200) {
  ctx.host.http.request.mockReturnValue({ status, headers: {}, bodyText: body })
}

describe("sakana plugin", () => {
  beforeEach(() => {
    delete globalThis.__ai_usage_plugin
    vi.resetModules()
  })

  it("throws when cookie header is missing", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Missing Sakana credentials")
  })

  it("fetches billing with normalized cookie header", async () => {
    const ctx = makeCtx()
    mockCookie(ctx, "Cookie: session=abc; theme=dark")
    mockBilling(ctx)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Standard $20/mo")
    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET",
      url: "https://console.sakana.ai/billing",
      headers: expect.objectContaining({
        Cookie: "session=abc; theme=dark",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      }),
    }))
  })

  it("renders 5-hour and weekly quota windows", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockBilling(ctx)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const fiveHour = result.lines.find((line) => line.label === "5-hour")
    expect(fiveHour).toMatchObject({
      type: "progress",
      used: 92,
      limit: 100,
      format: { kind: "percent" },
      periodDurationMs: 5 * 60 * 60 * 1000,
      resetsAt: "2026-06-23T14:53:00.000Z",
    })

    const weekly = result.lines.find((line) => line.label === "Weekly")
    expect(weekly).toMatchObject({
      type: "progress",
      used: 32,
      limit: 100,
      format: { kind: "percent" },
      periodDurationMs: 7 * 24 * 60 * 60 * 1000,
      resetsAt: "2026-06-29T00:00:00.000Z",
    })
  })

  it("renders subscription status, plan, price, and renewal", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockBilling(ctx, SUBSCRIPTION_HTML)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Max $200/mo")
    expect(result.lines.find((line) => line.label === "Subscription")).toEqual({
      type: "text",
      label: "Subscription",
      value: "Active · Max · $200/mo",
    })
    expect(result.lines.find((line) => line.label === "Renewal")).toEqual({
      type: "text",
      label: "Renewal",
      value: "Renews on July 22, 2026",
    })
  })

  it("handles a missing reset line", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockBilling(ctx, BILLING_HTML.replace(
      '<p class="text-muted-foreground text-xs tabular-nums">Resets on June 23, 2026 at 2:53 PM</p>',
      "",
    ))

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const fiveHour = result.lines.find((line) => line.label === "5-hour")

    expect(fiveHour.used).toBe(92)
    expect(fiveHour.resetsAt).toBeUndefined()
  })

  it("throws login required on auth status", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockBilling(ctx, "expired", 401)

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Sakana login required")
  })

  it("throws login required on redirect status", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockBilling(ctx, "", 302)

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Sakana login required")
  })

  it("throws parse error when usage windows are missing", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockBilling(ctx, "<main>Billing</main>")

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage limit windows were not found")
  })

  it("extracts table-pasted session tokens that contain equals padding", async () => {
    const ctx = makeCtx()
    const tablePaste = "__Secure-authjs.session-token\tTOKEN.WITH.PADDING==\tconsole.sakana.ai\t/\t2026-07-22T15:35:52.674Z\t2875\t\u2713\t\u2713\tLax"
    ctx.host.env.get.mockImplementation((name) => (name === "SAKANA_COOKIE" ? tablePaste : null))
    mockBilling(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        Cookie: "__Secure-authjs.session-token=TOKEN.WITH.PADDING==",
      }),
    }))
  })

  it("extracts only the session token from a DevTools cookies table paste", async () => {
    const ctx = makeCtx()
    const tablePaste = [
      "__Host-authjs.csrf-token\taa48ef6e0fd49ce6%7Cbad53cc9f629\tconsole.sakana.ai\t/\tSession\t155\t\u2713\t\u2713\tLax\t\t\tMedium",
      "__Secure-authjs.callback-url\thttps%3A%2F%2Fconsole.sakana.ai%2Flogin\tconsole.sakana.ai\t/\tSession\t67\t\u2713\t\u2713\tLax\t\t\tMedium",
      "__Secure-authjs.session-token\teyJhbGciOiJkaXIiLCJlbmMiOiJ.SESSIONVALUE.KtLh0yTKyf6\tconsole.sakana.ai\t/\t2026-07-22T15:35:52.674Z\t2875\t\u2713\t\u2713\tLax\t\t\tMedium",
    ].join("\n")
    ctx.host.env.get.mockImplementation((name) => (name === "SAKANA_COOKIE" ? tablePaste : null))
    mockBilling(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        Cookie: "__Secure-authjs.session-token=eyJhbGciOiJkaXIiLCJlbmMiOiJ.SESSIONVALUE.KtLh0yTKyf6",
      }),
    }))
  })

  it("keeps only the session token from a full cookie header", async () => {
    const ctx = makeCtx()
    const header = "Cookie: __Host-authjs.csrf-token=abc%7Cdef; __Secure-authjs.callback-url=x; __Secure-authjs.session-token=TOKENVALUE123456"
    ctx.host.env.get.mockImplementation((name) => (name === "SAKANA_COOKIE" ? header : null))
    mockBilling(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        Cookie: "__Secure-authjs.session-token=TOKENVALUE123456",
      }),
    }))
  })

  it("accepts a bare session token with padding", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation((name) =>
      name === "SAKANA_SESSION_TOKEN" ? "eyJhbGciOiJkaXIi.BARE.TOKENVALUE123456==" : null,
    )
    mockBilling(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        Cookie: "__Secure-authjs.session-token=eyJhbGciOiJkaXIi.BARE.TOKENVALUE123456==",
      }),
    }))
  })

  it("accepts a bare session token via SAKANA_SESSION_TOKEN", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation((name) =>
      name === "SAKANA_SESSION_TOKEN" ? "eyJhbGciOiJkaXIi.BARE.TOKENVALUE123456" : null,
    )
    mockBilling(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        Cookie: "__Secure-authjs.session-token=eyJhbGciOiJkaXIi.BARE.TOKENVALUE123456",
      }),
    }))
  })

  it("prefers SAKANA_SESSION_TOKEN over SAKANA_COOKIE", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "SAKANA_SESSION_TOKEN") return "PREFERREDTOKENVALUE123456"
      if (name === "SAKANA_COOKIE") return "__Secure-authjs.session-token=FROMCOOKIE12345678"
      return null
    })
    mockBilling(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        Cookie: "__Secure-authjs.session-token=PREFERREDTOKENVALUE123456",
      }),
    }))
  })

  it("loads the session token from ~/.ai-usage/config.json (sakana.sessionToken)", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation(() => null)
    ctx.host.fs.writeText(
      "~/.ai-usage/config.json",
      JSON.stringify({ sakana: { sessionToken: "eyJhbGci.CONFIG.TOKENVALUE123456" } }),
    )
    mockBilling(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        Cookie: "__Secure-authjs.session-token=eyJhbGci.CONFIG.TOKENVALUE123456",
      }),
    }))
  })

  it("extracts the session token from a config-file cookie value", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation(() => null)
    ctx.host.fs.writeText(
      "~/.ai-usage/config.json",
      JSON.stringify({
        sakana: {
          cookie:
            "__Host-authjs.csrf-token=abc%7Cdef; __Secure-authjs.session-token=CFGCOOKIETOKEN123456",
        },
      }),
    )
    mockBilling(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        Cookie: "__Secure-authjs.session-token=CFGCOOKIETOKEN123456",
      }),
    }))
  })

  it("prefers env vars over the config file", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation((name) =>
      name === "SAKANA_SESSION_TOKEN" ? "ENVTOKENVALUE1234567" : null,
    )
    ctx.host.fs.writeText(
      "~/.ai-usage/config.json",
      JSON.stringify({ sakana: { sessionToken: "CONFIGTOKENVALUE123456" } }),
    )
    mockBilling(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        Cookie: "__Secure-authjs.session-token=ENVTOKENVALUE1234567",
      }),
    }))
  })

  it("ignores an unrelated config file (proxy only)", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation(() => null)
    ctx.host.fs.writeText(
      "~/.ai-usage/config.json",
      JSON.stringify({ proxy: { enabled: true, url: "socks5://127.0.0.1:10808" } }),
    )

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Missing Sakana credentials")
  })

  it("reassembles chunked session-token cookies", async () => {
    const ctx = makeCtx()
    const header = "__Secure-authjs.session-token.0=part0value000000; __Secure-authjs.session-token.1=part1value111111"
    ctx.host.env.get.mockImplementation((name) => (name === "SAKANA_COOKIE" ? header : null))
    mockBilling(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        Cookie: "__Secure-authjs.session-token.0=part0value000000; __Secure-authjs.session-token.1=part1value111111",
      }),
    }))
  })

  it("rejects out-of-range percentages", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockBilling(ctx, BILLING_HTML.replace("92% used", "101% used"))

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Invalid 5-hour usage percentage")
  })
})
