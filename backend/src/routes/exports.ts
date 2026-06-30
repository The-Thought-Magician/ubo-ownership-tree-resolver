import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  exports,
  cases,
  entities,
  ownership_edges,
  resolutions,
  resolved_owners,
  workspace_members,
  audit_log,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Load a case and verify the caller is a member of its workspace.
async function loadCaseForUser(caseId: string, userId: string) {
  const [kase] = await db.select().from(cases).where(eq(cases.id, caseId))
  if (!kase) return { kase: null, allowed: false }
  const [member] = await db
    .select()
    .from(workspace_members)
    .where(
      and(
        eq(workspace_members.workspace_id, kase.workspace_id),
        eq(workspace_members.user_id, userId),
      ),
    )
  return { kase, allowed: !!member }
}

async function logAudit(
  workspaceId: string,
  caseId: string,
  userId: string,
  action: string,
  targetId: string,
  detail: Record<string, unknown>,
) {
  try {
    await db.insert(audit_log).values({
      workspace_id: workspaceId,
      case_id: caseId,
      user_id: userId,
      action,
      target_type: 'export',
      target_id: targetId,
      detail,
    })
  } catch {
    // audit logging must never block the primary action
  }
}

function escapeDot(s: string): string {
  return s.replace(/"/g, '\\"')
}

// Build a Graphviz DOT representation of the ownership graph for a case.
function buildDot(
  caseName: string,
  ents: Array<{ id: string; name: string; is_natural_person: boolean; is_target: boolean }>,
  edges: Array<{ owner_entity_id: string; owned_entity_id: string; percentage: number }>,
): string {
  const lines: string[] = []
  lines.push(`digraph "${escapeDot(caseName)}" {`)
  lines.push('  rankdir=BT;')
  lines.push('  node [fontname="Helvetica"];')
  for (const e of ents) {
    const shape = e.is_natural_person ? 'ellipse' : 'box'
    const style = e.is_target ? ', style=filled, fillcolor="#fde68a"' : ''
    lines.push(`  "${e.id}" [label="${escapeDot(e.name)}", shape=${shape}${style}];`)
  }
  for (const ed of edges) {
    lines.push(
      `  "${ed.owner_entity_id}" -> "${ed.owned_entity_id}" [label="${ed.percentage}%"];`,
    )
  }
  lines.push('}')
  return lines.join('\n')
}

// Build a minimal standalone SVG of the ownership graph (layered by node order).
function buildSvg(
  ents: Array<{ id: string; name: string; is_natural_person: boolean; is_target: boolean }>,
  edges: Array<{ owner_entity_id: string; owned_entity_id: string; percentage: number }>,
): string {
  const colW = 220
  const rowH = 90
  const boxW = 170
  const boxH = 44
  const pos = new Map<string, { x: number; y: number }>()
  ents.forEach((e, i) => {
    const x = 40 + (i % 3) * colW
    const y = 40 + Math.floor(i / 3) * rowH
    pos.set(e.id, { x, y })
  })
  const width = 40 + 3 * colW
  const height = 80 + Math.ceil(ents.length / 3) * rowH

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  )
  parts.push(
    '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#555"/></marker></defs>',
  )
  for (const ed of edges) {
    const a = pos.get(ed.owner_entity_id)
    const b = pos.get(ed.owned_entity_id)
    if (!a || !b) continue
    const x1 = a.x + boxW / 2
    const y1 = a.y
    const x2 = b.x + boxW / 2
    const y2 = b.y + boxH
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    parts.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)"/>`,
    )
    parts.push(
      `<text x="${mx}" y="${my}" font-family="Helvetica" font-size="11" fill="#333">${ed.percentage}%</text>`,
    )
  }
  for (const e of ents) {
    const p = pos.get(e.id)!
    const fill = e.is_target ? '#fde68a' : e.is_natural_person ? '#dbeafe' : '#ffffff'
    const rx = e.is_natural_person ? 22 : 6
    parts.push(
      `<rect x="${p.x}" y="${p.y}" width="${boxW}" height="${boxH}" rx="${rx}" fill="${fill}" stroke="#333" stroke-width="1"/>`,
    )
    const name = e.name.length > 24 ? e.name.slice(0, 23) + '…' : e.name
    parts.push(
      `<text x="${p.x + boxW / 2}" y="${p.y + boxH / 2 + 4}" text-anchor="middle" font-family="Helvetica" font-size="12" fill="#111">${name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`,
    )
  }
  parts.push('</svg>')
  return parts.join('\n')
}

function rosterToCsv(
  owners: Array<{
    person_name: string
    effective_ownership: number
    meets_ownership_threshold: boolean
    meets_substantial_control: boolean
    near_threshold: boolean
  }>,
): string {
  const header = 'person_name,effective_ownership,meets_ownership_threshold,meets_substantial_control,near_threshold'
  const rows = owners.map((o) => {
    const name = `"${o.person_name.replace(/"/g, '""')}"`
    return [
      name,
      o.effective_ownership,
      o.meets_ownership_threshold,
      o.meets_substantial_control,
      o.near_threshold,
    ].join(',')
  })
  return [header, ...rows].join('\n')
}

// GET /?case_id= — list past exports for a case
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const caseId = c.req.query('case_id')
  if (!caseId) return c.json({ error: 'case_id is required' }, 400)

  const { kase, allowed } = await loadCaseForUser(caseId, userId)
  if (!kase) return c.json({ error: 'Case not found' }, 404)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)

  const rows = await db
    .select()
    .from(exports)
    .where(eq(exports.case_id, caseId))
    .orderBy(desc(exports.created_at))
  return c.json(rows)
})

// GET /:id — get an export including its content
router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [exp] = await db.select().from(exports).where(eq(exports.id, id))
  if (!exp) return c.json({ error: 'Not found' }, 404)
  const { allowed } = await loadCaseForUser(exp.case_id, userId)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)
  return c.json(exp)
})

const rosterSchema = z.object({
  case_id: z.string().min(1),
  resolution_id: z.string().min(1),
  format: z.enum(['json', 'csv']).optional().default('json'),
})

// POST /roster — generate a beneficial-owner roster export from a resolution
router.post('/roster', authMiddleware, zValidator('json', rosterSchema), async (c) => {
  const userId = getUserId(c)
  const { case_id, resolution_id, format } = c.req.valid('json')

  const { kase, allowed } = await loadCaseForUser(case_id, userId)
  if (!kase) return c.json({ error: 'Case not found' }, 404)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)

  const [resolution] = await db
    .select()
    .from(resolutions)
    .where(and(eq(resolutions.id, resolution_id), eq(resolutions.case_id, case_id)))
  if (!resolution) return c.json({ error: 'Resolution not found for this case' }, 404)

  const owners = await db
    .select()
    .from(resolved_owners)
    .where(eq(resolved_owners.resolution_id, resolution_id))
    .orderBy(desc(resolved_owners.effective_ownership))

  let content: string
  if (format === 'csv') {
    content = rosterToCsv(owners)
  } else {
    content = JSON.stringify(
      {
        case: { id: kase.id, name: kase.name },
        resolution: {
          id: resolution.id,
          threshold: resolution.threshold,
          qualifying_count: resolution.qualifying_count,
          control_count: resolution.control_count,
          warnings: resolution.warnings,
          created_at: resolution.created_at,
        },
        beneficial_owners: owners.map((o) => ({
          person_name: o.person_name,
          effective_ownership: o.effective_ownership,
          meets_ownership_threshold: o.meets_ownership_threshold,
          meets_substantial_control: o.meets_substantial_control,
          near_threshold: o.near_threshold,
        })),
        generated_at: new Date().toISOString(),
      },
      null,
      2,
    )
  }

  const [exp] = await db
    .insert(exports)
    .values({
      case_id,
      resolution_id,
      export_type: 'roster',
      format,
      content,
      created_by: userId,
    })
    .returning()

  await logAudit(kase.workspace_id, case_id, userId, 'export.roster', exp.id, {
    resolution_id,
    format,
    owner_count: owners.length,
  })

  return c.json(exp, 201)
})

const diagramSchema = z.object({
  case_id: z.string().min(1),
  format: z.enum(['dot', 'svg', 'json']).optional().default('dot'),
})

// POST /diagram — generate an ownership-chain diagram export (DOT/SVG/JSON)
router.post('/diagram', authMiddleware, zValidator('json', diagramSchema), async (c) => {
  const userId = getUserId(c)
  const { case_id, format } = c.req.valid('json')

  const { kase, allowed } = await loadCaseForUser(case_id, userId)
  if (!kase) return c.json({ error: 'Case not found' }, 404)
  if (!allowed) return c.json({ error: 'Forbidden' }, 403)

  const ents = await db.select().from(entities).where(eq(entities.case_id, case_id))
  const edges = await db
    .select()
    .from(ownership_edges)
    .where(eq(ownership_edges.case_id, case_id))

  let content: string
  if (format === 'svg') {
    content = buildSvg(ents, edges)
  } else if (format === 'json') {
    content = JSON.stringify(
      {
        case: { id: kase.id, name: kase.name },
        nodes: ents.map((e) => ({
          id: e.id,
          name: e.name,
          entity_type: e.entity_type,
          is_natural_person: e.is_natural_person,
          is_target: e.is_target,
        })),
        edges: edges.map((ed) => ({
          owner_entity_id: ed.owner_entity_id,
          owned_entity_id: ed.owned_entity_id,
          percentage: ed.percentage,
          edge_type: ed.edge_type,
        })),
        generated_at: new Date().toISOString(),
      },
      null,
      2,
    )
  } else {
    content = buildDot(kase.name, ents, edges)
  }

  const [exp] = await db
    .insert(exports)
    .values({
      case_id,
      resolution_id: null,
      export_type: 'diagram',
      format,
      content,
      created_by: userId,
    })
    .returning()

  await logAudit(kase.workspace_id, case_id, userId, 'export.diagram', exp.id, {
    format,
    entity_count: ents.length,
    edge_count: edges.length,
  })

  return c.json(exp, 201)
})

export default router
