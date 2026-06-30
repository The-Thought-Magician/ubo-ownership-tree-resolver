import { db } from './index.js'
import { sql } from 'drizzle-orm'

const statements: string[] = [
  `CREATE TABLE IF NOT EXISTS workspaces (
    id text PRIMARY KEY,
    name text NOT NULL,
    owner_id text NOT NULL,
    default_threshold real NOT NULL DEFAULT 25,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS workspace_members (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    role text NOT NULL DEFAULT 'member',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS cases (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    name text NOT NULL,
    target_entity_id text,
    status text NOT NULL DEFAULT 'draft',
    assignee_id text,
    threshold real NOT NULL DEFAULT 25,
    description text DEFAULT '',
    metadata jsonb DEFAULT '{}'::jsonb,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS entities (
    id text PRIMARY KEY,
    case_id text NOT NULL REFERENCES cases(id),
    name text NOT NULL,
    entity_type text NOT NULL,
    jurisdiction text DEFAULT '',
    registration_number text DEFAULT '',
    formation_date text DEFAULT '',
    is_natural_person boolean NOT NULL DEFAULT false,
    is_target boolean NOT NULL DEFAULT false,
    attributes jsonb DEFAULT '{}'::jsonb,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS ownership_edges (
    id text PRIMARY KEY,
    case_id text NOT NULL REFERENCES cases(id),
    owner_entity_id text NOT NULL REFERENCES entities(id),
    owned_entity_id text NOT NULL REFERENCES entities(id),
    percentage real NOT NULL,
    edge_type text NOT NULL DEFAULT 'equity',
    notes text DEFAULT '',
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS control_relationships (
    id text PRIMARY KEY,
    case_id text NOT NULL REFERENCES cases(id),
    person_entity_id text NOT NULL REFERENCES entities(id),
    controlled_entity_id text NOT NULL REFERENCES entities(id),
    control_type text NOT NULL,
    description text DEFAULT '',
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS resolutions (
    id text PRIMARY KEY,
    case_id text NOT NULL REFERENCES cases(id),
    threshold real NOT NULL,
    inputs_hash text DEFAULT '',
    qualifying_count integer NOT NULL DEFAULT 0,
    control_count integer NOT NULL DEFAULT 0,
    warnings jsonb DEFAULT '[]'::jsonb,
    status text NOT NULL DEFAULT 'complete',
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS resolved_owners (
    id text PRIMARY KEY,
    resolution_id text NOT NULL REFERENCES resolutions(id),
    person_entity_id text NOT NULL REFERENCES entities(id),
    person_name text NOT NULL,
    effective_ownership real NOT NULL,
    meets_ownership_threshold boolean NOT NULL DEFAULT false,
    meets_substantial_control boolean NOT NULL DEFAULT false,
    near_threshold boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS ownership_paths (
    id text PRIMARY KEY,
    resolved_owner_id text NOT NULL REFERENCES resolved_owners(id),
    resolution_id text NOT NULL REFERENCES resolutions(id),
    path_entity_ids jsonb DEFAULT '[]'::jsonb,
    path_labels jsonb DEFAULT '[]'::jsonb,
    path_percentage real NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS control_findings (
    id text PRIMARY KEY,
    case_id text NOT NULL REFERENCES cases(id),
    person_entity_id text NOT NULL REFERENCES entities(id),
    criterion text NOT NULL,
    basis text DEFAULT '',
    rationale text DEFAULT '',
    determination text NOT NULL DEFAULT 'control',
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS control_worksheet_items (
    id text PRIMARY KEY,
    finding_id text NOT NULL REFERENCES control_findings(id),
    label text NOT NULL,
    value text DEFAULT '',
    evidence_document_id text,
    satisfied boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS snapshots (
    id text PRIMARY KEY,
    case_id text NOT NULL REFERENCES cases(id),
    label text NOT NULL,
    entity_count integer NOT NULL DEFAULT 0,
    edge_count integer NOT NULL DEFAULT 0,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS snapshot_entities (
    id text PRIMARY KEY,
    snapshot_id text NOT NULL REFERENCES snapshots(id),
    original_entity_id text NOT NULL,
    name text NOT NULL,
    entity_type text NOT NULL,
    is_natural_person boolean NOT NULL DEFAULT false,
    is_target boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS snapshot_edges (
    id text PRIMARY KEY,
    snapshot_id text NOT NULL REFERENCES snapshots(id),
    owner_entity_id text NOT NULL,
    owned_entity_id text NOT NULL,
    percentage real NOT NULL,
    edge_type text NOT NULL DEFAULT 'equity',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS diffs (
    id text PRIMARY KEY,
    case_id text NOT NULL REFERENCES cases(id),
    from_snapshot_id text,
    to_snapshot_id text,
    from_resolution_id text,
    to_resolution_id text,
    result jsonb DEFAULT '{}'::jsonb,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS filed_owners (
    id text PRIMARY KEY,
    case_id text NOT NULL REFERENCES cases(id),
    person_name text NOT NULL,
    declared_ownership real NOT NULL DEFAULT 0,
    declared_control boolean NOT NULL DEFAULT false,
    filing_reference text DEFAULT '',
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS discrepancies (
    id text PRIMARY KEY,
    case_id text NOT NULL REFERENCES cases(id),
    resolution_id text REFERENCES resolutions(id),
    kind text NOT NULL,
    person_name text NOT NULL,
    computed_value real,
    filed_value real,
    severity text NOT NULL DEFAULT 'info',
    detail text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS trusts (
    id text PRIMARY KEY,
    case_id text NOT NULL REFERENCES cases(id),
    entity_id text NOT NULL UNIQUE REFERENCES entities(id),
    trustees jsonb DEFAULT '[]'::jsonb,
    beneficiaries jsonb DEFAULT '[]'::jsonb,
    grantor text DEFAULT '',
    flow_rule text NOT NULL DEFAULT 'beneficiaries',
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS documents (
    id text PRIMARY KEY,
    case_id text NOT NULL REFERENCES cases(id),
    entity_id text REFERENCES entities(id),
    title text NOT NULL,
    url text DEFAULT '',
    content text DEFAULT '',
    doc_type text DEFAULT 'other',
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS notes (
    id text PRIMARY KEY,
    case_id text NOT NULL REFERENCES cases(id),
    entity_id text REFERENCES entities(id),
    finding_id text REFERENCES control_findings(id),
    body text NOT NULL,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS audit_log (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    case_id text,
    user_id text NOT NULL,
    action text NOT NULL,
    target_type text DEFAULT '',
    target_id text DEFAULT '',
    detail jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS exports (
    id text PRIMARY KEY,
    case_id text NOT NULL REFERENCES cases(id),
    resolution_id text REFERENCES resolutions(id),
    export_type text NOT NULL,
    format text NOT NULL DEFAULT 'json',
    content text DEFAULT '',
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS tags (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    name text NOT NULL,
    color text DEFAULT '#888888',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, name)
  )`,

  `CREATE TABLE IF NOT EXISTS case_tags (
    id text PRIMARY KEY,
    case_id text NOT NULL REFERENCES cases(id),
    tag_id text NOT NULL REFERENCES tags(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (case_id, tag_id)
  )`,

  `CREATE TABLE IF NOT EXISTS seed_scenarios (
    id text PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    name text NOT NULL,
    description text NOT NULL,
    difficulty text NOT NULL DEFAULT 'medium',
    trap_type text NOT NULL,
    graph jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS plans (
    id text PRIMARY KEY,
    name text NOT NULL,
    price_cents integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS subscriptions (
    id text PRIMARY KEY,
    user_id text NOT NULL UNIQUE,
    plan_id text NOT NULL DEFAULT 'free',
    stripe_customer_id text,
    stripe_subscription_id text,
    status text NOT NULL DEFAULT 'active',
    current_period_end timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cases_workspace ON cases(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_entities_case ON entities(case_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ownership_edges_case ON ownership_edges(case_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ownership_edges_owner ON ownership_edges(owner_entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ownership_edges_owned ON ownership_edges(owned_entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_control_relationships_case ON control_relationships(case_id)`,
  `CREATE INDEX IF NOT EXISTS idx_resolutions_case ON resolutions(case_id)`,
  `CREATE INDEX IF NOT EXISTS idx_resolved_owners_resolution ON resolved_owners(resolution_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ownership_paths_resolved_owner ON ownership_paths(resolved_owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ownership_paths_resolution ON ownership_paths(resolution_id)`,
  `CREATE INDEX IF NOT EXISTS idx_control_findings_case ON control_findings(case_id)`,
  `CREATE INDEX IF NOT EXISTS idx_control_worksheet_items_finding ON control_worksheet_items(finding_id)`,
  `CREATE INDEX IF NOT EXISTS idx_snapshots_case ON snapshots(case_id)`,
  `CREATE INDEX IF NOT EXISTS idx_snapshot_entities_snapshot ON snapshot_entities(snapshot_id)`,
  `CREATE INDEX IF NOT EXISTS idx_snapshot_edges_snapshot ON snapshot_edges(snapshot_id)`,
  `CREATE INDEX IF NOT EXISTS idx_diffs_case ON diffs(case_id)`,
  `CREATE INDEX IF NOT EXISTS idx_filed_owners_case ON filed_owners(case_id)`,
  `CREATE INDEX IF NOT EXISTS idx_discrepancies_case ON discrepancies(case_id)`,
  `CREATE INDEX IF NOT EXISTS idx_trusts_case ON trusts(case_id)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_case ON documents(case_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notes_case ON notes(case_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_log_workspace ON audit_log(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_exports_case ON exports(case_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tags_workspace ON tags(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_case_tags_case ON case_tags(case_id)`,
]

export async function migrate() {
  for (const stmt of statements) {
    await db.execute(sql.raw(stmt))
  }
  console.log('Migration complete')
}
