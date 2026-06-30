import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ownership_edges, entities, cases, workspaces, workspace_members } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const edgeSchema = z.object({
  case_id: z.string().min(1),
  owner_entity_id: z.string().min(1),
  owned_entity_id: z.string().min(1),
  percentage: z.number().min(0).max(100),
  edge_type: z.string().optional().default('equity'),
  notes: z.string().optional().default(''),
})

const edgeUpdateSchema = z
  .object({
    owner_entity_id: z.string().min(1),
    owned_entity_id: z.string().min(1),
    percentage: z.number().min(0).max(100),
    edge_type: z.string(),
    notes: z.string(),
  })
  .partial()

async function caseForUser(caseId: string, userId: string) {
  const [cs] = await db.select().from(cases).where(eq(cases.id, caseId))
  if (!cs) return { case: null, allowed: false }
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, cs.workspace_id))
  if (!ws) return { case: cs, allowed: false }
  if (ws.owner_id === userId) return { case: cs, allowed: true }
  const [member] = await db
    .select()
    .from(workspace_members)
    .where(
      and(eq(workspace_members.workspace_id, cs.workspace_id), eq(workspace_members.user_id, userId)),
    )
  return { case: cs, allowed: !!member }
}

// Validate that an entity exists and belongs to the given case.
async function entityInCase(entityId: string, caseId: string) {
  const [ent] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.id, entityId), eq(entities.case_id, caseId)))
  return !!ent
}

// List ownership edges in a case
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const caseId = c.req.query('case_id')
  if (!caseId) return c.json({ error: 'case_id is required' }, 400)
  const { case: cs, allowed } = await caseForUser(caseId, userId)
  if (!cs) return c.json({ error: 'Case not found' }, 404)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)
  const rows = await db
    .select()
    .from(ownership_edges)
    .where(eq(ownership_edges.case_id, caseId))
    .orderBy(ownership_edges.created_at)
  return c.json(rows)
})

// Create edge (validates owner != owned, percentage 0-100, both entities in case)
router.post('/', authMiddleware, zValidator('json', edgeSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const { case: cs, allowed } = await caseForUser(body.case_id, userId)
  if (!cs) return c.json({ error: 'Case not found' }, 404)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)
  if (body.owner_entity_id === body.owned_entity_id) {
    return c.json({ error: 'owner_entity_id and owned_entity_id must differ' }, 400)
  }
  if (!(await entityInCase(body.owner_entity_id, body.case_id))) {
    return c.json({ error: 'owner_entity_id is not an entity in this case' }, 400)
  }
  if (!(await entityInCase(body.owned_entity_id, body.case_id))) {
    return c.json({ error: 'owned_entity_id is not an entity in this case' }, 400)
  }
  const [created] = await db
    .insert(ownership_edges)
    .values({ ...body, created_by: userId })
    .returning()
  return c.json(created, 201)
})

// Update edge
router.put('/:id', authMiddleware, zValidator('json', edgeUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(ownership_edges).where(eq(ownership_edges.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const { allowed } = await caseForUser(existing.case_id, userId)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const nextOwner = body.owner_entity_id ?? existing.owner_entity_id
  const nextOwned = body.owned_entity_id ?? existing.owned_entity_id
  if (nextOwner === nextOwned) {
    return c.json({ error: 'owner_entity_id and owned_entity_id must differ' }, 400)
  }
  if (body.owner_entity_id && !(await entityInCase(body.owner_entity_id, existing.case_id))) {
    return c.json({ error: 'owner_entity_id is not an entity in this case' }, 400)
  }
  if (body.owned_entity_id && !(await entityInCase(body.owned_entity_id, existing.case_id))) {
    return c.json({ error: 'owned_entity_id is not an entity in this case' }, 400)
  }
  const [updated] = await db
    .update(ownership_edges)
    .set(body)
    .where(eq(ownership_edges.id, id))
    .returning()
  return c.json(updated)
})

// Delete edge
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(ownership_edges).where(eq(ownership_edges.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const { allowed } = await caseForUser(existing.case_id, userId)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(ownership_edges).where(eq(ownership_edges.id, id))
  return c.json({ success: true })
})

export default router
