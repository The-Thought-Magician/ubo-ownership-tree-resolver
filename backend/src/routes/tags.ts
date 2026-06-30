import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { tags, case_tags, cases, workspace_members } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

async function isMember(workspaceId: string, userId: string): Promise<boolean> {
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(
      and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)),
    )
  return !!m
}

// GET /?workspace_id= — list tags in a workspace
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const workspaceId = c.req.query('workspace_id')
  if (!workspaceId) return c.json({ error: 'workspace_id is required' }, 400)
  if (!(await isMember(workspaceId, userId))) return c.json({ error: 'Forbidden' }, 403)

  const rows = await db
    .select()
    .from(tags)
    .where(eq(tags.workspace_id, workspaceId))
    .orderBy(desc(tags.created_at))
  return c.json(rows)
})

const createSchema = z.object({
  workspace_id: z.string().min(1),
  name: z.string().min(1).max(64),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'color must be a hex value like #aabbcc')
    .optional()
    .default('#888888'),
})

// POST / — create a tag in a workspace
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const { workspace_id, name, color } = c.req.valid('json')
  if (!(await isMember(workspace_id, userId))) return c.json({ error: 'Forbidden' }, 403)

  // Enforce UNIQUE(workspace_id, name) with a friendly error.
  const [existing] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.workspace_id, workspace_id), eq(tags.name, name)))
  if (existing) return c.json({ error: 'A tag with that name already exists' }, 409)

  const [tag] = await db.insert(tags).values({ workspace_id, name, color }).returning()
  return c.json(tag, 201)
})

// DELETE /:id — delete a tag (and its case assignments)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [tag] = await db.select().from(tags).where(eq(tags.id, id))
  if (!tag) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(tag.workspace_id, userId))) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(case_tags).where(eq(case_tags.tag_id, id))
  await db.delete(tags).where(eq(tags.id, id))
  return c.json({ success: true })
})

const assignSchema = z.object({
  case_id: z.string().min(1),
  tag_id: z.string().min(1),
})

// Resolve a (case_id, tag_id) pair, confirming both belong to the same workspace
// that the user is a member of.
async function resolveAssign(caseId: string, tagId: string, userId: string) {
  const [kase] = await db.select().from(cases).where(eq(cases.id, caseId))
  if (!kase) return { error: 'Case not found', status: 404 as const }
  const [tag] = await db.select().from(tags).where(eq(tags.id, tagId))
  if (!tag) return { error: 'Tag not found', status: 404 as const }
  if (tag.workspace_id !== kase.workspace_id) {
    return { error: 'Tag and case belong to different workspaces', status: 400 as const }
  }
  if (!(await isMember(kase.workspace_id, userId))) {
    return { error: 'Forbidden', status: 403 as const }
  }
  return { kase, tag }
}

// POST /assign — assign a tag to a case
router.post('/assign', authMiddleware, zValidator('json', assignSchema), async (c) => {
  const userId = getUserId(c)
  const { case_id, tag_id } = c.req.valid('json')
  const resolved = await resolveAssign(case_id, tag_id, userId)
  if ('error' in resolved) return c.json({ error: resolved.error }, resolved.status)

  const [existing] = await db
    .select()
    .from(case_tags)
    .where(and(eq(case_tags.case_id, case_id), eq(case_tags.tag_id, tag_id)))
  if (existing) return c.json(existing)

  const [ct] = await db.insert(case_tags).values({ case_id, tag_id }).returning()
  return c.json(ct, 201)
})

// POST /unassign — remove a tag from a case
router.post('/unassign', authMiddleware, zValidator('json', assignSchema), async (c) => {
  const userId = getUserId(c)
  const { case_id, tag_id } = c.req.valid('json')
  const resolved = await resolveAssign(case_id, tag_id, userId)
  if ('error' in resolved) return c.json({ error: resolved.error }, resolved.status)

  await db
    .delete(case_tags)
    .where(and(eq(case_tags.case_id, case_id), eq(case_tags.tag_id, tag_id)))
  return c.json({ success: true })
})

export default router
