// The math behind the gauge. Pure functions only (no network, no files), so it can be tested.
//
// Anthropic has no endpoint for your remaining prepaid credit. The gauge estimates it:
//
//   remaining ≈ balance you entered − what the Cost API says you've spent since you entered it
//
// "Spent since" is measured in whole UTC days from the Cost API, minus what had already been
// spent on the day you entered the balance (the baseline), so that day isn't counted twice.

/** Cost API amounts are decimal strings in cents ("123.45" = $1.2345). */
export function centsToUsd(amount) {
  const n = Number.parseFloat(amount ?? "0")
  return Number.isFinite(n) ? n / 100 : 0
}

/** UTC day key, e.g. "2026-11-03". */
export const dayKey = (d) => new Date(d).toISOString().slice(0, 10)

/** Midnight UTC at the start of the given time's day. */
export function startOfUtcDay(d) {
  const x = new Date(d)
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()))
}

export function startOfUtcMonth(d) {
  const x = new Date(d)
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1))
}

/** Sum spend over the days in [from, to) from a { "YYYY-MM-DD": usd } map. */
export function spendBetween(daily, from, to) {
  const a = dayKey(from)
  const b = dayKey(to)
  let sum = 0
  for (const [day, usd] of Object.entries(daily)) if (day >= a && day < b) sum += usd
  return sum
}

/** Spend on one UTC day. */
export const spendOn = (daily, d) => daily[dayKey(d)] ?? 0

/**
 * Average daily spend over the last `days` full days (today excluded, since it's partial).
 * Null when there's no history yet.
 */
export function burnRate(daily, now, days = 7) {
  const end = startOfUtcDay(now)
  const start = new Date(end.getTime() - days * 86400000)
  const keys = Object.keys(daily)
  if (keys.length === 0 || keys.every((k) => k >= dayKey(end))) return null
  return spendBetween(daily, start, end) / days
}

/**
 * Estimated credit left.
 *   credit:           { balance_usd, as_of, baseline_usd }   (from `claude-gauge balance <usd>`)
 *   spentSinceCredit: total spend since as_of, when the API can total from a moment (preferred)
 * Without that total, it falls back to whole days minus the baseline (what that day had already
 * spent when the balance was entered). Null when no balance has been entered.
 */
export function estimateRemaining(daily, credit, now, spentSinceCredit = null) {
  if (!credit || !Number.isFinite(credit.balance_usd) || !credit.as_of) return null
  let spentSince
  if (Number.isFinite(spentSinceCredit)) spentSince = spentSinceCredit
  else {
    const tomorrow = new Date(startOfUtcDay(now).getTime() + 86400000)
    spentSince = Math.max(0, spendBetween(daily, startOfUtcDay(credit.as_of), tomorrow) - (credit.baseline_usd ?? 0))
  }
  return { remaining: credit.balance_usd - spentSince, spentSince, of: credit.balance_usd }
}

/** Battery level 0–100 from remaining/of, clamped. */
export function percent(remaining, of) {
  if (!Number.isFinite(remaining) || !Number.isFinite(of) || of <= 0) return null
  return Math.max(0, Math.min(100, Math.round((remaining / of) * 100)))
}

/** "ok" | "warn" | "critical" from a percentage and the two thresholds. */
export function level(pct, warnPct = 25, criticalPct = 10) {
  if (pct === null) return "ok"
  if (pct <= criticalPct) return "critical"
  if (pct <= warnPct) return "warn"
  return "ok"
}

/** A text battery, e.g. "█████░░░░░" for 50% at width 10. */
export function bar(pct, width = 10) {
  const filled = pct === null ? 0 : Math.round((pct / 100) * width)
  return "█".repeat(filled) + "░".repeat(width - filled)
}

export const usd = (n) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `$${n.toFixed(2)}`)

/**
 * Everything every display needs, in one object.
 *   daily:  { "YYYY-MM-DD": usd } from the Cost API
 *   config: { credit?, monthly_budget_usd?, warn_pct, critical_pct }
 *   meta:   { spentSinceCredit?, refreshedAt?, todayKnown?, source?, fetched_at?, stale? }
 */
export function summarize(daily, config, now, meta = {}) {
  const todayKnown = meta.todayKnown !== false
  const today = todayKnown ? spendOn(daily, now) : null
  const month = spendBetween(daily, startOfUtcMonth(now), new Date(startOfUtcDay(now).getTime() + 86400000))
  const burn = burnRate(daily, now)
  const est = estimateRemaining(daily, config.credit, now, meta.spentSinceCredit ?? null)

  // Credit mode (prepaid balance) wins; otherwise budget mode (spend vs a monthly budget).
  let mode = "spend"
  let remaining = null
  let of = null
  if (est) {
    mode = "credit"
    remaining = est.remaining
    of = est.of
  } else if (Number.isFinite(config.monthly_budget_usd) && config.monthly_budget_usd > 0) {
    mode = "budget"
    remaining = config.monthly_budget_usd - month
    of = config.monthly_budget_usd
  }
  const pct = percent(remaining, of)
  const daysLeft = remaining !== null && burn && burn > 0 ? Math.max(0, remaining / burn) : null
  return {
    mode,
    pct,
    level: level(pct, config.warn_pct, config.critical_pct),
    remaining,
    of,
    today,
    month,
    burn,
    days_left: daysLeft,
    credit_set_at: config.credit?.as_of ?? null,
    source: meta.source ?? null,
    fetched_at: meta.fetched_at ?? null,
    data_through: meta.refreshedAt ?? null,
    today_known: todayKnown,
    stale: !!meta.stale,
    estimate: mode === "credit",
  }
}
