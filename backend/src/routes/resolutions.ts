import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  cases,
  workspaces,
  workspace_members,
  entities,
  ownership_edges,
  control_relationships,
  control_findings,
  trusts,
  resolutions,
  resolved_owners,
  ownership_paths,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const NEAR_THRESHOLD_BAND = 5 // within 5 percentage points below threshold => near

const runSchema = z.object({
  case_id: z.string().min(1),
  threshold: z.number().min(0).max(100).optional(),
})

// ---------------------------------------------------------------------------
// Access helpers
// ---------------------------------------------------------------------------

async function userInWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId))
  if (!ws) return false
  if (ws.owner_id === userId) return true
  const [member] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)))
  return !!member
}

async function loadCaseForUser(caseId: string, userId: string) {
  const [kase] = await db.select().from(cases).where(eq(cases.id, caseId))
  if (!kase) return { kase: null, allowed: false }
  const allowed = await userInWorkspace(kase.workspace_id, userId)
  return { kase, allowed }
}

// ---------------------------------------------------------------------------
// Resolution engine: cycle-safe upward traversal multiplying percentages
// ---------------------------------------------------------------------------

interface PathAccumulator {
  personId: string
  personName: string
  pathEntityIds: string[]
  pathLabels: string[]
  pathPercentage: number // 0..100
}

interface EngineResult {
  paths: PathAccumulator[]
  warnings: string[]
}

function runEngine(
  targetId: string,
  entityList: (typeof entities.$inferSelect)[],
  edgeList: (typeof ownership_edges.$inferSelect)[],
): EngineResult {
  const warnings: string[] = []
  const byId = new Map<string, typeof entities.$inferSelect>()
  for (const e of entityList) byId.set(e.id, e)

  // Incoming edges keyed by owned entity -> list of (owner, percentage)
  const ownersOf = new Map<string, { ownerId: string; pct: number }[]>()
  for (const edge of edgeList) {
    if (edge.percentage < 0 || edge.percentage > 100) {
      warnings.push(
        `Edge ${edge.owner_entity_id} -> ${edge.owned_entity_id} has out-of-range percentage ${edge.percentage}`,
      )
    }
    if (!ownersOf.has(edge.owned_entity_id)) ownersOf.set(edge.owned_entity_id, [])
    ownersOf.get(edge.owned_entity_id)!.push({ ownerId: edge.owner_entity_id, pct: edge.percentage })
  }

  // Warn on owned entities whose direct ownership sums to far over/under 100.
  for (const [ownedId, list] of ownersOf) {
    const sum = list.reduce((a, b) => a + b.pct, 0)
    if (sum > 100.01) {
      const ent = byId.get(ownedId)
      warnings.push(
        `Direct ownership of ${ent?.name ?? ownedId} sums to ${sum.toFixed(2)}% (exceeds 100%)`,
      )
    }
  }

  const completedPaths: PathAccumulator[] = []

  // DFS upward from target. visited tracks the current path stack to break cycles.
  function walk(
    currentId: string,
    accPct: number,
    pathIds: string[],
    pathLabels: string[],
    onStack: Set<string>,
  ) {
    const owners = ownersOf.get(currentId) ?? []
    for (const { ownerId, pct } of owners) {
      const owner = byId.get(ownerId)
      if (!owner) continue

      if (onStack.has(ownerId)) {
        warnings.push(
          `Circular ownership detected involving ${owner.name}; cycle truncated to avoid infinite loop`,
        )
        continue
      }

      const fraction = pct / 100
      const nextPct = accPct * fraction
      const nextIds = [...pathIds, ownerId]
      const nextLabels = [...pathLabels, owner.name]

      if (owner.is_natural_person) {
        // Terminal: a natural person at the top of this branch.
        completedPaths.push({
          personId: ownerId,
          personName: owner.name,
          pathEntityIds: nextIds,
          pathLabels: nextLabels,
          pathPercentage: nextPct * 100,
        })
        // A natural person may also be owned by other entities (rare); continue
        // walking upward so indirect holdings through them are still captured.
      }

      const nextStack = new Set(onStack)
      nextStack.add(ownerId)
      walk(ownerId, nextPct, nextIds, nextLabels, nextStack)
    }
  }

  const target = byId.get(targetId)
  if (target) {
    walk(targetId, 1, [targetId], [target.name], new Set([targetId]))
  } else {
    warnings.push('Target entity not found in case graph')
  }

  return { paths: completedPaths, warnings }
}

// ---------------------------------------------------------------------------
// GET /?case_id= — list resolution runs for a case
// ---------------------------------------------------------------------------

router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const caseId = c.req.query('case_id')
  if (!caseId) return c.json({ error: 'case_id is required' }, 400)
  const { kase, allowed } = await loadCaseForUser(caseId, userId)
  if (!kase) return c.json({ error: 'Case not found' }, 404)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)

  const rows = await db
    .select()
    .from(resolutions)
    .where(eq(resolutions.case_id, caseId))
    .orderBy(desc(resolutions.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /:id — resolution with resolved owners
// ---------------------------------------------------------------------------

router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [resolution] = await db.select().from(resolutions).where(eq(resolutions.id, id))
  if (!resolution) return c.json({ error: 'Not found' }, 404)
  const { allowed } = await loadCaseForUser(resolution.case_id, userId)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)

  const owners = await db
    .select()
    .from(resolved_owners)
    .where(eq(resolved_owners.resolution_id, id))
    .orderBy(desc(resolved_owners.effective_ownership))
  return c.json({ resolution, owners })
})

// ---------------------------------------------------------------------------
// POST / — run a resolution
// ---------------------------------------------------------------------------

router.post('/', authMiddleware, zValidator('json', runSchema), async (c) => {
  const userId = getUserId(c)
  const { case_id, threshold: thresholdOverride } = c.req.valid('json')

  const { kase, allowed } = await loadCaseForUser(case_id, userId)
  if (!kase) return c.json({ error: 'Case not found' }, 404)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)

  const threshold = thresholdOverride ?? kase.threshold ?? 25

  // Load the working graph for this case.
  const entityList = await db.select().from(entities).where(eq(entities.case_id, case_id))
  const edgeList = await db.select().from(ownership_edges).where(eq(ownership_edges.case_id, case_id))
  const controlRels = await db
    .select()
    .from(control_relationships)
    .where(eq(control_relationships.case_id, case_id))
  const findings = await db
    .select()
    .from(control_findings)
    .where(eq(control_findings.case_id, case_id))
  const trustRows = await db.select().from(trusts).where(eq(trusts.case_id, case_id))

  const warnings: string[] = []

  // Determine the target entity.
  let targetId = kase.target_entity_id ?? ''
  if (!targetId) {
    const flagged = entityList.find((e) => e.is_target)
    if (flagged) targetId = flagged.id
  }
  if (!targetId) {
    warnings.push('No target entity configured on the case; resolution has no anchor')
  }

  const engine = targetId
    ? runEngine(targetId, entityList, edgeList)
    : { paths: [], warnings: [] as string[] }
  warnings.push(...engine.warnings)

  // Aggregate per natural-person effective ownership across all contributing paths.
  const byPerson = new Map<
    string,
    { name: string; effective: number; paths: PathAccumulator[] }
  >()
  for (const p of engine.paths) {
    const cur = byPerson.get(p.personId) ?? { name: p.personName, effective: 0, paths: [] }
    cur.effective += p.pathPercentage
    cur.paths.push(p)
    byPerson.set(p.personId, cur)
  }

  // Substantial-control signal: a person is a controller if they have a
  // recorded control_relationship, a control finding with determination
  // 'control', or are a trustee of a trust in this case.
  const controllers = new Set<string>()
  for (const rel of controlRels) controllers.add(rel.person_entity_id)
  for (const f of findings) {
    if (f.determination === 'control') controllers.add(f.person_entity_id)
  }
  // Trust trustees flow control toward the trust's beneficiaries/trustees.
  const entityByName = new Map<string, string>()
  for (const e of entityList) entityByName.set(e.name.trim().toLowerCase(), e.id)
  for (const t of trustRows) {
    const trustees = (t.trustees ?? []) as string[]
    const beneficiaries = (t.beneficiaries ?? []) as string[]
    const flowing = t.flow_rule === 'trustees' ? trustees : beneficiaries
    for (const name of flowing) {
      const eid = entityByName.get(String(name).trim().toLowerCase())
      if (eid) controllers.add(eid)
    }
  }

  // Build the resolution record.
  const inputsHash = `e${entityList.length}:o${edgeList.length}:c${controlRels.length}:f${findings.length}:t${threshold}`

  // Create the resolution row first so child rows can reference it.
  const [resolution] = await db
    .insert(resolutions)
    .values({
      case_id,
      threshold,
      inputs_hash: inputsHash,
      qualifying_count: 0,
      control_count: 0,
      warnings,
      status: 'complete',
      created_by: userId,
    })
    .returning()

  // Persons that are controllers but appear nowhere in ownership paths still
  // need a resolved_owner row (control-only beneficial owners).
  const allPersonIds = new Set<string>(byPerson.keys())
  for (const cid of controllers) {
    const ent = entityList.find((e) => e.id === cid)
    if (ent && ent.is_natural_person) allPersonIds.add(cid)
  }

  let qualifyingCount = 0
  let controlCount = 0
  const ownerRows: (typeof resolved_owners.$inferSelect)[] = []

  for (const personId of allPersonIds) {
    const agg = byPerson.get(personId)
    const ent = entityList.find((e) => e.id === personId)
    const personName = agg?.name ?? ent?.name ?? personId
    const effective = agg?.effective ?? 0
    const meetsOwnership = effective + 1e-9 >= threshold
    const meetsControl = controllers.has(personId)
    const nearThreshold =
      !meetsOwnership && effective >= Math.max(0, threshold - NEAR_THRESHOLD_BAND)

    if (meetsOwnership) qualifyingCount++
    if (meetsControl) controlCount++

    const [row] = await db
      .insert(resolved_owners)
      .values({
        resolution_id: resolution.id,
        person_entity_id: personId,
        person_name: personName,
        effective_ownership: effective,
        meets_ownership_threshold: meetsOwnership,
        meets_substantial_control: meetsControl,
        near_threshold: nearThreshold,
      })
      .returning()
    ownerRows.push(row)

    // Persist contributing ownership paths for this resolved owner.
    const paths = agg?.paths ?? []
    for (const p of paths) {
      await db.insert(ownership_paths).values({
        resolved_owner_id: row.id,
        resolution_id: resolution.id,
        path_entity_ids: p.pathEntityIds,
        path_labels: p.pathLabels,
        path_percentage: p.pathPercentage,
      })
    }
  }

  // Update the counts on the resolution now that owners are known.
  const [updatedResolution] = await db
    .update(resolutions)
    .set({ qualifying_count: qualifyingCount, control_count: controlCount })
    .where(eq(resolutions.id, resolution.id))
    .returning()

  const sortedOwners = ownerRows.sort((a, b) => b.effective_ownership - a.effective_ownership)

  return c.json({ resolution: updatedResolution, owners: sortedOwners }, 201)
})

// ---------------------------------------------------------------------------
// DELETE /:id — delete a resolution (and its children)
// ---------------------------------------------------------------------------

router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [resolution] = await db.select().from(resolutions).where(eq(resolutions.id, id))
  if (!resolution) return c.json({ error: 'Not found' }, 404)
  const { allowed } = await loadCaseForUser(resolution.case_id, userId)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)
  if (resolution.created_by !== userId) {
    // Allow workspace members to delete, but keep an ownership preference:
    // any member of the workspace may delete a resolution in their case.
  }

  await db.delete(ownership_paths).where(eq(ownership_paths.resolution_id, id))
  await db.delete(resolved_owners).where(eq(resolved_owners.resolution_id, id))
  await db.delete(resolutions).where(eq(resolutions.id, id))
  return c.json({ success: true })
})

export default router
