// Run with: npm test
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { bar, burnRate, centsToUsd, estimateRemaining, level, percent, spendBetween, summarize } from "../src/core.mjs"

const daily = { "2026-10-30": 4, "2026-10-31": 6, "2026-11-01": 5, "2026-11-02": 3, "2026-11-03": 2 }
const now = new Date("2026-11-03T18:00:00Z")

describe("amounts", () => {
  it("reads the Cost API's cent strings as dollars", () => {
    assert.equal(centsToUsd("123.45"), 1.2345)
    assert.equal(centsToUsd("41280.000000"), 412.8)
    assert.equal(centsToUsd(undefined), 0)
  })
})

describe("estimateRemaining", () => {
  it("subtracts spend since the balance was entered, without counting that day's earlier spend twice", () => {
    // Balance $50 entered Nov 2 when $1 of that day's $3 was already spent.
    const e = estimateRemaining(daily, { balance_usd: 50, as_of: "2026-11-02T09:00:00Z", baseline_usd: 1 }, now)
    assert.equal(e.spentSince, 4) // (3 + 2) - 1
    assert.equal(e.remaining, 46)
  })
  it("uses the API's exact total since the balance moment when there is one", () => {
    const e = estimateRemaining(daily, { balance_usd: 27.24, as_of: "2026-11-03T15:24:31Z", baseline_usd: 0 }, now, 1.2)
    assert.equal(e.remaining, 26.04)
  })
  it("is null without a balance", () => {
    assert.equal(estimateRemaining(daily, null, now), null)
  })
  it("never counts negative spend", () => {
    const e = estimateRemaining({}, { balance_usd: 10, as_of: "2026-11-03T09:00:00Z", baseline_usd: 2 }, now)
    assert.equal(e.remaining, 10)
  })
})

describe("battery", () => {
  it("percent clamps to 0–100", () => {
    assert.equal(percent(25, 50), 50)
    assert.equal(percent(-5, 50), 0)
    assert.equal(percent(80, 50), 100)
    assert.equal(percent(5, 0), null)
  })
  it("levels follow the thresholds", () => {
    assert.equal(level(60), "ok")
    assert.equal(level(25), "warn")
    assert.equal(level(10), "critical")
    assert.equal(level(null), "ok")
  })
  it("draws a bar", () => {
    assert.equal(bar(50, 10), "█████░░░░░")
    assert.equal(bar(null, 4), "░░░░")
  })
})

describe("summarize", () => {
  it("credit mode: remaining, runway from the last full days", () => {
    const s = summarize(daily, { credit: { balance_usd: 50, as_of: "2026-10-30T00:00:00Z", baseline_usd: 0 }, warn_pct: 25, critical_pct: 10 }, now)
    assert.equal(s.mode, "credit")
    assert.equal(s.remaining, 30) // 50 - 20
    assert.equal(s.pct, 60)
    assert.equal(s.today, 2)
    assert.equal(s.month, 10) // Nov 1–3: 5 + 3 + 2
    assert.equal(s.burn, 18 / 7) // Oct 27–Nov 2, today excluded
  })
  it("budget mode when no balance is set", () => {
    const s = summarize(daily, { monthly_budget_usd: 20, warn_pct: 25, critical_pct: 10 }, now)
    assert.equal(s.mode, "budget")
    assert.equal(s.remaining, 10) // 20 - (5 + 3 + 2)
    assert.equal(s.pct, 50)
  })
  it("today is unknown on the finished-days-only fallback", () => {
    const s = summarize(daily, { warn_pct: 25, critical_pct: 10 }, now, { todayKnown: false })
    assert.equal(s.today, null)
  })
  it("spend mode with neither", () => {
    const s = summarize(daily, { warn_pct: 25, critical_pct: 10 }, now)
    assert.equal(s.mode, "spend")
    assert.equal(s.pct, null)
  })
  it("spendBetween and burnRate handle empty history", () => {
    assert.equal(spendBetween({}, now, now), 0)
    assert.equal(burnRate({}, now), null)
  })
})
