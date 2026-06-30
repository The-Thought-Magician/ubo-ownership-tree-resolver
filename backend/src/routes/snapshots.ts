import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  snapshots,
  snapshot_entities,
  snapshot_edges,
  entities,
  ownership_edges,
  control_relationships,
  control_findings,
  control_worksheet_items,
  trusts,
  documents,
  notes,
  cases,
  workspace_members,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const createSchema = z.object({
  case_id: z.string().min(1),
  label: z.string().min(1),
})

// Confirm the user is a member of the workspace that owns the given case.
async function userOwnsCase(userId: string, caseId: string): Promise<boolean> {
  const [cs] = await db.select().from(cases).where(eq(cases.id, caseId))
  if (!cs) return false
  const [member] = await db
    .select()
    .from(workspace_members)
    .where(
      and(
        eq(workspace_members.workspace_id, cs.workspace_id),
        eq(workspace_members.user_id, userId),
      ),
    )
  return !!member
}

// GET /?case_id= — list snapshots for a case
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const caseId = c.req.query('case_id')
  if (!caseId) return c.json({ error: 'case_id is required' }, 400)
  if (!(await userOwnsCase(userId, caseId))) return c.json({ error: 'Forbidden' }, 403)
  const rows = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.case_id, caseId))
    .orderBy(desc(snapshots.created_at))
  return c.json(rows)
})

// GET /:id — get a snapshot with its frozen entities + edges
router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [snapshot] = await db.select().from(snapshots).where(eq(snapshots.id, id))
  if (!snapshot) return c.json({ error: 'Not found' }, 404)
  if (!(await userOwnsCase(userId, snapshot.case_id))) return c.json({ error: 'Forbidden' }, 403)
  const snapEntities = await db
    .select()
    .from(snapshot_entities)
    .where(eq(snapshot_entities.snapshot_id, id))
    .orderBy(snapshot_entities.created_at)
  const snapEdges = await db
    .select()
    .from(snapshot_edges)
    .where(eq(snapshot_edges.snapshot_id, id))
    .orderBy(snapshot_edges.created_at)
  return c.json({ snapshot, entities: snapEntities, edges: snapEdges })
})

// POST / — freeze the current graph into a new snapshot
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const { case_id, label } = c.req.valid('json')
  if (!(await userOwnsCase(userId, case_id))) return c.json({ error: 'Forbidden' }, 403)

  const currentEntities = await db.select().from(entities).where(eq(entities.case_id, case_id))
  const currentEdges = await db
    .select()
    .from(ownership_edges)
    .where(eq(ownership_edges.case_id, case_id))

  const [snapshot] = await db
    .insert(snapshots)
    .values({
      case_id,
      label,
      entity_count: currentEntities.length,
      edge_count: currentEdges.length,
      created_by: userId,
    })
    .returning()

  for (const e of currentEntities) {
    await db.insert(snapshot_entities).values({
      snapshot_id: snapshot.id,
      original_entity_id: e.id,
      name: e.name,
      entity_type: e.entity_type,
      is_natural_person: e.is_natural_person,
      is_target: e.is_target,
    })
  }
  for (const edge of currentEdges) {
    await db.insert(snapshot_edges).values({
      snapshot_id: snapshot.id,
      owner_entity_id: edge.owner_entity_id,
      owned_entity_id: edge.owned_entity_id,
      percentage: edge.percentage,
      edge_type: edge.edge_type,
    })
  }

  return c.json(snapshot, 201)
})

// POST /:id/restore — restore the snapshot into the working graph
router.post('/:id/restore', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [snapshot] = await db.select().from(snapshots).where(eq(snapshots.id, id))
  if (!snapshot) return c.json({ error: 'Not found' }, 404)
  const caseId = snapshot.case_id
  if (!(await userOwnsCase(userId, caseId))) return c.json({ error: 'Forbidden' }, 403)

  const snapEntities = await db
    .select()
    .from(snapshot_entities)
    .where(eq(snapshot_entities.snapshot_id, id))
  const snapEdges = await db
    .select()
    .from(snapshot_edges)
    .where(eq(snapshot_edges.snapshot_id, id))

  // Tear down the current working graph for this case, respecting FK order.
  // Entity-dependent rows go first, then edges, then entities.
  const caseFindings = await db
    .select()
    .from(control_findings)
    .where(eq(control_findings.case_id, caseId))
  for (const f of caseFindings) {
    await db.delete(control_worksheet_items).where(eq(control_worksheet_items.finding_id, f.id))
  }
  await db.delete(notes).where(eq(notes.case_id, caseId))
  await db.delete(control_findings).where(eq(control_findings.case_id, caseId))
  await db.delete(control_relationships).where(eq(control_relationships.case_id, caseId))
  await db.delete(trusts).where(eq(trusts.case_id, caseId))
  await db.delete(documents).where(eq(documents.case_id, caseId))
  await db.delete(ownership_edges).where(eq(ownership_edges.case_id, caseId))
  await db.delete(entities).where(eq(entities.case_id, caseId))

  // Recreate entities preserving their original ids so edges resolve correctly.
  for (const e of snapEntities) {
    await db.insert(entities).values({
      id: e.original_entity_id,
      case_id: caseId,
      name: e.name,
      entity_type: e.entity_type,
      is_natural_person: e.is_natural_person,
      is_target: e.is_target,
      created_by: userId,
    })
  }
  for (const edge of snapEdges) {
    await db.insert(ownership_edges).values({
      case_id: caseId,
      owner_entity_id: edge.owner_entity_id,
      owned_entity_id: edge.owned_entity_id,
      percentage: edge.percentage,
      edge_type: edge.edge_type,
      created_by: userId,
    })
  }

  return c.json({ success: true })
})

// DELETE /:id — delete a snapshot (and its frozen rows)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [snapshot] = await db.select().from(snapshots).where(eq(snapshots.id, id))
  if (!snapshot) return c.json({ error: 'Not found' }, 404)
  if (!(await userOwnsCase(userId, snapshot.case_id))) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(snapshot_edges).where(eq(snapshot_edges.snapshot_id, id))
  await db.delete(snapshot_entities).where(eq(snapshot_entities.snapshot_id, id))
  await db.delete(snapshots).where(eq(snapshots.id, id))
  return c.json({ success: true })
})

export default router
