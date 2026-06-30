import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  diffs,
  cases,
  workspace_members,
  snapshots,
  snapshot_entities,
  snapshot_edges,
  resolutions,
  resolved_owners,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Ownership helper: a case belongs to a workspace; the user must be a member.
// ---------------------------------------------------------------------------

async function caseForUser(caseId: string, userId: string) {
  const [c] = await db.select().from(cases).where(eq(cases.id, caseId))
  if (!c) return { ok: false as const, status: 404 as const, error: 'Case not found' }
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(
      and(
        eq(workspace_members.workspace_id, c.workspace_id),
        eq(workspace_members.user_id, userId),
      ),
    )
  if (!m) return { ok: false as const, status: 403 as const, error: 'Forbidden' }
  return { ok: true as const, case: c }
}

// ---------------------------------------------------------------------------
// Diff computation
// ---------------------------------------------------------------------------

interface EntityRow {
  original_entity_id: string
  name: string
  entity_type: string
  is_natural_person: boolean
  is_target: boolean
}

interface EdgeRow {
  owner_entity_id: string
  owned_entity_id: string
  percentage: number
  edge_type: string
}

function diffSnapshotGraphs(
  fromEntities: EntityRow[],
  toEntities: EntityRow[],
  fromEdges: EdgeRow[],
  toEdges: EdgeRow[],
) {
  const fromEntMap = new Map(fromEntities.map((e) => [e.original_entity_id, e]))
  const toEntMap = new Map(toEntities.map((e) => [e.original_entity_id, e]))

  const addedEntities: EntityRow[] = []
  const removedEntities: EntityRow[] = []
  const changedEntities: { id: string; before: EntityRow; after: EntityRow; fields: string[] }[] = []

  for (const e of toEntities) {
    const prev = fromEntMap.get(e.original_entity_id)
    if (!prev) {
      addedEntities.push(e)
    } else {
      const fields: string[] = []
      if (prev.name !== e.name) fields.push('name')
      if (prev.entity_type !== e.entity_type) fields.push('entity_type')
      if (prev.is_natural_person !== e.is_natural_person) fields.push('is_natural_person')
      if (prev.is_target !== e.is_target) fields.push('is_target')
      if (fields.length > 0) changedEntities.push({ id: e.original_entity_id, before: prev, after: e, fields })
    }
  }
  for (const e of fromEntities) {
    if (!toEntMap.has(e.original_entity_id)) removedEntities.push(e)
  }

  const edgeKey = (e: EdgeRow) => `${e.owner_entity_id}->${e.owned_entity_id}`
  const fromEdgeMap = new Map(fromEdges.map((e) => [edgeKey(e), e]))
  const toEdgeMap = new Map(toEdges.map((e) => [edgeKey(e), e]))

  const addedEdges: EdgeRow[] = []
  const removedEdges: EdgeRow[] = []
  const changedEdges: { key: string; before: EdgeRow; after: EdgeRow; deltaPercentage: number }[] = []

  for (const e of toEdges) {
    const prev = fromEdgeMap.get(edgeKey(e))
    if (!prev) {
      addedEdges.push(e)
    } else if (prev.percentage !== e.percentage || prev.edge_type !== e.edge_type) {
      changedEdges.push({
        key: edgeKey(e),
        before: prev,
        after: e,
        deltaPercentage: e.percentage - prev.percentage,
      })
    }
  }
  for (const e of fromEdges) {
    if (!toEdgeMap.has(edgeKey(e))) removedEdges.push(e)
  }

  return {
    type: 'snapshot' as const,
    summary: {
      entities_added: addedEntities.length,
      entities_removed: removedEntities.length,
      entities_changed: changedEntities.length,
      edges_added: addedEdges.length,
      edges_removed: removedEdges.length,
      edges_changed: changedEdges.length,
    },
    addedEntities,
    removedEntities,
    changedEntities,
    addedEdges,
    removedEdges,
    changedEdges,
  }
}

interface OwnerRow {
  person_entity_id: string
  person_name: string
  effective_ownership: number
  meets_ownership_threshold: boolean
  meets_substantial_control: boolean
  near_threshold: boolean
}

function diffResolutionOwners(fromOwners: OwnerRow[], toOwners: OwnerRow[]) {
  const fromMap = new Map(fromOwners.map((o) => [o.person_entity_id, o]))
  const toMap = new Map(toOwners.map((o) => [o.person_entity_id, o]))

  const added: OwnerRow[] = []
  const removed: OwnerRow[] = []
  const changed: {
    person_entity_id: string
    person_name: string
    before: OwnerRow
    after: OwnerRow
    deltaOwnership: number
    thresholdFlipped: boolean
    controlFlipped: boolean
  }[] = []

  for (const o of toOwners) {
    const prev = fromMap.get(o.person_entity_id)
    if (!prev) {
      added.push(o)
    } else {
      const deltaOwnership = o.effective_ownership - prev.effective_ownership
      const thresholdFlipped = prev.meets_ownership_threshold !== o.meets_ownership_threshold
      const controlFlipped = prev.meets_substantial_control !== o.meets_substantial_control
      if (deltaOwnership !== 0 || thresholdFlipped || controlFlipped) {
        changed.push({
          person_entity_id: o.person_entity_id,
          person_name: o.person_name,
          before: prev,
          after: o,
          deltaOwnership,
          thresholdFlipped,
          controlFlipped,
        })
      }
    }
  }
  for (const o of fromOwners) {
    if (!toMap.has(o.person_entity_id)) removed.push(o)
  }

  return {
    type: 'resolution' as const,
    summary: {
      owners_added: added.length,
      owners_removed: removed.length,
      owners_changed: changed.length,
    },
    added,
    removed,
    changed,
  }
}

// ---------------------------------------------------------------------------
// GET /?case_id=  — list saved diffs for a case (auth + membership)
// ---------------------------------------------------------------------------

router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const caseId = c.req.query('case_id')
  if (!caseId) return c.json({ error: 'case_id is required' }, 400)
  const guard = await caseForUser(caseId, userId)
  if (!guard.ok) return c.json({ error: guard.error }, guard.status)
  const rows = await db
    .select()
    .from(diffs)
    .where(eq(diffs.case_id, caseId))
    .orderBy(desc(diffs.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /:id  — get one saved diff (auth + membership via its case)
// ---------------------------------------------------------------------------

router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const [d] = await db.select().from(diffs).where(eq(diffs.id, c.req.param('id')))
  if (!d) return c.json({ error: 'Not found' }, 404)
  const guard = await caseForUser(d.case_id, userId)
  if (!guard.ok) return c.json({ error: guard.error }, guard.status)
  return c.json(d)
})

// ---------------------------------------------------------------------------
// POST /snapshots  — compute + persist a diff between two snapshots
// ---------------------------------------------------------------------------

const snapshotDiffSchema = z.object({
  from_snapshot_id: z.string().min(1),
  to_snapshot_id: z.string().min(1),
})

router.post('/snapshots', authMiddleware, zValidator('json', snapshotDiffSchema), async (c) => {
  const userId = getUserId(c)
  const { from_snapshot_id, to_snapshot_id } = c.req.valid('json')

  const [fromSnap] = await db.select().from(snapshots).where(eq(snapshots.id, from_snapshot_id))
  const [toSnap] = await db.select().from(snapshots).where(eq(snapshots.id, to_snapshot_id))
  if (!fromSnap || !toSnap) return c.json({ error: 'Snapshot not found' }, 404)
  if (fromSnap.case_id !== toSnap.case_id) {
    return c.json({ error: 'Snapshots belong to different cases' }, 400)
  }
  const guard = await caseForUser(fromSnap.case_id, userId)
  if (!guard.ok) return c.json({ error: guard.error }, guard.status)

  const [fromEntities, toEntities, fromEdges, toEdges] = await Promise.all([
    db.select().from(snapshot_entities).where(eq(snapshot_entities.snapshot_id, from_snapshot_id)),
    db.select().from(snapshot_entities).where(eq(snapshot_entities.snapshot_id, to_snapshot_id)),
    db.select().from(snapshot_edges).where(eq(snapshot_edges.snapshot_id, from_snapshot_id)),
    db.select().from(snapshot_edges).where(eq(snapshot_edges.snapshot_id, to_snapshot_id)),
  ])

  const result = diffSnapshotGraphs(
    fromEntities as EntityRow[],
    toEntities as EntityRow[],
    fromEdges as EdgeRow[],
    toEdges as EdgeRow[],
  )

  const [saved] = await db
    .insert(diffs)
    .values({
      case_id: fromSnap.case_id,
      from_snapshot_id,
      to_snapshot_id,
      result: result as unknown as Record<string, unknown>,
      created_by: userId,
    })
    .returning()
  return c.json(saved, 201)
})

// ---------------------------------------------------------------------------
// POST /resolutions  — compute + persist a diff between two resolutions
// ---------------------------------------------------------------------------

const resolutionDiffSchema = z.object({
  from_resolution_id: z.string().min(1),
  to_resolution_id: z.string().min(1),
})

router.post('/resolutions', authMiddleware, zValidator('json', resolutionDiffSchema), async (c) => {
  const userId = getUserId(c)
  const { from_resolution_id, to_resolution_id } = c.req.valid('json')

  const [fromRes] = await db.select().from(resolutions).where(eq(resolutions.id, from_resolution_id))
  const [toRes] = await db.select().from(resolutions).where(eq(resolutions.id, to_resolution_id))
  if (!fromRes || !toRes) return c.json({ error: 'Resolution not found' }, 404)
  if (fromRes.case_id !== toRes.case_id) {
    return c.json({ error: 'Resolutions belong to different cases' }, 400)
  }
  const guard = await caseForUser(fromRes.case_id, userId)
  if (!guard.ok) return c.json({ error: guard.error }, guard.status)

  const [fromOwners, toOwners] = await Promise.all([
    db.select().from(resolved_owners).where(eq(resolved_owners.resolution_id, from_resolution_id)),
    db.select().from(resolved_owners).where(eq(resolved_owners.resolution_id, to_resolution_id)),
  ])

  const result = diffResolutionOwners(fromOwners as OwnerRow[], toOwners as OwnerRow[])

  const [saved] = await db
    .insert(diffs)
    .values({
      case_id: fromRes.case_id,
      from_resolution_id,
      to_resolution_id,
      result: result as unknown as Record<string, unknown>,
      created_by: userId,
    })
    .returning()
  return c.json(saved, 201)
})

export default router
