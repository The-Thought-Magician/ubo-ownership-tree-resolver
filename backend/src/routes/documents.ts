import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { documents, cases, entities, workspace_members } from '../db/schema.js'
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

const documentSchema = z.object({
  case_id: z.string().min(1),
  entity_id: z.string().min(1).nullish(),
  title: z.string().min(1),
  url: z.string().optional().default(''),
  content: z.string().optional().default(''),
  doc_type: z.string().optional().default('other'),
})

const documentUpdateSchema = z.object({
  entity_id: z.string().min(1).nullish(),
  title: z.string().min(1).optional(),
  url: z.string().optional(),
  content: z.string().optional(),
  doc_type: z.string().optional(),
})

// GET /?case_id= — list documents (optionally by entity_id)
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const caseId = c.req.query('case_id')
  const entityId = c.req.query('entity_id')
  if (!caseId) return c.json({ error: 'case_id is required' }, 400)
  const access = await userCanAccessCase(userId, caseId)
  if (!access.ok) return c.json({ error: access.status === 404 ? 'Case not found' : 'Forbidden' }, access.status)
  const conditions = [eq(documents.case_id, caseId)]
  if (entityId) conditions.push(eq(documents.entity_id, entityId))
  const rows = await db
    .select()
    .from(documents)
    .where(and(...conditions))
    .orderBy(desc(documents.created_at))
  return c.json(rows)
})

// POST / — create document
router.post('/', authMiddleware, zValidator('json', documentSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const access = await userCanAccessCase(userId, body.case_id)
  if (!access.ok) return c.json({ error: access.status === 404 ? 'Case not found' : 'Forbidden' }, access.status)

  if (body.entity_id) {
    const [entity] = await db.select().from(entities).where(eq(entities.id, body.entity_id))
    if (!entity) return c.json({ error: 'Entity not found' }, 404)
    if (entity.case_id !== body.case_id) return c.json({ error: 'Entity does not belong to case' }, 400)
  }

  const [created] = await db
    .insert(documents)
    .values({
      case_id: body.case_id,
      entity_id: body.entity_id ?? null,
      title: body.title,
      url: body.url,
      content: body.content,
      doc_type: body.doc_type,
      created_by: userId,
    })
    .returning()
  return c.json(created, 201)
})

// PUT /:id — update document
router.put('/:id', authMiddleware, zValidator('json', documentUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(documents).where(eq(documents.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const access = await userCanAccessCase(userId, existing.case_id)
  if (!access.ok) return c.json({ error: access.status === 404 ? 'Case not found' : 'Forbidden' }, access.status)
  const body = c.req.valid('json')

  if (body.entity_id) {
    const [entity] = await db.select().from(entities).where(eq(entities.id, body.entity_id))
    if (!entity) return c.json({ error: 'Entity not found' }, 404)
    if (entity.case_id !== existing.case_id) return c.json({ error: 'Entity does not belong to case' }, 400)
  }

  const [updated] = await db.update(documents).set(body).where(eq(documents.id, id)).returning()
  return c.json(updated)
})

// DELETE /:id — delete document
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(documents).where(eq(documents.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const access = await userCanAccessCase(userId, existing.case_id)
  if (!access.ok) return c.json({ error: access.status === 404 ? 'Case not found' : 'Forbidden' }, access.status)
  await db.delete(documents).where(eq(documents.id, id))
  return c.json({ success: true })
})

export default router
