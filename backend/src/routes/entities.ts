import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { entities, cases, workspaces, workspace_members } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const entitySchema = z.object({
  case_id: z.string().min(1),
  name: z.string().min(1),
  entity_type: z.string().min(1),
  jurisdiction: z.string().optional().default(''),
  registration_number: z.string().optional().default(''),
  formation_date: z.string().optional().default(''),
  is_natural_person: z.boolean().optional().default(false),
  is_target: z.boolean().optional().default(false),
  attributes: z.record(z.string(), z.unknown()).optional().default({}),
})

const entityUpdateSchema = entitySchema.partial().omit({ case_id: true })

// Returns the case row if the user can access it (workspace owner or member), else null.
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

// List entities in a case
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const caseId = c.req.query('case_id')
  if (!caseId) return c.json({ error: 'case_id is required' }, 400)
  const { case: cs, allowed } = await caseForUser(caseId, userId)
  if (!cs) return c.json({ error: 'Case not found' }, 404)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)
  const rows = await db
    .select()
    .from(entities)
    .where(eq(entities.case_id, caseId))
    .orderBy(entities.created_at)
  return c.json(rows)
})

// Get one entity
router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const [ent] = await db.select().from(entities).where(eq(entities.id, c.req.param('id')))
  if (!ent) return c.json({ error: 'Not found' }, 404)
  const { allowed } = await caseForUser(ent.case_id, userId)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)
  return c.json(ent)
})

// Create entity
router.post('/', authMiddleware, zValidator('json', entitySchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const { case: cs, allowed } = await caseForUser(body.case_id, userId)
  if (!cs) return c.json({ error: 'Case not found' }, 404)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)
  const [created] = await db
    .insert(entities)
    .values({ ...body, created_by: userId })
    .returning()
  // Keep the case target_entity_id in sync when an entity is flagged as the target.
  if (body.is_target) {
    await db
      .update(cases)
      .set({ target_entity_id: created.id, updated_at: new Date() })
      .where(eq(cases.id, body.case_id))
  }
  return c.json(created, 201)
})

// Update entity
router.put('/:id', authMiddleware, zValidator('json', entityUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(entities).where(eq(entities.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const { allowed } = await caseForUser(existing.case_id, userId)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db.update(entities).set(body).where(eq(entities.id, id)).returning()
  if (body.is_target === true) {
    await db
      .update(cases)
      .set({ target_entity_id: id, updated_at: new Date() })
      .where(eq(cases.id, existing.case_id))
  }
  return c.json(updated)
})

// Delete entity
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(entities).where(eq(entities.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const { allowed } = await caseForUser(existing.case_id, userId)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(entities).where(eq(entities.id, id))
  // Clear the case target pointer if it referenced this entity.
  await db
    .update(cases)
    .set({ target_entity_id: null, updated_at: new Date() })
    .where(and(eq(cases.id, existing.case_id), eq(cases.target_entity_id, id)))
  return c.json({ success: true })
})

export default router
