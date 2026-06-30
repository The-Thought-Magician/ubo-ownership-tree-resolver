import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  control_findings,
  control_worksheet_items,
  cases,
  entities,
  workspace_members,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const findingSchema = z.object({
  case_id: z.string().min(1),
  person_entity_id: z.string().min(1),
  criterion: z.string().min(1),
  basis: z.string().optional().default(''),
  rationale: z.string().optional().default(''),
  determination: z.string().optional().default('control'),
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

// GET /?case_id= — list control findings for a case (auth + membership)
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const caseId = c.req.query('case_id')
  if (!caseId) return c.json({ error: 'case_id is required' }, 400)
  if (!(await userOwnsCase(userId, caseId))) return c.json({ error: 'Forbidden' }, 403)
  const rows = await db
    .select()
    .from(control_findings)
    .where(eq(control_findings.case_id, caseId))
    .orderBy(desc(control_findings.created_at))
  return c.json(rows)
})

// GET /:id — get a finding with its worksheet items
router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [finding] = await db
    .select()
    .from(control_findings)
    .where(eq(control_findings.id, id))
  if (!finding) return c.json({ error: 'Not found' }, 404)
  if (!(await userOwnsCase(userId, finding.case_id))) return c.json({ error: 'Forbidden' }, 403)
  const items = await db
    .select()
    .from(control_worksheet_items)
    .where(eq(control_worksheet_items.finding_id, id))
    .orderBy(control_worksheet_items.created_at)
  return c.json({ finding, items })
})

// POST / — create a finding
router.post('/', authMiddleware, zValidator('json', findingSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  if (!(await userOwnsCase(userId, body.case_id))) return c.json({ error: 'Forbidden' }, 403)
  // Validate the person entity belongs to the same case.
  const [person] = await db.select().from(entities).where(eq(entities.id, body.person_entity_id))
  if (!person || person.case_id !== body.case_id) {
    return c.json({ error: 'person_entity_id must reference an entity in this case' }, 400)
  }
  const [created] = await db
    .insert(control_findings)
    .values({ ...body, created_by: userId })
    .returning()
  return c.json(created, 201)
})

// PUT /:id — update a finding
router.put('/:id', authMiddleware, zValidator('json', findingSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(control_findings)
    .where(eq(control_findings.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await userOwnsCase(userId, existing.case_id))) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  // Do not allow re-homing the finding to another case.
  const { case_id: _ignoredCaseId, ...rest } = body
  if (rest.person_entity_id) {
    const [person] = await db
      .select()
      .from(entities)
      .where(eq(entities.id, rest.person_entity_id))
    if (!person || person.case_id !== existing.case_id) {
      return c.json({ error: 'person_entity_id must reference an entity in this case' }, 400)
    }
  }
  const [updated] = await db
    .update(control_findings)
    .set(rest)
    .where(eq(control_findings.id, id))
    .returning()
  return c.json(updated)
})

// DELETE /:id — delete a finding (and its worksheet items)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(control_findings)
    .where(eq(control_findings.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await userOwnsCase(userId, existing.case_id))) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(control_worksheet_items).where(eq(control_worksheet_items.finding_id, id))
  await db.delete(control_findings).where(eq(control_findings.id, id))
  return c.json({ success: true })
})

export default router
