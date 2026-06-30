import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { workspaces, workspace_members, audit_log } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const createSchema = z.object({
  name: z.string().min(1),
  default_threshold: z.number().min(0).max(100).optional(),
})

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  default_threshold: z.number().min(0).max(100).optional(),
})

// Membership check: returns the member row if the user belongs to the workspace.
async function getMembership(workspaceId: string, userId: string) {
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)))
  return m ?? null
}

// GET / — list workspaces the user belongs to
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const memberships = await db
    .select()
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
  const ids = memberships.map((m) => m.workspace_id)
  if (ids.length === 0) return c.json([])
  const all = await db.select().from(workspaces).orderBy(desc(workspaces.created_at))
  const idSet = new Set(ids)
  return c.json(all.filter((w) => idSet.has(w.id)))
})

// GET /:id — get one workspace (membership-checked)
router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id))
  if (!ws) return c.json({ error: 'Not found' }, 404)
  const membership = await getMembership(id, userId)
  if (!membership) return c.json({ error: 'Forbidden' }, 403)
  return c.json(ws)
})

// POST / — create workspace (creator added as owner member)
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [ws] = await db
    .insert(workspaces)
    .values({
      name: body.name,
      owner_id: userId,
      default_threshold: body.default_threshold ?? 25,
    })
    .returning()
  await db.insert(workspace_members).values({
    workspace_id: ws.id,
    user_id: userId,
    role: 'owner',
  })
  await db.insert(audit_log).values({
    workspace_id: ws.id,
    user_id: userId,
    action: 'workspace.create',
    target_type: 'workspace',
    target_id: ws.id,
    detail: { name: ws.name },
  })
  return c.json(ws, 201)
})

// PUT /:id — update workspace name/default_threshold (owner)
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id))
  if (!ws) return c.json({ error: 'Not found' }, 404)
  if (ws.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.default_threshold !== undefined) patch.default_threshold = body.default_threshold
  if (Object.keys(patch).length === 0) return c.json(ws)
  const [updated] = await db.update(workspaces).set(patch).where(eq(workspaces.id, id)).returning()
  await db.insert(audit_log).values({
    workspace_id: id,
    user_id: userId,
    action: 'workspace.update',
    target_type: 'workspace',
    target_id: id,
    detail: patch,
  })
  return c.json(updated)
})

// DELETE /:id — delete workspace (owner)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id))
  if (!ws) return c.json({ error: 'Not found' }, 404)
  if (ws.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(workspace_members).where(eq(workspace_members.workspace_id, id))
  await db.delete(workspaces).where(eq(workspaces.id, id))
  return c.json({ success: true })
})

export default router
