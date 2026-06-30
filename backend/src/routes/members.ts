import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { workspaces, workspace_members, audit_log } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const addSchema = z.object({
  workspace_id: z.string().min(1),
  user_id: z.string().min(1),
  role: z.string().min(1).optional(),
})

const roleSchema = z.object({
  role: z.string().min(1),
})

// Returns true if userId is the workspace owner (owner-gated mutations).
async function isOwner(workspaceId: string, userId: string): Promise<boolean> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId))
  if (!ws) return false
  return ws.owner_id === userId
}

async function isMember(workspaceId: string, userId: string): Promise<boolean> {
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)))
  return !!m
}

// GET /?workspace_id= — list members of a workspace (any member can read)
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const workspaceId = c.req.query('workspace_id')
  if (!workspaceId) return c.json({ error: 'workspace_id is required' }, 400)
  if (!(await isMember(workspaceId, userId))) return c.json({ error: 'Forbidden' }, 403)
  const members = await db
    .select()
    .from(workspace_members)
    .where(eq(workspace_members.workspace_id, workspaceId))
    .orderBy(desc(workspace_members.created_at))
  return c.json(members)
})

// POST / — add member (owner)
router.post('/', authMiddleware, zValidator('json', addSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  if (!(await isOwner(body.workspace_id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const [existing] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, body.workspace_id), eq(workspace_members.user_id, body.user_id)))
  if (existing) return c.json({ error: 'User is already a member' }, 409)
  const [member] = await db
    .insert(workspace_members)
    .values({
      workspace_id: body.workspace_id,
      user_id: body.user_id,
      role: body.role ?? 'member',
    })
    .returning()
  await db.insert(audit_log).values({
    workspace_id: body.workspace_id,
    user_id: userId,
    action: 'member.add',
    target_type: 'member',
    target_id: member.id,
    detail: { user_id: body.user_id, role: member.role },
  })
  return c.json(member, 201)
})

// PUT /:id — change member role (owner)
router.put('/:id', authMiddleware, zValidator('json', roleSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [member] = await db.select().from(workspace_members).where(eq(workspace_members.id, id))
  if (!member) return c.json({ error: 'Not found' }, 404)
  if (!(await isOwner(member.workspace_id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(workspace_members)
    .set({ role: body.role })
    .where(eq(workspace_members.id, id))
    .returning()
  await db.insert(audit_log).values({
    workspace_id: member.workspace_id,
    user_id: userId,
    action: 'member.update',
    target_type: 'member',
    target_id: id,
    detail: { role: body.role },
  })
  return c.json(updated)
})

// DELETE /:id — remove member (owner)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [member] = await db.select().from(workspace_members).where(eq(workspace_members.id, id))
  if (!member) return c.json({ error: 'Not found' }, 404)
  if (!(await isOwner(member.workspace_id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, member.workspace_id))
  if (ws && ws.owner_id === member.user_id) {
    return c.json({ error: 'Cannot remove the workspace owner' }, 400)
  }
  await db.delete(workspace_members).where(eq(workspace_members.id, id))
  await db.insert(audit_log).values({
    workspace_id: member.workspace_id,
    user_id: userId,
    action: 'member.remove',
    target_type: 'member',
    target_id: id,
    detail: { user_id: member.user_id },
  })
  return c.json({ success: true })
})

export default router
