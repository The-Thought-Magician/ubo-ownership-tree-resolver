import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { workspaces, workspace_members, cases, case_tags, audit_log } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const createSchema = z.object({
  workspace_id: z.string().min(1),
  name: z.string().min(1),
  target_entity_id: z.string().optional(),
  status: z.string().min(1).optional(),
  assignee_id: z.string().optional(),
  threshold: z.number().min(0).max(100).optional(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  assignee_id: z.string().nullable().optional(),
  threshold: z.number().min(0).max(100).optional(),
  target_entity_id: z.string().nullable().optional(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

async function isMember(workspaceId: string, userId: string): Promise<boolean> {
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)))
  return !!m
}

// Resolve workspace membership for a given case by id.
async function caseMembership(caseId: string, userId: string) {
  const [cs] = await db.select().from(cases).where(eq(cases.id, caseId))
  if (!cs) return { case: null, member: false }
  return { case: cs, member: await isMember(cs.workspace_id, userId) }
}

// GET /?workspace_id= — list cases in workspace (filter status/assignee/tag)
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const workspaceId = c.req.query('workspace_id')
  if (!workspaceId) return c.json({ error: 'workspace_id is required' }, 400)
  if (!(await isMember(workspaceId, userId))) return c.json({ error: 'Forbidden' }, 403)

  let rows = await db
    .select()
    .from(cases)
    .where(eq(cases.workspace_id, workspaceId))
    .orderBy(desc(cases.created_at))

  const status = c.req.query('status')
  const assignee = c.req.query('assignee_id')
  const tagId = c.req.query('tag_id')

  if (status) rows = rows.filter((r) => r.status === status)
  if (assignee) rows = rows.filter((r) => r.assignee_id === assignee)

  if (tagId) {
    const links = await db.select().from(case_tags).where(eq(case_tags.tag_id, tagId))
    const allowed = new Set(links.map((l) => l.case_id))
    rows = rows.filter((r) => allowed.has(r.id))
  }

  return c.json(rows)
})

// GET /:id — get case detail
router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const { case: cs, member } = await caseMembership(id, userId)
  if (!cs) return c.json({ error: 'Not found' }, 404)
  if (!member) return c.json({ error: 'Forbidden' }, 403)
  return c.json(cs)
})

// POST / — create case
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  if (!(await isMember(body.workspace_id, userId))) return c.json({ error: 'Forbidden' }, 403)

  // default threshold from workspace when not supplied
  let threshold = body.threshold
  if (threshold === undefined) {
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, body.workspace_id))
    threshold = ws?.default_threshold ?? 25
  }

  const [cs] = await db
    .insert(cases)
    .values({
      workspace_id: body.workspace_id,
      name: body.name,
      target_entity_id: body.target_entity_id ?? null,
      status: body.status ?? 'draft',
      assignee_id: body.assignee_id ?? null,
      threshold,
      description: body.description ?? '',
      metadata: body.metadata ?? {},
      created_by: userId,
    })
    .returning()
  await db.insert(audit_log).values({
    workspace_id: body.workspace_id,
    case_id: cs.id,
    user_id: userId,
    action: 'case.create',
    target_type: 'case',
    target_id: cs.id,
    detail: { name: cs.name },
  })
  return c.json(cs, 201)
})

// PUT /:id — update case (name/status/assignee/threshold/target_entity_id)
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const { case: cs, member } = await caseMembership(id, userId)
  if (!cs) return c.json({ error: 'Not found' }, 404)
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.status !== undefined) patch.status = body.status
  if (body.assignee_id !== undefined) patch.assignee_id = body.assignee_id
  if (body.threshold !== undefined) patch.threshold = body.threshold
  if (body.target_entity_id !== undefined) patch.target_entity_id = body.target_entity_id
  if (body.description !== undefined) patch.description = body.description
  if (body.metadata !== undefined) patch.metadata = body.metadata
  patch.updated_at = new Date()

  const [updated] = await db.update(cases).set(patch).where(eq(cases.id, id)).returning()
  await db.insert(audit_log).values({
    workspace_id: cs.workspace_id,
    case_id: id,
    user_id: userId,
    action: 'case.update',
    target_type: 'case',
    target_id: id,
    detail: patch as Record<string, unknown>,
  })
  return c.json(updated)
})

// DELETE /:id — delete case
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const { case: cs, member } = await caseMembership(id, userId)
  if (!cs) return c.json({ error: 'Not found' }, 404)
  if (!member) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(case_tags).where(eq(case_tags.case_id, id))
  await db.delete(cases).where(eq(cases.id, id))
  await db.insert(audit_log).values({
    workspace_id: cs.workspace_id,
    case_id: id,
    user_id: userId,
    action: 'case.delete',
    target_type: 'case',
    target_id: id,
    detail: { name: cs.name },
  })
  return c.json({ success: true })
})

export default router
