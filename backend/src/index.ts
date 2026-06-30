import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from './db/index.js'
import { migrate } from './db/migrate.js'
import { plans, seed_scenarios } from './db/schema.js'
import { eq } from 'drizzle-orm'

import workspacesRoutes from './routes/workspaces.js'
import membersRoutes from './routes/members.js'
import casesRoutes from './routes/cases.js'
import entitiesRoutes from './routes/entities.js'
import edgesRoutes from './routes/edges.js'
import controlRelationshipsRoutes from './routes/control-relationships.js'
import resolutionsRoutes from './routes/resolutions.js'
import ownersRoutes from './routes/owners.js'
import pathsRoutes from './routes/paths.js'
import controlFindingsRoutes from './routes/control-findings.js'
import worksheetItemsRoutes from './routes/worksheet-items.js'
import snapshotsRoutes from './routes/snapshots.js'
import diffsRoutes from './routes/diffs.js'
import filedOwnersRoutes from './routes/filed-owners.js'
import discrepanciesRoutes from './routes/discrepancies.js'
import trustsRoutes from './routes/trusts.js'
import documentsRoutes from './routes/documents.js'
import notesRoutes from './routes/notes.js'
import auditLogRoutes from './routes/audit-log.js'
import exportsRoutes from './routes/exports.js'
import tagsRoutes from './routes/tags.js'
import seedRoutes from './routes/seed.js'
import dashboardRoutes from './routes/dashboard.js'
import billingRoutes from './routes/billing.js'

const app = new Hono()

const allowedOrigins = [
  process.env.FRONTEND_URL ?? 'http://localhost:3000',
  'https://ubo-ownership-tree-resolver.vercel.app',
]

app.use(
  '*',
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
    credentials: true,
  }),
)

const api = new Hono()
api.route('/workspaces', workspacesRoutes)
api.route('/members', membersRoutes)
api.route('/cases', casesRoutes)
api.route('/entities', entitiesRoutes)
api.route('/edges', edgesRoutes)
api.route('/control-relationships', controlRelationshipsRoutes)
api.route('/resolutions', resolutionsRoutes)
api.route('/owners', ownersRoutes)
api.route('/paths', pathsRoutes)
api.route('/control-findings', controlFindingsRoutes)
api.route('/worksheet-items', worksheetItemsRoutes)
api.route('/snapshots', snapshotsRoutes)
api.route('/diffs', diffsRoutes)
api.route('/filed-owners', filedOwnersRoutes)
api.route('/discrepancies', discrepanciesRoutes)
api.route('/trusts', trustsRoutes)
api.route('/documents', documentsRoutes)
api.route('/notes', notesRoutes)
api.route('/audit-log', auditLogRoutes)
api.route('/exports', exportsRoutes)
api.route('/tags', tagsRoutes)
api.route('/seed', seedRoutes)
api.route('/dashboard', dashboardRoutes)
api.route('/billing', billingRoutes)

app.route('/api/v1', api)
app.get('/health', (c) => c.json({ ok: true }))

const seedPlans = [
  { id: 'free', name: 'Free', price_cents: 0 },
  { id: 'pro', name: 'Pro', price_cents: 4900 },
]

const seedScenarioRows = [
  {
    slug: 'simple-majority',
    name: 'Simple Majority Owner',
    description:
      'A single natural person owns 60% of the target directly. Baseline scenario with one clear beneficial owner above the 25% threshold.',
    difficulty: 'easy',
    trap_type: 'none',
    graph: {
      entities: [
        { key: 'target', name: 'Acme Holdings Ltd', entity_type: 'company', is_target: true },
        { key: 'alice', name: 'Alice Roberts', entity_type: 'person', is_natural_person: true },
        { key: 'bob', name: 'Bob Chen', entity_type: 'person', is_natural_person: true },
      ],
      edges: [
        { owner: 'alice', owned: 'target', percentage: 60 },
        { owner: 'bob', owned: 'target', percentage: 40 },
      ],
    },
  },
  {
    slug: 'layered-indirect',
    name: 'Layered Indirect Ownership',
    description:
      'Ownership flows through two intermediate holding companies. Effective ownership must be multiplied along each path to find who clears 25%.',
    difficulty: 'medium',
    trap_type: 'multiplication',
    graph: {
      entities: [
        { key: 'target', name: 'Beta Trading SA', entity_type: 'company', is_target: true },
        { key: 'holdco1', name: 'HoldCo One BV', entity_type: 'company' },
        { key: 'holdco2', name: 'HoldCo Two GmbH', entity_type: 'company' },
        { key: 'carol', name: 'Carol Diaz', entity_type: 'person', is_natural_person: true },
        { key: 'dan', name: 'Dan Whitfield', entity_type: 'person', is_natural_person: true },
      ],
      edges: [
        { owner: 'holdco1', owned: 'target', percentage: 80 },
        { owner: 'holdco2', owned: 'target', percentage: 20 },
        { owner: 'carol', owned: 'holdco1', percentage: 50 },
        { owner: 'dan', owned: 'holdco1', percentage: 50 },
        { owner: 'carol', owned: 'holdco2', percentage: 100 },
      ],
    },
  },
  {
    slug: 'circular-ownership',
    name: 'Circular Cross-Holding',
    description:
      'Two companies own slices of each other, creating a cycle. The resolver must terminate cleanly and warn about the loop rather than spin forever.',
    difficulty: 'hard',
    trap_type: 'circular',
    graph: {
      entities: [
        { key: 'target', name: 'Cyclica PLC', entity_type: 'company', is_target: true },
        { key: 'mirror', name: 'Mirror Corp', entity_type: 'company' },
        { key: 'erin', name: 'Erin Fox', entity_type: 'person', is_natural_person: true },
      ],
      edges: [
        { owner: 'mirror', owned: 'target', percentage: 50 },
        { owner: 'target', owned: 'mirror', percentage: 30 },
        { owner: 'erin', owned: 'mirror', percentage: 70 },
        { owner: 'erin', owned: 'target', percentage: 50 },
      ],
    },
  },
  {
    slug: 'trust-layer',
    name: 'Trust In The Chain',
    description:
      'A trust sits between the owner and the target. Beneficiaries of the trust must be surfaced as beneficial owners under the beneficiaries flow rule.',
    difficulty: 'hard',
    trap_type: 'trust',
    graph: {
      entities: [
        { key: 'target', name: 'Delta Ventures Ltd', entity_type: 'company', is_target: true },
        { key: 'trust', name: 'Family Legacy Trust', entity_type: 'trust' },
        { key: 'frank', name: 'Frank Mueller', entity_type: 'person', is_natural_person: true },
        { key: 'gina', name: 'Gina Patel', entity_type: 'person', is_natural_person: true },
      ],
      edges: [{ owner: 'trust', owned: 'target', percentage: 90 }],
      trusts: [
        {
          entity: 'trust',
          trustees: ['Frank Mueller'],
          beneficiaries: ['Gina Patel'],
          grantor: 'Frank Mueller',
          flow_rule: 'beneficiaries',
        },
      ],
    },
  },
  {
    slug: 'near-threshold',
    name: 'Just Below The Line',
    description:
      'Several owners sit a hair under 25% (e.g. 24.5%). Tests near-threshold flagging so analysts review borderline beneficial owners.',
    difficulty: 'medium',
    trap_type: 'near_threshold',
    graph: {
      entities: [
        { key: 'target', name: 'Edge Case Inc', entity_type: 'company', is_target: true },
        { key: 'hugo', name: 'Hugo Bennett', entity_type: 'person', is_natural_person: true },
        { key: 'iris', name: 'Iris Nakamura', entity_type: 'person', is_natural_person: true },
        { key: 'jack', name: 'Jack Owusu', entity_type: 'person', is_natural_person: true },
      ],
      edges: [
        { owner: 'hugo', owned: 'target', percentage: 24.5 },
        { owner: 'iris', owned: 'target', percentage: 24.5 },
        { owner: 'jack', owned: 'target', percentage: 51 },
      ],
    },
  },
]

async function seedIfEmpty() {
  try {
    for (const p of seedPlans) {
      const existing = await db.select().from(plans).where(eq(plans.id, p.id)).limit(1)
      if (existing.length === 0) {
        await db.insert(plans).values(p as any)
      }
    }
    const existingScenarios = await db.select().from(seed_scenarios).limit(1)
    if (existingScenarios.length === 0) {
      for (const s of seedScenarioRows) {
        await db.insert(seed_scenarios).values(s as any)
      }
      console.log('Seeded scenarios')
    }
  } catch (e) {
    console.error('Seed error:', e)
  }
}

const port = parseInt(process.env.PORT ?? '3001')

// CRITICAL boot order: bind the port FIRST so the platform health check sees a
// live service immediately. A slow/cold DB connection must never block serve().
serve({ fetch: app.fetch, port }, () => console.log(`Server running on port ${port}`))

// Run migrate() and seedIfEmpty() AFTER serve(), each in its own try/catch.
// Both are idempotent (CREATE TABLE IF NOT EXISTS / count-then-insert).
async function bootstrap() {
  try {
    await migrate()
  } catch (e) {
    console.error('Migration error:', e)
  }
  try {
    await seedIfEmpty()
  } catch (e) {
    console.error('Seed error:', e)
  }
}

bootstrap()

export default app
