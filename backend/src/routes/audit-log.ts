import { Hono } from 'hono'
import { db } from '../db/index.js'
import { audit_log, workspace_members } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Confirm the caller is a member of the workspace.
async function isMember(workspaceId: string, userId: string): Promise<boolean> {
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)))
  return !!m
}

// GET /?workspace_id=  (optional case_id filter) — immutable audit-trail read
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const workspaceId = c.req.query('workspace_id')
  if (!workspaceId) return c.json({ error: 'workspace_id is required' }, 400)

  if (!(await isMember(workspaceId, userId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const caseId = c.req.query('case_id')
  const conditions = [eq(audit_log.workspace_id, workspaceId)]
  if (caseId) conditions.push(eq(audit_log.case_id, caseId))

  const rows = await db
    .select()
    .from(audit_log)
    .where(and(...conditions))
    .orderBy(desc(audit_log.created_at))

  return c.json(rows)
})

export default router
