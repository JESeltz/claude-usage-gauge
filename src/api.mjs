// Reads spend from Anthropic's Admin API (an Admin API key, sk-ant-admin01-...).
//
// Primary: the Usage and Cost Analytics API, GET /v1/organizations/analytics/cost (beta).
//   Includes today so far, and can total spend from a given hour, which is what the
//   credit estimate needs. Data runs some minutes to a few hours behind; every answer
//   says how far (data_refreshed_at).
// Fallback: the Usage and Cost API's cost report, GET /v1/organizations/cost_report.
//   Finished days only (it never returns today), so "today" is unknown on this path.
//
// Docs: https://platform.claude.com/docs/en/manage-claude/usage-cost-analytics-api
//       https://platform.claude.com/docs/en/manage-claude/usage-cost-api

import { centsToUsd, dayKey, startOfUtcDay } from "./core.mjs"

const BASE = "https://api.anthropic.com"
const UA = "claude-usage-gauge/1.0 (https://github.com/JESeltz/claude-usage-gauge)"
const ANALYTICS_BETA = { "anthropic-beta": "analytics-usage-cost-2026-08-24" }
const DAY = 86400000
const MAX_SPAN = 31 * DAY // the Analytics API's longest range per request

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function get(path, params, key, extraHeaders = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) qs.append(k, String(v))
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "user-agent": UA, ...extraHeaders },
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  if (!res.ok) {
    let msg = text.slice(0, 300)
    try {
      msg = JSON.parse(text)?.error?.message ?? msg
    } catch {}
    throw new ApiError(res.status, `${res.status}: ${msg}`)
  }
  return JSON.parse(text)
}

/** [from, to) split into the Analytics API's 31-day windows. */
function windows(from, to) {
  const out = []
  for (let a = from.getTime(); a < to.getTime(); a += MAX_SPAN) out.push([new Date(a), new Date(Math.min(to.getTime(), a + MAX_SPAN))])
  return out
}

/** Every page of one Analytics cost query. */
async function analyticsRows(key, params) {
  const rows = []
  let refreshedAt = null
  let page
  for (let i = 0; i < 20; i++) {
    const r = await get("/v1/organizations/analytics/cost", { ...params, limit: 1000, page }, key, ANALYTICS_BETA)
    rows.push(...(r.data ?? []))
    refreshedAt = r.data_refreshed_at ?? refreshedAt
    if (!r.has_more || !r.next_page) break
    page = r.next_page
  }
  return { rows, refreshedAt }
}

/** Daily spend { "YYYY-MM-DD": usd } from `since` through today (today so far). */
export async function dailyFromAnalytics(key, since, now = new Date()) {
  const daily = {}
  let refreshedAt = null
  const tomorrow = new Date(startOfUtcDay(now).getTime() + DAY)
  for (const [a, b] of windows(startOfUtcDay(since), tomorrow)) {
    const r = await analyticsRows(key, { starting_at: a.toISOString(), ending_at: b.toISOString(), time_bucket_width: "1d", order_by: "time", order: "asc" })
    for (const row of r.rows) daily[dayKey(row.starting_at)] = (daily[dayKey(row.starting_at)] ?? 0) + centsToUsd(row.cost?.amount)
    refreshedAt = r.refreshedAt ?? refreshedAt
  }
  return { daily, refreshedAt }
}

/**
 * Total spend from `from` to now. The API rounds `from` down to the hour, so spend earlier
 * in that hour is included: the estimate errs toward less credit, never more.
 */
export async function totalFromAnalytics(key, from, now = new Date()) {
  let usd = 0
  for (const [a, b] of windows(new Date(from), now)) {
    const r = await analyticsRows(key, { starting_at: a.toISOString(), ending_at: b.toISOString() })
    for (const row of r.rows) usd += centsToUsd(row.cost?.amount)
  }
  return usd
}

/** Fallback: finished days only, from the cost report. */
export async function dailyFromCostReport(key, since) {
  const daily = {}
  let page
  for (let i = 0; i < 20; i++) {
    const r = await get("/v1/organizations/cost_report", { starting_at: startOfUtcDay(since).toISOString(), bucket_width: "1d", limit: 31, page }, key)
    for (const bucket of r.data ?? []) {
      const usd = (bucket.results ?? []).reduce((s, x) => s + centsToUsd(x.amount), 0)
      daily[dayKey(bucket.starting_at)] = (daily[dayKey(bucket.starting_at)] ?? 0) + usd
    }
    if (!r.has_more || !r.next_page) break
    page = r.next_page
  }
  return daily
}

/**
 * Everything the gauge needs in one go.
 *   since:      earliest day any display needs
 *   creditFrom: when the balance was entered (null if none)
 * Returns { daily, spentSinceCredit, refreshedAt, todayKnown, source }.
 */
export async function fetchSpend(key, since, creditFrom, now = new Date()) {
  try {
    const { daily, refreshedAt } = await dailyFromAnalytics(key, since, now)
    const spentSinceCredit = creditFrom ? await totalFromAnalytics(key, creditFrom, now) : null
    return { daily, spentSinceCredit, refreshedAt, todayKnown: true, source: "analytics" }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw e
    // The Analytics API is in beta; organizations without it still have the cost report.
    const daily = await dailyFromCostReport(key, since)
    return { daily, spentSinceCredit: null, refreshedAt: null, todayKnown: false, source: "cost_report (finished days only)" }
  }
}
