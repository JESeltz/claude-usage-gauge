// Run with: npm test
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { ageLabel, planFromStatusLine, summarizePlan } from "../src/plan.mjs"

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
    assert.equal(snap.five_hour.used_percentage, 23.5)
    assert.equal(snap.seven_day.resets_at, 1738857600)
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
    const p = summarizePlan({ captured_at: before.toISOString(), five_hour: { used_percentage: 92, resets_at: null } }, before)
    assert.equal(p.windows[0].level, "critical")
  })

  it("labels the reading's age", () => {
    assert.equal(ageLabel(0), "just now")
    assert.equal(ageLabel(12), "12 min ago")
    assert.equal(ageLabel(180), "3 h ago")
  })
})
