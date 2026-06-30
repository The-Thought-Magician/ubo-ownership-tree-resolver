import { Hono } from 'hono'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  cases,
  workspaces,
  workspace_members,
  resolutions,
  resolved_owners,
  ownership_paths,
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
// GET /?resolution_id= — all ownership paths for a resolution
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
    .from(ownership_paths)
    .where(eq(ownership_paths.resolution_id, resolutionId))
    .orderBy(desc(ownership_paths.path_percentage))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /owner/:ownerId — contributing paths for one resolved owner
// ---------------------------------------------------------------------------

router.get('/owner/:ownerId', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const ownerId = c.req.param('ownerId')

  const [owner] = await db.select().from(resolved_owners).where(eq(resolved_owners.id, ownerId))
  if (!owner) return c.json({ error: 'Resolved owner not found' }, 404)

  const { allowed } = await userCanReadResolution(owner.resolution_id, userId)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)

  const rows = await db
    .select()
    .from(ownership_paths)
    .where(eq(ownership_paths.resolved_owner_id, ownerId))
    .orderBy(desc(ownership_paths.path_percentage))
  return c.json(rows)
})

export default router
