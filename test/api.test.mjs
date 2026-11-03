// Run with: npm test. Uses fake responses shaped like the documented API; no network.
import { describe, it, afterEach } from "node:test"
import assert from "node:assert/strict"
import { dailyFromCostReport, fetchSpend, ApiError } from "../src/api.mjs"

const realFetch = globalThis.fetch
afterEach(() => (globalThis.fetch = realFetch))

function fakeFetch(handler) {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), headers: init.headers })
    const { status = 200, body } = handler(new URL(url), calls.length)
    return { ok: status < 400, status, text: async () => JSON.stringify(body) }
  }
  return calls
}

describe("cost report", () => {
  it("sums each day's results (cents → dollars) and follows next_page", async () => {
    const calls = fakeFetch((url, n) =>
      n === 1
        ? { body: { data: [{ starting_at: "2026-11-01T00:00:00Z", results: [{ amount: "150.5" }, { amount: "49.5" }] }], has_more: true, next_page: "p2" } }
        : { body: { data: [{ starting_at: "2026-11-02T00:00:00Z", results: [] }, { starting_at: "2026-11-03T00:00:00Z", results: [{ amount: "1234.000000" }] }], has_more: false, next_page: null } },
    )
    const daily = await dailyFromCostReport("sk-ant-admin01-test", new Date("2026-11-01T00:00:00Z"))
    assert.deepEqual(daily, { "2026-11-01": 2, "2026-11-02": 0, "2026-11-03": 12.34 })
    assert.equal(calls.length, 2)
    assert.equal(calls[0].url.pathname, "/v1/organizations/cost_report")
    assert.equal(calls[0].url.searchParams.get("bucket_width"), "1d")
    assert.equal(calls[1].url.searchParams.get("page"), "p2")
    assert.equal(calls[0].headers["x-api-key"], "sk-ant-admin01-test")
    assert.equal(calls[0].headers["anthropic-version"], "2023-06-01")
  })
})

describe("fetchSpend", () => {
  const now = new Date("2026-11-03T19:30:00Z")

  it("reads daily spend (today included) and the total since the balance was entered from the Analytics API", async () => {
    const calls = fakeFetch((url) =>
      url.searchParams.get("time_bucket_width") === "1d"
        ? { body: { data: [{ starting_at: "2026-11-02T00:00:00Z", cost: { amount: "5657.000000" } }, { starting_at: "2026-11-03T00:00:00Z", cost: { amount: "215.000000" } }], has_more: false, next_page: null, data_refreshed_at: "2026-11-03T18:57:46Z" } }
        : { body: { data: [{ cost: { amount: "120.000000" } }], has_more: false, next_page: null, data_refreshed_at: "2026-11-03T18:57:46Z" } },
    )
    const r = await fetchSpend("k", new Date("2026-11-01T00:00:00Z"), "2026-11-03T15:24:31Z", now)
    assert.deepEqual(r.daily, { "2026-11-02": 56.57, "2026-11-03": 2.15 })
    assert.equal(r.spentSinceCredit, 1.2)
    assert.equal(r.todayKnown, true)
    assert.equal(r.refreshedAt, "2026-11-03T18:57:46Z")
    const daily = calls.find((c) => c.url.searchParams.get("time_bucket_width") === "1d")
    assert.equal(daily.headers["anthropic-beta"], "analytics-usage-cost-2026-08-24")
    assert.equal(daily.url.searchParams.get("ending_at"), "2026-11-04T00:00:00.000Z") // through the end of today
    const total = calls.find((c) => !c.url.searchParams.get("time_bucket_width"))
    assert.equal(total.url.searchParams.get("starting_at"), "2026-11-03T15:24:31.000Z")
  })

  it("falls back to the cost report (finished days only) when the Analytics API isn't available", async () => {
    fakeFetch((url) =>
      url.pathname.endsWith("/analytics/cost")
        ? { status: 404, body: { error: { message: "not found" } } }
        : { body: { data: [{ starting_at: "2026-11-02T00:00:00Z", results: [{ amount: "500" }] }], has_more: false, next_page: null } },
    )
    const r = await fetchSpend("k", new Date("2026-11-01T00:00:00Z"), null, now)
    assert.equal(r.todayKnown, false)
    assert.equal(r.spentSinceCredit, null)
    assert.equal(r.daily["2026-11-02"], 5)
  })

  it("doesn't retry a rejected key on the fallback", async () => {
    const calls = fakeFetch(() => ({ status: 401, body: { error: { message: "invalid x-api-key" } } }))
    await assert.rejects(fetchSpend("bad", new Date("2026-11-01T00:00:00Z"), null, now), (e) => e instanceof ApiError && e.status === 401)
    assert.equal(calls.length, 1)
  })

  it("splits ranges longer than 31 days", async () => {
    const calls = fakeFetch(() => ({ body: { data: [], has_more: false, next_page: null, data_refreshed_at: null } }))
    await fetchSpend("k", new Date("2026-09-01T00:00:00Z"), null, now)
    assert.equal(calls.filter((c) => c.url.pathname.endsWith("/analytics/cost")).length, 3) // Sep 1 → Nov 4 is 64 days
  })
})
