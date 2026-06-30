import { Hono } from 'hono'
import { db } from '../db/index.js'
import {
  workspaces,
  workspace_members,
  cases,
  resolutions,
  resolved_owners,
  discrepancies,
} from '../db/schema.js'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Auth-gated: workspace overview metrics.
// GET /?workspace_id=
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const workspaceId = c.req.query('workspace_id')
  if (!workspaceId) return c.json({ error: 'workspace_id is required' }, 400)

  // Workspace + membership check.
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId))
  if (!ws) return c.json({ error: 'Workspace not found' }, 404)
  const [member] = await db
    .select()
    .from(workspace_members)
    .where(
      and(
        eq(workspace_members.workspace_id, workspaceId),
        eq(workspace_members.user_id, userId),
      ),
    )
  if (!member && ws.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  // All cases in the workspace.
  const workspaceCases = await db
    .select()
    .from(cases)
    .where(eq(cases.workspace_id, workspaceId))
    .orderBy(desc(cases.updated_at))

  const caseIds = workspaceCases.map((cs) => cs.id)
  const totalCases = workspaceCases.length
  const openCases = workspaceCases.filter(
    (cs) => cs.status !== 'closed' && cs.status !== 'resolved',
  ).length

  // Cases-with-discrepancies (distinct case ids that have stored discrepancy rows).
  const casesWithDiscrepancies = new Set<string>()
  let totalDiscrepancies = 0
  let highSeverityDiscrepancies = 0

  // Resolution-derived metrics.
  let totalQualifyingOwners = 0
  let totalControlOwners = 0
  const nearThresholdAlerts: Array<{
    case_id: string
    case_name: string
    resolution_id: string
    person_name: string
    effective_ownership: number
    threshold: number
  }> = []

  // Most-recently-resolved cases (one entry per case, newest resolution).
  const recentlyResolved: Array<{
    case_id: string
    case_name: string
    resolution_id: string
    qualifying_count: number
    control_count: number
    resolved_at: string
  }> = []

  if (caseIds.length > 0) {
    const caseNameById = new Map(workspaceCases.map((cs) => [cs.id, cs.name]))
    const caseThresholdById = new Map(workspaceCases.map((cs) => [cs.id, cs.threshold]))

    // Discrepancies across all workspace cases.
    const discRows = await db
      .select()
      .from(discrepancies)
      .where(inArray(discrepancies.case_id, caseIds))
    for (const d of discRows) {
      casesWithDiscrepancies.add(d.case_id)
      totalDiscrepancies += 1
      if (d.severity === 'high' || d.severity === 'critical') highSeverityDiscrepancies += 1
    }

    // Resolutions across all workspace cases, newest first.
    const resRows = await db
      .select()
      .from(resolutions)
      .where(inArray(resolutions.case_id, caseIds))
      .orderBy(desc(resolutions.created_at))

    // Latest resolution per case → recently-resolved + qualifying tallies.
    const seenCase = new Set<string>()
    const latestResolutionIds: string[] = []
    for (const r of resRows) {
      if (seenCase.has(r.case_id)) continue
      seenCase.add(r.case_id)
      latestResolutionIds.push(r.id)
      totalQualifyingOwners += r.qualifying_count
      totalControlOwners += r.control_count
      recentlyResolved.push({
        case_id: r.case_id,
        case_name: caseNameById.get(r.case_id) ?? '',
        resolution_id: r.id,
        qualifying_count: r.qualifying_count,
        control_count: r.control_count,
        resolved_at:
          r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      })
    }

    // Near-threshold alerts: resolved owners flagged near_threshold on the
    // latest resolution of each case.
    if (latestResolutionIds.length > 0) {
      const owners = await db
        .select()
        .from(resolved_owners)
        .where(inArray(resolved_owners.resolution_id, latestResolutionIds))

      const resolutionToCase = new Map<string, string>()
      for (const r of resRows) {
        if (latestResolutionIds.includes(r.id)) resolutionToCase.set(r.id, r.case_id)
      }

      for (const o of owners) {
        if (!o.near_threshold) continue
        const cid = resolutionToCase.get(o.resolution_id)
        if (!cid) continue
        nearThresholdAlerts.push({
          case_id: cid,
          case_name: caseNameById.get(cid) ?? '',
          resolution_id: o.resolution_id,
          person_name: o.person_name,
          effective_ownership: o.effective_ownership,
          threshold: caseThresholdById.get(cid) ?? ws.default_threshold,
        })
      }
      nearThresholdAlerts.sort((a, b) => b.effective_ownership - a.effective_ownership)
    }
  }

  // Trim the "recent" lists to a sensible size for the overview cards.
  const recentCases = workspaceCases.slice(0, 5).map((cs) => ({
    id: cs.id,
    name: cs.name,
    status: cs.status,
    threshold: cs.threshold,
    updated_at:
      cs.updated_at instanceof Date ? cs.updated_at.toISOString() : String(cs.updated_at),
  }))

  return c.json({
    workspace: { id: ws.id, name: ws.name, default_threshold: ws.default_threshold },
    metrics: {
      total_cases: totalCases,
      open_cases: openCases,
      cases_with_discrepancies: casesWithDiscrepancies.size,
      total_discrepancies: totalDiscrepancies,
      high_severity_discrepancies: highSeverityDiscrepancies,
      qualifying_owner_count: totalQualifyingOwners,
      control_owner_count: totalControlOwners,
      near_threshold_count: nearThresholdAlerts.length,
    },
    recent_cases: recentCases,
    recently_resolved: recentlyResolved.slice(0, 5),
    near_threshold_alerts: nearThresholdAlerts.slice(0, 10),
  })
})

export default router
