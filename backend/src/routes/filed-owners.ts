import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { filed_owners, cases, workspace_members } from '../db/schema.js'
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
// GET /?case_id=  — list filed/declared owners for a case
// ---------------------------------------------------------------------------

router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const caseId = c.req.query('case_id')
  if (!caseId) return c.json({ error: 'case_id is required' }, 400)
  const guard = await caseForUser(caseId, userId)
  if (!guard.ok) return c.json({ error: guard.error }, guard.status)
  const rows = await db
    .select()
    .from(filed_owners)
    .where(eq(filed_owners.case_id, caseId))
    .orderBy(desc(filed_owners.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST /  — add a filed owner
// ---------------------------------------------------------------------------

const createSchema = z.object({
  case_id: z.string().min(1),
  person_name: z.string().min(1),
  declared_ownership: z.number().min(0).max(100).optional().default(0),
  declared_control: z.boolean().optional().default(false),
  filing_reference: z.string().optional().default(''),
})

router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const guard = await caseForUser(body.case_id, userId)
  if (!guard.ok) return c.json({ error: guard.error }, guard.status)
  const [row] = await db
    .insert(filed_owners)
    .values({
      case_id: body.case_id,
      person_name: body.person_name,
      declared_ownership: body.declared_ownership,
      declared_control: body.declared_control,
      filing_reference: body.filing_reference,
      created_by: userId,
    })
    .returning()
  return c.json(row, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id  — update a filed owner
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  person_name: z.string().min(1).optional(),
  declared_ownership: z.number().min(0).max(100).optional(),
  declared_control: z.boolean().optional(),
  filing_reference: z.string().optional(),
})

router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(filed_owners).where(eq(filed_owners.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const guard = await caseForUser(existing.case_id, userId)
  if (!guard.ok) return c.json({ error: guard.error }, guard.status)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(filed_owners)
    .set(body)
    .where(eq(filed_owners.id, id))
    .returning()
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id  — delete a filed owner
// ---------------------------------------------------------------------------

router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(filed_owners).where(eq(filed_owners.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const guard = await caseForUser(existing.case_id, userId)
  if (!guard.ok) return c.json({ error: guard.error }, guard.status)
  await db.delete(filed_owners).where(eq(filed_owners.id, id))
  return c.json({ success: true })
})

export default router
