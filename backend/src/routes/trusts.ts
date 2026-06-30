import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { trusts, cases, entities, workspace_members } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Verify the user is a member of the workspace that owns the given case.
async function userCanAccessCase(userId: string, caseId: string) {
  const [row] = await db
    .select({ caseId: cases.id, workspaceId: cases.workspace_id })
    .from(cases)
    .where(eq(cases.id, caseId))
  if (!row) return { ok: false as const, status: 404 as const }
  const [member] = await db
    .select({ id: workspace_members.id })
    .from(workspace_members)
    .where(
      and(
        eq(workspace_members.workspace_id, row.workspaceId),
        eq(workspace_members.user_id, userId),
      ),
    )
  if (!member) return { ok: false as const, status: 403 as const }
  return { ok: true as const, caseRow: row }
}

const trustSchema = z.object({
  case_id: z.string().min(1),
  entity_id: z.string().min(1),
  trustees: z.array(z.string()).optional().default([]),
  beneficiaries: z.array(z.string()).optional().default([]),
  grantor: z.string().optional().default(''),
  flow_rule: z.enum(['beneficiaries', 'trustees', 'grantor']).optional().default('beneficiaries'),
})

const trustUpdateSchema = z.object({
  trustees: z.array(z.string()).optional(),
  beneficiaries: z.array(z.string()).optional(),
  grantor: z.string().optional(),
  flow_rule: z.enum(['beneficiaries', 'trustees', 'grantor']).optional(),
})

// GET /?case_id= — list trusts in a case
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const caseId = c.req.query('case_id')
  if (!caseId) return c.json({ error: 'case_id is required' }, 400)
  const access = await userCanAccessCase(userId, caseId)
  if (!access.ok) return c.json({ error: access.status === 404 ? 'Case not found' : 'Forbidden' }, access.status)
  const rows = await db
    .select()
    .from(trusts)
    .where(eq(trusts.case_id, caseId))
    .orderBy(desc(trusts.created_at))
  return c.json(rows)
})

// GET /entity/:entityId — get trust detail for an entity
router.get('/entity/:entityId', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const entityId = c.req.param('entityId')
  const [trust] = await db.select().from(trusts).where(eq(trusts.entity_id, entityId))
  if (!trust) return c.json({ error: 'Not found' }, 404)
  const access = await userCanAccessCase(userId, trust.case_id)
  if (!access.ok) return c.json({ error: access.status === 404 ? 'Case not found' : 'Forbidden' }, access.status)
  return c.json(trust)
})

// POST / — create trust detail
router.post('/', authMiddleware, zValidator('json', trustSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const access = await userCanAccessCase(userId, body.case_id)
  if (!access.ok) return c.json({ error: access.status === 404 ? 'Case not found' : 'Forbidden' }, access.status)

  // entity must belong to the same case
  const [entity] = await db.select().from(entities).where(eq(entities.id, body.entity_id))
  if (!entity) return c.json({ error: 'Entity not found' }, 404)
  if (entity.case_id !== body.case_id) return c.json({ error: 'Entity does not belong to case' }, 400)

  // one trust per entity (unique constraint on entity_id)
  const [existing] = await db.select().from(trusts).where(eq(trusts.entity_id, body.entity_id))
  if (existing) return c.json({ error: 'Trust already exists for this entity' }, 409)

  const [created] = await db
    .insert(trusts)
    .values({
      case_id: body.case_id,
      entity_id: body.entity_id,
      trustees: body.trustees,
      beneficiaries: body.beneficiaries,
      grantor: body.grantor,
      flow_rule: body.flow_rule,
      created_by: userId,
    })
    .returning()
  return c.json(created, 201)
})

// PUT /:id — update trust detail
router.put('/:id', authMiddleware, zValidator('json', trustUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(trusts).where(eq(trusts.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const access = await userCanAccessCase(userId, existing.case_id)
  if (!access.ok) return c.json({ error: access.status === 404 ? 'Case not found' : 'Forbidden' }, access.status)
  const body = c.req.valid('json')
  const [updated] = await db.update(trusts).set(body).where(eq(trusts.id, id)).returning()
  return c.json(updated)
})

// DELETE /:id — delete trust detail
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(trusts).where(eq(trusts.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const access = await userCanAccessCase(userId, existing.case_id)
  if (!access.ok) return c.json({ error: access.status === 404 ? 'Case not found' : 'Forbidden' }, access.status)
  await db.delete(trusts).where(eq(trusts.id, id))
  return c.json({ success: true })
})

export default router
