import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  seed_scenarios,
  workspaces,
  workspace_members,
  cases,
  entities,
  ownership_edges,
  audit_log,
} from '../db/schema.js'
import { eq, and, asc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Scenario graph shape
//
// A seed scenario carries a `graph` jsonb of the form:
//   {
//     target: "<key of the target entity>",
//     threshold?: number,
//     entities: [{ key, name, entity_type, is_natural_person?, is_target?,
//                  jurisdiction?, registration_number? }],
//     edges:    [{ from, to, percentage, edge_type?, notes? }]
//   }
// where `from`/`to`/`target` reference the per-entity `key` (string).
// ---------------------------------------------------------------------------

interface ScenarioEntity {
  key: string
  name: string
  entity_type: string
  is_natural_person?: boolean
  is_target?: boolean
  jurisdiction?: string
  registration_number?: string
}

interface ScenarioEdge {
  from: string
  to: string
  percentage: number
  edge_type?: string
  notes?: string
}

interface ScenarioGraph {
  target?: string
  threshold?: number
  entities?: ScenarioEntity[]
  edges?: ScenarioEdge[]
}

// Public: list built-in seed scenarios (the trap library).
router.get('/scenarios', async (c) => {
  const all = await db
    .select()
    .from(seed_scenarios)
    .orderBy(asc(seed_scenarios.difficulty), asc(seed_scenarios.name))
  return c.json(all)
})

const applySchema = z.object({
  workspace_id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1).optional(),
})

// Auth-gated: instantiate a seed scenario into a brand-new case.
router.post('/apply', authMiddleware, zValidator('json', applySchema), async (c) => {
  const userId = getUserId(c)
  const { workspace_id, slug, name } = c.req.valid('json')

  // Workspace membership check.
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspace_id))
  if (!ws) return c.json({ error: 'Workspace not found' }, 404)
  const [member] = await db
    .select()
    .from(workspace_members)
    .where(
      and(
        eq(workspace_members.workspace_id, workspace_id),
        eq(workspace_members.user_id, userId),
      ),
    )
  if (!member && ws.owner_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  // Resolve the scenario.
  const [scenario] = await db
    .select()
    .from(seed_scenarios)
    .where(eq(seed_scenarios.slug, slug))
  if (!scenario) return c.json({ error: 'Scenario not found' }, 404)

  const graph = (scenario.graph ?? {}) as ScenarioGraph
  const scenarioEntities = Array.isArray(graph.entities) ? graph.entities : []
  const scenarioEdges = Array.isArray(graph.edges) ? graph.edges : []
  const threshold =
    typeof graph.threshold === 'number' ? graph.threshold : ws.default_threshold

  // Create the case.
  const [created] = await db
    .insert(cases)
    .values({
      workspace_id,
      name: name && name.trim() ? name.trim() : scenario.name,
      status: 'draft',
      threshold,
      description: scenario.description,
      metadata: { seeded_from: scenario.slug, trap_type: scenario.trap_type },
      created_by: userId,
    })
    .returning()

  // Materialize entities, mapping scenario keys -> generated entity ids.
  const keyToId = new Map<string, string>()
  const insertedEntities: typeof entities.$inferSelect[] = []
  let targetEntityId: string | null = null

  for (const se of scenarioEntities) {
    const isTarget = se.is_target === true || se.key === graph.target
    const [ent] = await db
      .insert(entities)
      .values({
        case_id: created.id,
        name: se.name,
        entity_type: se.entity_type,
        jurisdiction: se.jurisdiction ?? '',
        registration_number: se.registration_number ?? '',
        is_natural_person: se.is_natural_person === true,
        is_target: isTarget,
        attributes: {},
        created_by: userId,
      })
      .returning()
    keyToId.set(se.key, ent.id)
    insertedEntities.push(ent)
    if (isTarget) targetEntityId = ent.id
  }

  // Materialize ownership edges (skip any referencing unknown keys).
  const insertedEdges: typeof ownership_edges.$inferSelect[] = []
  for (const ed of scenarioEdges) {
    const ownerId = keyToId.get(ed.from)
    const ownedId = keyToId.get(ed.to)
    if (!ownerId || !ownedId) continue
    const [edge] = await db
      .insert(ownership_edges)
      .values({
        case_id: created.id,
        owner_entity_id: ownerId,
        owned_entity_id: ownedId,
        percentage: ed.percentage,
        edge_type: ed.edge_type ?? 'equity',
        notes: ed.notes ?? '',
        created_by: userId,
      })
      .returning()
    insertedEdges.push(edge)
  }

  // Point the case at its target entity if one was identified.
  let finalCase = created
  if (targetEntityId) {
    const [updated] = await db
      .update(cases)
      .set({ target_entity_id: targetEntityId, updated_at: new Date() })
      .where(eq(cases.id, created.id))
      .returning()
    finalCase = updated
  }

  await db.insert(audit_log).values({
    workspace_id,
    case_id: created.id,
    user_id: userId,
    action: 'seed.apply',
    target_type: 'case',
    target_id: created.id,
    detail: {
      slug: scenario.slug,
      trap_type: scenario.trap_type,
      entity_count: insertedEntities.length,
      edge_count: insertedEdges.length,
    },
  })

  return c.json(
    { case: finalCase, entities: insertedEntities, edges: insertedEdges },
    201,
  )
})

export default router
