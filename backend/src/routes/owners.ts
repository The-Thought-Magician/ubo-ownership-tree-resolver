import { Hono } from 'hono'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  cases,
  workspaces,
  workspace_members,
  resolutions,
  resolved_owners,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Access helpers
// ---------------------------------------------------------------------------

async function userInWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId))
  if (!ws) return false
  if (ws.owner_id === userId) return true
  const [member] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)))
  return !!member
}

async function userCanReadResolution(resolutionId: string, userId: string) {
  const [resolution] = await db.select().from(resolutions).where(eq(resolutions.id, resolutionId))
  if (!resolution) return { resolution: null, allowed: false }
  const [kase] = await db.select().from(cases).where(eq(cases.id, resolution.case_id))
  if (!kase) return { resolution, allowed: false }
  const allowed = await userInWorkspace(kase.workspace_id, userId)
  return { resolution, allowed }
}

// ---------------------------------------------------------------------------
// GET /?resolution_id= — list resolved owners (BO roster) for a resolution
// ---------------------------------------------------------------------------

router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const resolutionId = c.req.query('resolution_id')
  if (!resolutionId) return c.json({ error: 'resolution_id is required' }, 400)

  const { resolution, allowed } = await userCanReadResolution(resolutionId, userId)
  if (!resolution) return c.json({ error: 'Resolution not found' }, 404)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)

  const rows = await db
    .select()
    .from(resolved_owners)
    .where(eq(resolved_owners.resolution_id, resolutionId))
    .orderBy(desc(resolved_owners.effective_ownership))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /:id — get one resolved owner
// ---------------------------------------------------------------------------

router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [owner] = await db.select().from(resolved_owners).where(eq(resolved_owners.id, id))
  if (!owner) return c.json({ error: 'Not found' }, 404)

  const { allowed } = await userCanReadResolution(owner.resolution_id, userId)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)

  return c.json(owner)
})

export default router
