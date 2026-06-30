import { CronExpressionParser } from 'cron-parser'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScheduleKind = 'cron' | 'rate' | 'oneoff'

export interface ScheduleJob {
  id: string
  kind: ScheduleKind
  expression: string
  timezone?: string
  resourceId?: string | null
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface CollisionWindow {
  windowStart: string
  windowEnd: string
  jobIds: string[]
  severity: 'low' | 'medium' | 'high'
  resourceId?: string
}

export interface HeatmapBucket {
  bucket: string
  count: number
}

export interface DstTrap {
  type: 'double_fire' | 'skip' | 'ambiguous'
  atLocal: string
  atUtc: string
}

export interface CoverageGap {
  windowStart: string
  windowEnd: string
  durationMinutes: number
}

export interface SpreadSuggestion {
  jobId: string
  suggestedExpr: string
  reason: string
}

export interface CollisionOptions {
  horizonDays?: number
  threshold?: number
}

export interface HeatmapOptions {
  horizonDays?: number
}

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const DEFAULT_HORIZON_DAYS = 7
const DEFAULT_THRESHOLD = 2
const MAX_FIRINGS_PER_JOB = 100_000

const RATE_RE = /^every\s+(\d+)\s+(minute|minutes|hour|hours|day|days)$/i

function toUnitMs(unit: string): number {
  const u = unit.toLowerCase()
  if (u.startsWith('minute')) return MINUTE_MS
  if (u.startsWith('hour')) return HOUR_MS
  return DAY_MS
}

function parseRate(expr: string): { everyMs: number; n: number; unit: string } | null {
  const m = expr.trim().match(RATE_RE)
  if (!m) return null
  const n = parseInt(m[1], 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return { everyMs: n * toUnitMs(m[2]), n, unit: m[2].toLowerCase() }
}

function isoMinute(ms: number): string {
  // bucket to the start of the minute, ISO UTC
  return new Date(Math.floor(ms / MINUTE_MS) * MINUTE_MS).toISOString()
}

/** Offset (in minutes) of a given instant in a given IANA timezone. */
function tzOffsetMinutes(date: Date, timeZone: string): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const parts = dtf.formatToParts(date)
    const map: Record<string, string> = {}
    for (const p of parts) map[p.type] = p.value
    let hour = parseInt(map.hour, 10)
    if (hour === 24) hour = 0
    const asUTC = Date.UTC(
      parseInt(map.year, 10),
      parseInt(map.month, 10) - 1,
      parseInt(map.day, 10),
      hour,
      parseInt(map.minute, 10),
      parseInt(map.second, 10),
    )
    return Math.round((asUTC - date.getTime()) / MINUTE_MS)
  } catch {
    return 0
  }
}

function localString(date: Date, timeZone: string): string {
  try {
    const dtf = new Intl.DateTimeFormat('sv-SE', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    return dtf.format(date).replace(' ', 'T')
  } catch {
    return date.toISOString()
  }
}

// ---------------------------------------------------------------------------
// validateExpression
// ---------------------------------------------------------------------------

export function validateExpression(kind: ScheduleKind, expr: string): ValidationResult {
  if (!expr || !expr.trim()) return { valid: false, error: 'Expression is empty' }
  const trimmed = expr.trim()

  if (kind === 'cron') {
    try {
      CronExpressionParser.parse(trimmed)
      return { valid: true }
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  if (kind === 'rate') {
    const r = parseRate(trimmed)
    if (!r) {
      return { valid: false, error: 'Rate must look like "every N minutes|hours|days"' }
    }
    return { valid: true }
  }

  if (kind === 'oneoff') {
    const t = Date.parse(trimmed)
    if (Number.isNaN(t)) return { valid: false, error: 'One-off must be a valid ISO date-time' }
    return { valid: true }
  }

  return { valid: false, error: `Unknown schedule kind: ${kind}` }
}

// ---------------------------------------------------------------------------
// describeExpression
// ---------------------------------------------------------------------------

export function describeExpression(
  kind: ScheduleKind,
  expr: string,
  timezone = 'UTC',
): string {
  const trimmed = (expr ?? '').trim()
  const v = validateExpression(kind, trimmed)
  if (!v.valid) return `Invalid ${kind} expression: ${v.error ?? 'unknown error'}`

  if (kind === 'rate') {
    const r = parseRate(trimmed)!
    const unit = r.n === 1 ? r.unit.replace(/s$/, '') : r.unit.replace(/s?$/, 's')
    return `Every ${r.n} ${unit}`
  }

  if (kind === 'oneoff') {
    const d = new Date(Date.parse(trimmed))
    return `Once at ${localString(d, timezone)} (${timezone})`
  }

  // cron
  const parts = trimmed.split(/\s+/)
  const [min, hour, dom, mon, dow] = parts
  const segs: string[] = []
  if (min === '*' && hour === '*') {
    segs.push('every minute')
  } else if (min !== '*' && hour === '*') {
    segs.push(`at minute ${min} of every hour`)
  } else if (hour !== '*' && min !== '*') {
    segs.push(`at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`)
  } else {
    segs.push(`minute=${min} hour=${hour}`)
  }
  if (dom && dom !== '*') segs.push(`on day-of-month ${dom}`)
  if (mon && mon !== '*') segs.push(`in month ${mon}`)
  if (dow && dow !== '*') segs.push(`on weekday ${dow}`)
  return `${segs.join(', ')} (${timezone})`
}

// ---------------------------------------------------------------------------
// nextFirings
// ---------------------------------------------------------------------------

export function nextFirings(
  kind: ScheduleKind,
  expr: string,
  timezone = 'UTC',
  fromISO?: string,
  count = 10,
): string[] {
  const trimmed = (expr ?? '').trim()
  const from = fromISO ? new Date(fromISO) : new Date()
  const fromMs = from.getTime()
  const n = Math.max(0, Math.min(count, 10_000))
  if (n === 0) return []

  const v = validateExpression(kind, trimmed)
  if (!v.valid) return []

  if (kind === 'cron') {
    try {
      const it = CronExpressionParser.parse(trimmed, {
        tz: timezone,
        currentDate: new Date(fromMs),
      })
      const out: string[] = []
      for (let i = 0; i < n; i++) {
        out.push(it.next().toDate().toISOString())
      }
      return out
    } catch {
      return []
    }
  }

  if (kind === 'rate') {
    const r = parseRate(trimmed)
    if (!r) return []
    const out: string[] = []
    for (let i = 1; i <= n; i++) {
      out.push(new Date(fromMs + r.everyMs * i).toISOString())
    }
    return out
  }

  if (kind === 'oneoff') {
    const t = Date.parse(trimmed)
    if (Number.isNaN(t)) return []
    return t > fromMs ? [new Date(t).toISOString()] : []
  }

  return []
}

// ---------------------------------------------------------------------------
// Internal: enumerate all firings of a job within a horizon window
// ---------------------------------------------------------------------------

function firingsInHorizon(
  job: ScheduleJob,
  fromMs: number,
  toMs: number,
): number[] {
  const tz = job.timezone ?? 'UTC'
  const out: number[] = []
  const v = validateExpression(job.kind, job.expression)
  if (!v.valid) return out

  if (job.kind === 'cron') {
    try {
      const it = CronExpressionParser.parse(job.expression.trim(), {
        tz,
        currentDate: new Date(fromMs),
      })
      let guard = 0
      while (guard++ < MAX_FIRINGS_PER_JOB) {
        const next = it.next().toDate().getTime()
        if (next > toMs) break
        out.push(next)
      }
    } catch {
      return out
    }
    return out
  }

  if (job.kind === 'rate') {
    const r = parseRate(job.expression.trim())
    if (!r) return out
    let t = fromMs + r.everyMs
    let guard = 0
    while (t <= toMs && guard++ < MAX_FIRINGS_PER_JOB) {
      out.push(t)
      t += r.everyMs
    }
    return out
  }

  if (job.kind === 'oneoff') {
    const t = Date.parse(job.expression.trim())
    if (!Number.isNaN(t) && t > fromMs && t <= toMs) out.push(t)
    return out
  }

  return out
}

// ---------------------------------------------------------------------------
// computeCollisions
// ---------------------------------------------------------------------------

export function computeCollisions(
  jobs: ScheduleJob[],
  opts: CollisionOptions = {},
): CollisionWindow[] {
  const horizonDays = opts.horizonDays ?? DEFAULT_HORIZON_DAYS
  const threshold = Math.max(2, opts.threshold ?? DEFAULT_THRESHOLD)
  const fromMs = Date.now()
  const toMs = fromMs + horizonDays * DAY_MS

  // minute bucket -> set of job ids
  const buckets = new Map<string, Set<string>>()
  // minute bucket -> resource -> set of job ids
  const resourceBuckets = new Map<string, Map<string, Set<string>>>()

  for (const job of jobs) {
    const firings = firingsInHorizon(job, fromMs, toMs)
    for (const f of firings) {
      const key = isoMinute(f)
      if (!buckets.has(key)) buckets.set(key, new Set())
      buckets.get(key)!.add(job.id)
      const res = job.resourceId
      if (res) {
        if (!resourceBuckets.has(key)) resourceBuckets.set(key, new Map())
        const rb = resourceBuckets.get(key)!
        if (!rb.has(res)) rb.set(res, new Set())
        rb.get(res)!.add(job.id)
      }
    }
  }

  const results: CollisionWindow[] = []
  const seen = new Set<string>()

  for (const [bucket, ids] of buckets) {
    const concurrency = ids.size

    // resource sharing in this bucket
    let resourceHit: { resourceId: string; jobIds: string[] } | null = null
    const rb = resourceBuckets.get(bucket)
    if (rb) {
      for (const [resId, resJobIds] of rb) {
        if (resJobIds.size >= 2) {
          resourceHit = { resourceId: resId, jobIds: [...resJobIds] }
          break
        }
      }
    }

    if (concurrency >= threshold || resourceHit) {
      const windowStart = bucket
      const windowEnd = new Date(Date.parse(bucket) + MINUTE_MS).toISOString()
      let severity: CollisionWindow['severity'] = 'low'
      if (concurrency >= threshold + 3) severity = 'high'
      else if (concurrency >= threshold + 1 || resourceHit) severity = 'medium'

      const dedupeKey = `${windowStart}:${resourceHit?.resourceId ?? ''}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const window: CollisionWindow = {
        windowStart,
        windowEnd,
        jobIds: [...ids].sort(),
        severity,
      }
      if (resourceHit) window.resourceId = resourceHit.resourceId
      results.push(window)
    }
  }

  results.sort((a, b) => a.windowStart.localeCompare(b.windowStart))
  return results
}

// ---------------------------------------------------------------------------
// loadHeatmap
// ---------------------------------------------------------------------------

export function loadHeatmap(
  jobs: ScheduleJob[],
  opts: HeatmapOptions = {},
): HeatmapBucket[] {
  const horizonDays = opts.horizonDays ?? DEFAULT_HORIZON_DAYS
  const fromMs = Date.now()
  const toMs = fromMs + horizonDays * DAY_MS

  // bucket granularity: hour for horizons > 2 days, else minute
  const useHour = horizonDays > 2
  const bucketMs = useHour ? HOUR_MS : MINUTE_MS

  const counts = new Map<number, number>()
  for (const job of jobs) {
    for (const f of firingsInHorizon(job, fromMs, toMs)) {
      const b = Math.floor(f / bucketMs) * bucketMs
      counts.set(b, (counts.get(b) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([b, count]) => ({ bucket: new Date(b).toISOString(), count }))
}

// ---------------------------------------------------------------------------
// dstTraps
// ---------------------------------------------------------------------------

export function dstTraps(
  kind: ScheduleKind,
  expr: string,
  timezone = 'UTC',
  fromISO?: string,
  days = 365,
): DstTrap[] {
  const traps: DstTrap[] = []
  if (timezone === 'UTC') return traps
  const v = validateExpression(kind, expr)
  if (!v.valid) return traps

  const fromMs = fromISO ? Date.parse(fromISO) : Date.now()
  if (Number.isNaN(fromMs)) return traps
  const toMs = fromMs + days * DAY_MS

  // Scan hour-by-hour for offset transitions in the timezone.
  let prevOffset = tzOffsetMinutes(new Date(fromMs), timezone)
  const transitions: { atMs: number; before: number; after: number }[] = []
  for (let t = fromMs + HOUR_MS; t <= toMs; t += HOUR_MS) {
    const off = tzOffsetMinutes(new Date(t), timezone)
    if (off !== prevOffset) {
      // narrow down to the minute within this hour
      let lo = t - HOUR_MS
      let hi = t
      while (hi - lo > MINUTE_MS) {
        const mid = lo + Math.floor((hi - lo) / 2 / MINUTE_MS) * MINUTE_MS
        if (tzOffsetMinutes(new Date(mid), timezone) === prevOffset) lo = mid
        else hi = mid
      }
      transitions.push({ atMs: hi, before: prevOffset, after: off })
      prevOffset = off
    }
  }

  // For each transition, classify and check whether schedule firings land in the gap/overlap.
  for (const tr of transitions) {
    const forward = tr.after > tr.before // spring forward => skip
    const backward = tr.after < tr.before // fall back => double / ambiguous
    const gapMinutes = Math.abs(tr.after - tr.before)

    // Window around the transition to test scheduled firings (the affected local window).
    const windowStart = tr.atMs - gapMinutes * MINUTE_MS
    const windowEnd = tr.atMs + gapMinutes * MINUTE_MS

    const fakeJob: ScheduleJob = { id: '_dst', kind, expression: expr, timezone }
    const firings = firingsInHorizon(fakeJob, windowStart - MINUTE_MS, windowEnd)

    for (const f of firings) {
      if (f < windowStart || f > windowEnd) continue
      const d = new Date(f)
      if (forward) {
        traps.push({ type: 'skip', atLocal: localString(d, timezone), atUtc: d.toISOString() })
      } else if (backward) {
        // ambiguous local time + potential double fire
        traps.push({
          type: 'ambiguous',
          atLocal: localString(d, timezone),
          atUtc: d.toISOString(),
        })
        traps.push({
          type: 'double_fire',
          atLocal: localString(d, timezone),
          atUtc: d.toISOString(),
        })
      }
    }
  }

  // de-dupe identical traps
  const seen = new Set<string>()
  return traps.filter((tp) => {
    const k = `${tp.type}:${tp.atUtc}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// ---------------------------------------------------------------------------
// coverageGaps
// ---------------------------------------------------------------------------

export interface CoverageWindow {
  /** minute-of-week start (0..10079) OR absolute ISO — we accept {startMinute,endMinute} or {start,end} */
  startMinute?: number
  endMinute?: number
  start?: string
  end?: string
}

export function coverageGaps(
  windows: CoverageWindow[],
  jobs: ScheduleJob[],
  opts: HeatmapOptions = {},
): CoverageGap[] {
  const horizonDays = opts.horizonDays ?? DEFAULT_HORIZON_DAYS
  const fromMs = Date.now()
  const toMs = fromMs + horizonDays * DAY_MS

  // Build a set of covered minute-buckets from required windows.
  // Required windows describe when at least one job MUST fire.
  // Collect all firing minutes.
  const fireMinutes = new Set<number>()
  for (const job of jobs) {
    for (const f of firingsInHorizon(job, fromMs, toMs)) {
      fireMinutes.add(Math.floor(f / MINUTE_MS) * MINUTE_MS)
    }
  }

  const gaps: CoverageGap[] = []

  for (const w of windows) {
    let startMs: number
    let endMs: number
    if (w.start && w.end) {
      startMs = Date.parse(w.start)
      endMs = Date.parse(w.end)
    } else if (typeof w.startMinute === 'number' && typeof w.endMinute === 'number') {
      // interpret as offset minutes from fromMs
      startMs = fromMs + w.startMinute * MINUTE_MS
      endMs = fromMs + w.endMinute * MINUTE_MS
    } else {
      continue
    }
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) continue

    // Walk the window minute-by-minute, find contiguous uncovered stretches.
    let gapStart: number | null = null
    for (let t = Math.floor(startMs / MINUTE_MS) * MINUTE_MS; t < endMs; t += MINUTE_MS) {
      const covered = fireMinutes.has(t)
      if (!covered && gapStart === null) gapStart = t
      if (covered && gapStart !== null) {
        gaps.push({
          windowStart: new Date(gapStart).toISOString(),
          windowEnd: new Date(t).toISOString(),
          durationMinutes: Math.round((t - gapStart) / MINUTE_MS),
        })
        gapStart = null
      }
    }
    if (gapStart !== null) {
      gaps.push({
        windowStart: new Date(gapStart).toISOString(),
        windowEnd: new Date(endMs).toISOString(),
        durationMinutes: Math.round((endMs - gapStart) / MINUTE_MS),
      })
    }
  }

  gaps.sort((a, b) => a.windowStart.localeCompare(b.windowStart))
  return gaps
}

// ---------------------------------------------------------------------------
// autoSpread
// ---------------------------------------------------------------------------

export function autoSpread(
  jobs: ScheduleJob[],
  opts: { threshold?: number } = {},
): SpreadSuggestion[] {
  const threshold = Math.max(2, opts.threshold ?? DEFAULT_THRESHOLD)
  const collisions = computeCollisions(jobs, { threshold })
  if (collisions.length === 0) return []

  // Count how many collisions each job participates in.
  const jobCollisionCount = new Map<string, number>()
  for (const col of collisions) {
    for (const id of col.jobIds) {
      jobCollisionCount.set(id, (jobCollisionCount.get(id) ?? 0) + 1)
    }
  }

  const jobById = new Map(jobs.map((j) => [j.id, j]))
  const suggestions: SpreadSuggestion[] = []

  // For each collision window, keep the first job (lowest id) on its slot and
  // suggest staggering the rest by a deterministic minute offset.
  const suggested = new Set<string>()
  for (const col of collisions) {
    const sorted = [...col.jobIds].sort()
    for (let i = 1; i < sorted.length; i++) {
      const id = sorted[i]
      if (suggested.has(id)) continue
      const job = jobById.get(id)
      if (!job) continue
      const offset = i // minutes to shift
      const suggestedExpr = staggerExpression(job, offset)
      suggestions.push({
        jobId: id,
        suggestedExpr,
        reason: `Job collides with ${sorted.length - 1} other job(s) at ${col.windowStart}; stagger by ${offset} minute(s) to spread load`,
      })
      suggested.add(id)
    }
  }

  suggestions.sort((a, b) => a.jobId.localeCompare(b.jobId))
  return suggestions
}

function staggerExpression(job: ScheduleJob, offsetMinutes: number): string {
  if (job.kind === 'cron') {
    const parts = job.expression.trim().split(/\s+/)
    if (parts.length >= 5) {
      const min = parts[0]
      // only shift when minute is a single numeric value
      const num = parseInt(min, 10)
      if (/^\d+$/.test(min) && Number.isFinite(num)) {
        parts[0] = String((num + offsetMinutes) % 60)
        return parts.join(' ')
      }
    }
    return job.expression
  }
  if (job.kind === 'rate') {
    // rate jobs can't carry a phase offset in the "every N" form; recommend cron.
    return job.expression
  }
  if (job.kind === 'oneoff') {
    const t = Date.parse(job.expression.trim())
    if (!Number.isNaN(t)) return new Date(t + offsetMinutes * MINUTE_MS).toISOString()
    return job.expression
  }
  return job.expression
}
