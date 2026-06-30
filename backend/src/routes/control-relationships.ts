import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  control_relationships,
  entities,
  cases,
  workspaces,
  workspace_members,
} from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const relationshipSchema = z.object({
  case_id: z.string().min(1),
  person_entity_id: z.string().min(1),
  controlled_entity_id: z.string().min(1),
  control_type: z.string().min(1),
  description: z.string().optional().default(''),
})

const relationshipUpdateSchema = z
  .object({
    person_entity_id: z.string().min(1),
    controlled_entity_id: z.string().min(1),
    control_type: z.string().min(1),
    description: z.string(),
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

async function entityInCase(entityId: string, caseId: string) {
  const [ent] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.id, entityId), eq(entities.case_id, caseId)))
  return !!ent
}

// List control relationships in a case
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const caseId = c.req.query('case_id')
  if (!caseId) return c.json({ error: 'case_id is required' }, 400)
  const { case: cs, allowed } = await caseForUser(caseId, userId)
  if (!cs) return c.json({ error: 'Case not found' }, 404)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)
  const rows = await db
    .select()
    .from(control_relationships)
    .where(eq(control_relationships.case_id, caseId))
    .orderBy(control_relationships.created_at)
  return c.json(rows)
})

// Create control relationship
router.post('/', authMiddleware, zValidator('json', relationshipSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const { case: cs, allowed } = await caseForUser(body.case_id, userId)
  if (!cs) return c.json({ error: 'Case not found' }, 404)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)
  if (body.person_entity_id === body.controlled_entity_id) {
    return c.json({ error: 'person_entity_id and controlled_entity_id must differ' }, 400)
  }
  if (!(await entityInCase(body.person_entity_id, body.case_id))) {
    return c.json({ error: 'person_entity_id is not an entity in this case' }, 400)
  }
  if (!(await entityInCase(body.controlled_entity_id, body.case_id))) {
    return c.json({ error: 'controlled_entity_id is not an entity in this case' }, 400)
  }
  const [created] = await db
    .insert(control_relationships)
    .values({ ...body, created_by: userId })
    .returning()
  return c.json(created, 201)
})

// Update control relationship
router.put('/:id', authMiddleware, zValidator('json', relationshipUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(control_relationships)
    .where(eq(control_relationships.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const { allowed } = await caseForUser(existing.case_id, userId)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const nextPerson = body.person_entity_id ?? existing.person_entity_id
  const nextControlled = body.controlled_entity_id ?? existing.controlled_entity_id
  if (nextPerson === nextControlled) {
    return c.json({ error: 'person_entity_id and controlled_entity_id must differ' }, 400)
  }
  if (body.person_entity_id && !(await entityInCase(body.person_entity_id, existing.case_id))) {
    return c.json({ error: 'person_entity_id is not an entity in this case' }, 400)
  }
  if (
    body.controlled_entity_id &&
    !(await entityInCase(body.controlled_entity_id, existing.case_id))
  ) {
    return c.json({ error: 'controlled_entity_id is not an entity in this case' }, 400)
  }
  const [updated] = await db
    .update(control_relationships)
    .set(body)
    .where(eq(control_relationships.id, id))
    .returning()
  return c.json(updated)
})

// Delete control relationship
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(control_relationships)
    .where(eq(control_relationships.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const { allowed } = await caseForUser(existing.case_id, userId)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(control_relationships).where(eq(control_relationships.id, id))
  return c.json({ success: true })
})

export default router
