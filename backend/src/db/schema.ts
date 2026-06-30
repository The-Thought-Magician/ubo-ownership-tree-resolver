import { pgTable, text, integer, boolean, timestamp, jsonb, unique, real } from 'drizzle-orm/pg-core'

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  owner_id: text('owner_id').notNull(),
  default_threshold: real('default_threshold').default(25).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const workspace_members = pgTable('workspace_members', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  role: text('role').notNull().default('member'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.workspace_id, t.user_id)])

export const cases = pgTable('cases', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  target_entity_id: text('target_entity_id'),
  status: text('status').notNull().default('draft'),
  assignee_id: text('assignee_id'),
  threshold: real('threshold').default(25).notNull(),
  description: text('description').default(''),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const entities = pgTable('entities', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  case_id: text('case_id').notNull().references(() => cases.id),
  name: text('name').notNull(),
  entity_type: text('entity_type').notNull(),
  jurisdiction: text('jurisdiction').default(''),
  registration_number: text('registration_number').default(''),
  formation_date: text('formation_date').default(''),
  is_natural_person: boolean('is_natural_person').default(false).notNull(),
  is_target: boolean('is_target').default(false).notNull(),
  attributes: jsonb('attributes').$type<Record<string, unknown>>().default({}),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const ownership_edges = pgTable('ownership_edges', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  case_id: text('case_id').notNull().references(() => cases.id),
  owner_entity_id: text('owner_entity_id').notNull().references(() => entities.id),
  owned_entity_id: text('owned_entity_id').notNull().references(() => entities.id),
  percentage: real('percentage').notNull(),
  edge_type: text('edge_type').notNull().default('equity'),
  notes: text('notes').default(''),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const control_relationships = pgTable('control_relationships', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  case_id: text('case_id').notNull().references(() => cases.id),
  person_entity_id: text('person_entity_id').notNull().references(() => entities.id),
  controlled_entity_id: text('controlled_entity_id').notNull().references(() => entities.id),
  control_type: text('control_type').notNull(),
  description: text('description').default(''),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const resolutions = pgTable('resolutions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  case_id: text('case_id').notNull().references(() => cases.id),
  threshold: real('threshold').notNull(),
  inputs_hash: text('inputs_hash').default(''),
  qualifying_count: integer('qualifying_count').default(0).notNull(),
  control_count: integer('control_count').default(0).notNull(),
  warnings: jsonb('warnings').$type<string[]>().default([]),
  status: text('status').notNull().default('complete'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const resolved_owners = pgTable('resolved_owners', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  resolution_id: text('resolution_id').notNull().references(() => resolutions.id),
  person_entity_id: text('person_entity_id').notNull().references(() => entities.id),
  person_name: text('person_name').notNull(),
  effective_ownership: real('effective_ownership').notNull(),
  meets_ownership_threshold: boolean('meets_ownership_threshold').default(false).notNull(),
  meets_substantial_control: boolean('meets_substantial_control').default(false).notNull(),
  near_threshold: boolean('near_threshold').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const ownership_paths = pgTable('ownership_paths', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  resolved_owner_id: text('resolved_owner_id').notNull().references(() => resolved_owners.id),
  resolution_id: text('resolution_id').notNull().references(() => resolutions.id),
  path_entity_ids: jsonb('path_entity_ids').$type<string[]>().default([]),
  path_labels: jsonb('path_labels').$type<string[]>().default([]),
  path_percentage: real('path_percentage').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const control_findings = pgTable('control_findings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  case_id: text('case_id').notNull().references(() => cases.id),
  person_entity_id: text('person_entity_id').notNull().references(() => entities.id),
  criterion: text('criterion').notNull(),
  basis: text('basis').default(''),
  rationale: text('rationale').default(''),
  determination: text('determination').notNull().default('control'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const control_worksheet_items = pgTable('control_worksheet_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  finding_id: text('finding_id').notNull().references(() => control_findings.id),
  label: text('label').notNull(),
  value: text('value').default(''),
  evidence_document_id: text('evidence_document_id'),
  satisfied: boolean('satisfied').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const snapshots = pgTable('snapshots', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  case_id: text('case_id').notNull().references(() => cases.id),
  label: text('label').notNull(),
  entity_count: integer('entity_count').default(0).notNull(),
  edge_count: integer('edge_count').default(0).notNull(),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const snapshot_entities = pgTable('snapshot_entities', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  snapshot_id: text('snapshot_id').notNull().references(() => snapshots.id),
  original_entity_id: text('original_entity_id').notNull(),
  name: text('name').notNull(),
  entity_type: text('entity_type').notNull(),
  is_natural_person: boolean('is_natural_person').default(false).notNull(),
  is_target: boolean('is_target').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const snapshot_edges = pgTable('snapshot_edges', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  snapshot_id: text('snapshot_id').notNull().references(() => snapshots.id),
  owner_entity_id: text('owner_entity_id').notNull(),
  owned_entity_id: text('owned_entity_id').notNull(),
  percentage: real('percentage').notNull(),
  edge_type: text('edge_type').notNull().default('equity'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const diffs = pgTable('diffs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  case_id: text('case_id').notNull().references(() => cases.id),
  from_snapshot_id: text('from_snapshot_id'),
  to_snapshot_id: text('to_snapshot_id'),
  from_resolution_id: text('from_resolution_id'),
  to_resolution_id: text('to_resolution_id'),
  result: jsonb('result').$type<Record<string, unknown>>().default({}),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const filed_owners = pgTable('filed_owners', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  case_id: text('case_id').notNull().references(() => cases.id),
  person_name: text('person_name').notNull(),
  declared_ownership: real('declared_ownership').default(0).notNull(),
  declared_control: boolean('declared_control').default(false).notNull(),
  filing_reference: text('filing_reference').default(''),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const discrepancies = pgTable('discrepancies', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  case_id: text('case_id').notNull().references(() => cases.id),
  resolution_id: text('resolution_id').references(() => resolutions.id),
  kind: text('kind').notNull(),
  person_name: text('person_name').notNull(),
  computed_value: real('computed_value'),
  filed_value: real('filed_value'),
  severity: text('severity').notNull().default('info'),
  detail: text('detail').default(''),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const trusts = pgTable('trusts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  case_id: text('case_id').notNull().references(() => cases.id),
  entity_id: text('entity_id').notNull().references(() => entities.id).unique(),
  trustees: jsonb('trustees').$type<string[]>().default([]),
  beneficiaries: jsonb('beneficiaries').$type<string[]>().default([]),
  grantor: text('grantor').default(''),
  flow_rule: text('flow_rule').notNull().default('beneficiaries'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const documents = pgTable('documents', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  case_id: text('case_id').notNull().references(() => cases.id),
  entity_id: text('entity_id').references(() => entities.id),
  title: text('title').notNull(),
  url: text('url').default(''),
  content: text('content').default(''),
  doc_type: text('doc_type').default('other'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const notes = pgTable('notes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  case_id: text('case_id').notNull().references(() => cases.id),
  entity_id: text('entity_id').references(() => entities.id),
  finding_id: text('finding_id').references(() => control_findings.id),
  body: text('body').notNull(),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const audit_log = pgTable('audit_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  case_id: text('case_id'),
  user_id: text('user_id').notNull(),
  action: text('action').notNull(),
  target_type: text('target_type').default(''),
  target_id: text('target_id').default(''),
  detail: jsonb('detail').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const exports = pgTable('exports', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  case_id: text('case_id').notNull().references(() => cases.id),
  resolution_id: text('resolution_id').references(() => resolutions.id),
  export_type: text('export_type').notNull(),
  format: text('format').notNull().default('json'),
  content: text('content').default(''),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const tags = pgTable('tags', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  color: text('color').default('#888888'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.workspace_id, t.name)])

export const case_tags = pgTable('case_tags', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  case_id: text('case_id').notNull().references(() => cases.id),
  tag_id: text('tag_id').notNull().references(() => tags.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.case_id, t.tag_id)])

export const seed_scenarios = pgTable('seed_scenarios', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  difficulty: text('difficulty').notNull().default('medium'),
  trap_type: text('trap_type').notNull(),
  graph: jsonb('graph').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price_cents: integer('price_cents').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull().unique(),
  plan_id: text('plan_id').notNull().default('free'),
  stripe_customer_id: text('stripe_customer_id'),
  stripe_subscription_id: text('stripe_subscription_id'),
  status: text('status').notNull().default('active'),
  current_period_end: timestamp('current_period_end'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})
