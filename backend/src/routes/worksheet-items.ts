import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  control_worksheet_items,
  control_findings,
  cases,
  workspace_members,
} from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const createSchema = z.object({
  finding_id: z.string().min(1),
  label: z.string().min(1),
  value: z.string().optional().default(''),
  evidence_document_id: z.string().optional().nullable(),
  satisfied: z.boolean().optional().default(false),
})

const updateSchema = z.object({
  label: z.string().min(1).optional(),
  value: z.string().optional(),
  evidence_document_id: z.string().nullable().optional(),
  satisfied: z.boolean().optional(),
})

// Confirm the user belongs to the workspace that owns the case behind a finding.
async function userOwnsFinding(userId: string, findingId: string) {
  const [finding] = await db
    .select()
    .from(control_findings)
    .where(eq(control_findings.id, findingId))
  if (!finding) return { ok: false as const, missing: true as const }
  const [cs] = await db.select().from(cases).where(eq(cases.id, finding.case_id))
  if (!cs) return { ok: false as const, missing: true as const }
  const [member] = await db
    .select()
    .from(workspace_members)
    .where(
      and(
        eq(workspace_members.workspace_id, cs.workspace_id),
        eq(workspace_members.user_id, userId),
      ),
    )
  return { ok: !!member, missing: false as const, finding }
}

// GET /?finding_id= — list worksheet items for a finding
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const findingId = c.req.query('finding_id')
  if (!findingId) return c.json({ error: 'finding_id is required' }, 400)
  const access = await userOwnsFinding(userId, findingId)
  if (access.missing) return c.json({ error: 'Not found' }, 404)
  if (!access.ok) return c.json({ error: 'Forbidden' }, 403)
  const rows = await db
    .select()
    .from(control_worksheet_items)
    .where(eq(control_worksheet_items.finding_id, findingId))
    .orderBy(control_worksheet_items.created_at)
  return c.json(rows)
})

// POST / — create a worksheet item
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const access = await userOwnsFinding(userId, body.finding_id)
  if (access.missing) return c.json({ error: 'Finding not found' }, 404)
  if (!access.ok) return c.json({ error: 'Forbidden' }, 403)
  const [created] = await db
    .insert(control_worksheet_items)
    .values({
      finding_id: body.finding_id,
      label: body.label,
      value: body.value,
      evidence_document_id: body.evidence_document_id ?? null,
      satisfied: body.satisfied,
    })
    .returning()
  return c.json(created, 201)
})

// PUT /:id — update an item (value/satisfied/evidence/label)
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(control_worksheet_items)
    .where(eq(control_worksheet_items.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const access = await userOwnsFinding(userId, existing.finding_id)
  if (!access.ok) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(control_worksheet_items)
    .set(body)
    .where(eq(control_worksheet_items.id, id))
    .returning()
  return c.json(updated)
})

// DELETE /:id — delete an item
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(control_worksheet_items)
    .where(eq(control_worksheet_items.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const access = await userOwnsFinding(userId, existing.finding_id)
  if (!access.ok) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(control_worksheet_items).where(eq(control_worksheet_items.id, id))
  return c.json({ success: true })
})

export default router
