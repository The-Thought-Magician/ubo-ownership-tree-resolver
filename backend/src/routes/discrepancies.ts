import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  discrepancies,
  filed_owners,
  resolutions,
  resolved_owners,
  cases,
  workspace_members,
} from '../db/schema.js'
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

function norm(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

const OWNERSHIP_TOLERANCE = 0.01

// ---------------------------------------------------------------------------
// GET /?case_id=  — list stored discrepancies for a case
// ---------------------------------------------------------------------------

router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const caseId = c.req.query('case_id')
  if (!caseId) return c.json({ error: 'case_id is required' }, 400)
  const guard = await caseForUser(caseId, userId)
  if (!guard.ok) return c.json({ error: guard.error }, guard.status)
  const rows = await db
    .select()
    .from(discrepancies)
    .where(eq(discrepancies.case_id, caseId))
    .orderBy(desc(discrepancies.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST /detect  — compute discrepancies between a resolution and the filed set
// (persists fresh rows; replaces any prior rows for this resolution)
// ---------------------------------------------------------------------------

const detectSchema = z.object({
  case_id: z.string().min(1),
  resolution_id: z.string().min(1),
})

interface NewDiscrepancy {
  case_id: string
  resolution_id: string
  kind: string
  person_name: string
  computed_value: number | null
  filed_value: number | null
  severity: string
  detail: string
}

router.post('/detect', authMiddleware, zValidator('json', detectSchema), async (c) => {
  const userId = getUserId(c)
  const { case_id, resolution_id } = c.req.valid('json')

  const guard = await caseForUser(case_id, userId)
  if (!guard.ok) return c.json({ error: guard.error }, guard.status)

  const [resolution] = await db.select().from(resolutions).where(eq(resolutions.id, resolution_id))
  if (!resolution) return c.json({ error: 'Resolution not found' }, 404)
  if (resolution.case_id !== case_id) {
    return c.json({ error: 'Resolution does not belong to this case' }, 400)
  }

  const [computed, filed] = await Promise.all([
    db.select().from(resolved_owners).where(eq(resolved_owners.resolution_id, resolution_id)),
    db.select().from(filed_owners).where(eq(filed_owners.case_id, case_id)),
  ])

  const filedByName = new Map(filed.map((f) => [norm(f.person_name), f]))
  const computedByName = new Map(computed.map((o) => [norm(o.person_name), o]))

  const findings: NewDiscrepancy[] = []

  // Walk computed beneficial owners and compare against the filed set.
  for (const o of computed) {
    const isBeneficialOwner = o.meets_ownership_threshold || o.meets_substantial_control
    const filedMatch = filedByName.get(norm(o.person_name))

    if (!filedMatch) {
      if (isBeneficialOwner) {
        findings.push({
          case_id,
          resolution_id,
          kind: 'undisclosed_owner',
          person_name: o.person_name,
          computed_value: o.effective_ownership,
          filed_value: null,
          severity: 'high',
          detail: `Computed beneficial owner with ${o.effective_ownership.toFixed(2)}% effective ownership${o.meets_substantial_control ? ' and substantial control' : ''} is absent from the filed set.`,
        })
      }
      continue
    }

    // Ownership mismatch
    const delta = o.effective_ownership - filedMatch.declared_ownership
    if (Math.abs(delta) > OWNERSHIP_TOLERANCE) {
      const overOrUnder = delta > 0 ? 'understated' : 'overstated'
      const severity = Math.abs(delta) >= 5 ? 'high' : Math.abs(delta) >= 1 ? 'medium' : 'info'
      findings.push({
        case_id,
        resolution_id,
        kind: `ownership_${overOrUnder}`,
        person_name: o.person_name,
        computed_value: o.effective_ownership,
        filed_value: filedMatch.declared_ownership,
        severity,
        detail: `Filing declares ${filedMatch.declared_ownership.toFixed(2)}% but computed effective ownership is ${o.effective_ownership.toFixed(2)}% (delta ${delta.toFixed(2)}%).`,
      })
    }

    // Control mismatch
    if (o.meets_substantial_control && !filedMatch.declared_control) {
      findings.push({
        case_id,
        resolution_id,
        kind: 'control_undisclosed',
        person_name: o.person_name,
        computed_value: 1,
        filed_value: 0,
        severity: 'high',
        detail: 'Computed as exercising substantial control but filing does not declare control.',
      })
    } else if (!o.meets_substantial_control && filedMatch.declared_control) {
      findings.push({
        case_id,
        resolution_id,
        kind: 'control_overstated',
        person_name: o.person_name,
        computed_value: 0,
        filed_value: 1,
        severity: 'medium',
        detail: 'Filing declares control but computed resolution does not establish substantial control.',
      })
    }
  }

  // Filed owners with no computed counterpart at all.
  for (const f of filed) {
    if (!computedByName.has(norm(f.person_name))) {
      findings.push({
        case_id,
        resolution_id,
        kind: 'phantom_owner',
        person_name: f.person_name,
        computed_value: null,
        filed_value: f.declared_ownership,
        severity: f.declared_control || f.declared_ownership > 0 ? 'medium' : 'info',
        detail: `Declared in filing (${f.declared_ownership.toFixed(2)}%${f.declared_control ? ', control' : ''}) but does not appear in the computed resolution.`,
      })
    }
  }

  // Persist: clear prior rows for this resolution, then insert fresh.
  await db.delete(discrepancies).where(eq(discrepancies.resolution_id, resolution_id))
  if (findings.length === 0) return c.json([])
  const inserted = await db.insert(discrepancies).values(findings).returning()
  return c.json(inserted, 201)
})

export default router
