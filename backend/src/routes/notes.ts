import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { notes, cases, entities, control_findings, workspace_members } from '../db/schema.js'
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

const noteSchema = z.object({
  case_id: z.string().min(1),
  entity_id: z.string().min(1).nullish(),
  finding_id: z.string().min(1).nullish(),
  body: z.string().min(1),
})

// GET /?case_id= — list notes (optionally by entity_id/finding_id)
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const caseId = c.req.query('case_id')
  const entityId = c.req.query('entity_id')
  const findingId = c.req.query('finding_id')
  if (!caseId) return c.json({ error: 'case_id is required' }, 400)
  const access = await userCanAccessCase(userId, caseId)
  if (!access.ok) return c.json({ error: access.status === 404 ? 'Case not found' : 'Forbidden' }, access.status)
  const conditions = [eq(notes.case_id, caseId)]
  if (entityId) conditions.push(eq(notes.entity_id, entityId))
  if (findingId) conditions.push(eq(notes.finding_id, findingId))
  const rows = await db
    .select()
    .from(notes)
    .where(and(...conditions))
    .orderBy(desc(notes.created_at))
  return c.json(rows)
})

// POST / — create note
router.post('/', authMiddleware, zValidator('json', noteSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const access = await userCanAccessCase(userId, body.case_id)
  if (!access.ok) return c.json({ error: access.status === 404 ? 'Case not found' : 'Forbidden' }, access.status)

  if (body.entity_id) {
    const [entity] = await db.select().from(entities).where(eq(entities.id, body.entity_id))
    if (!entity) return c.json({ error: 'Entity not found' }, 404)
    if (entity.case_id !== body.case_id) return c.json({ error: 'Entity does not belong to case' }, 400)
  }
  if (body.finding_id) {
    const [finding] = await db.select().from(control_findings).where(eq(control_findings.id, body.finding_id))
    if (!finding) return c.json({ error: 'Finding not found' }, 404)
    if (finding.case_id !== body.case_id) return c.json({ error: 'Finding does not belong to case' }, 400)
  }

  const [created] = await db
    .insert(notes)
    .values({
      case_id: body.case_id,
      entity_id: body.entity_id ?? null,
      finding_id: body.finding_id ?? null,
      body: body.body,
      created_by: userId,
    })
    .returning()
  return c.json(created, 201)
})

// DELETE /:id — delete note (author only)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(notes).where(eq(notes.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const access = await userCanAccessCase(userId, existing.case_id)
  if (!access.ok) return c.json({ error: access.status === 404 ? 'Case not found' : 'Forbidden' }, access.status)
  if (existing.created_by !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(notes).where(eq(notes.id, id))
  return c.json({ success: true })
})

export default router
