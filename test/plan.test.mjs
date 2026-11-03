// Run with: npm test
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { ageLabel, planFromStatusLine, summarizePlan, windowLabel } from "../src/plan.mjs"

// The documented example from Claude Code's status line docs.
const input = {
  rate_limits: {
    five_hour: { used_percentage: 23.5, resets_at: 1738425600 },
    seven_day: { used_percentage: 41.2, resets_at: 1738857600 },
  },
}
const before = new Date(1738425600 * 1000 - 3600 * 1000) // an hour before the 5-hour reset

describe("plan usage", () => {
  it("reads both windows from the status line input", () => {
    const snap = planFromStatusLine(input, before)
    assert.equal(snap.windows.five_hour.used_percentage, 23.5)
    assert.equal(snap.windows.seven_day.resets_at, 1738857600)
  })

  it("is null without rate limits (API-key users, or before the first response)", () => {
    assert.equal(planFromStatusLine({ cost: { total_cost_usd: 1 } }), null)
    assert.equal(planFromStatusLine(null), null)
    assert.equal(planFromStatusLine({ rate_limits: {} }), null)
  })

  it("shows percent left, and the tighter window as the battery", () => {
    const p = summarizePlan(planFromStatusLine(input, before), before)
    assert.deepEqual(p.windows.map((w) => [w.short, w.left]), [["5h", 77], ["wk", 59]])
    assert.equal(p.tightest.short, "wk")
    assert.equal(p.age_min, 0)
  })

  it("a window whose reset time has passed shows as reset", () => {
    const later = new Date(1738425600 * 1000 + 60 * 1000)
    const p = summarizePlan(planFromStatusLine(input, before), later)
    const five = p.windows.find((w) => w.key === "five_hour")
    assert.deepEqual([five.left, five.reset], [100, true])
    assert.equal(p.age_min, 61)
  })

  it("colors by what's left", () => {
    const p = summarizePlan({ captured_at: before.toISOString(), windows: { five_hour: { used_percentage: 92, resets_at: null } } }, before)
    assert.equal(p.windows[0].level, "critical")
  })

  it("labels the reading's age", () => {
    assert.equal(ageLabel(0), "just now")
    assert.equal(ageLabel(12), "12 min ago")
    assert.equal(ageLabel(180), "3 h ago")
  })
})

describe("more than the documented windows", () => {
  it("keeps any extra window Claude Code sends, labelled sensibly", () => {
    const snap = planFromStatusLine({ rate_limits: { ...input.rate_limits, seven_day_fable: { used_percentage: 30, resets_at: 1738857600 } } }, before)
    const p = summarizePlan(snap, before)
    assert.deepEqual(p.windows.map((w) => [w.label, w.left]), [["5-hour", 77], ["Week", 59], ["Week (Fable)", 70]])
    assert.deepEqual(windowLabel("seven_day_opus"), { label: "Week (Opus)", short: "op" })
  })
  it("shows the spend limit (credits used of a monthly cap)", () => {
    const snap = planFromStatusLine({ rate_limits: { spend_limit: { used_percentage: 62.8, resets_at: 1740787200, used_usd: 62.8, limit_usd: 100, period: "monthly" } } }, before)
    const p = summarizePlan(snap, before)
    assert.deepEqual([p.spend.used_usd, p.spend.limit_usd, p.spend.period], [62.8, 100, "monthly"])
    assert.equal(p.tightest, null)
  })
  it("still reads readings saved in the earlier format", () => {
    const p = summarizePlan({ captured_at: before.toISOString(), five_hour: { used_percentage: 25, resets_at: null } }, before)
    assert.equal(p.windows[0].left, 75)
  })
})
