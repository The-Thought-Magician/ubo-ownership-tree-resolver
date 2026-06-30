# UboOwnershipTreeResolver — Build Contract (Source of Truth)

This is the authoritative build contract. Filenames, mount paths, api method names, and page file paths declared here are binding. Stack: Hono backend (`/api/v1`), Next.js 16 web (`web/`), Neon Postgres + drizzle, Neon Auth via `proxy.ts`, backend trusts `X-User-Id` and uses `getUserId(c)`. Public reads / auth-gated writes with zod + ownership checks. Frontend uses relative `fetch('/api/proxy/<path>')` mapping 1:1 to `/api/v1/<path>`. Schema self-provisions via `db/migrate.ts` (`migrate()` called in `index.ts` before `seedIfEmpty()`).

---

## (a) Tables (columns)

- **workspaces** — id, name, owner_id, default_threshold (real, 25), created_at
- **workspace_members** — id, workspace_id→workspaces, user_id, role ('member'), created_at; UNIQUE(workspace_id,user_id)
- **cases** — id, workspace_id→workspaces, name, target_entity_id, status ('draft'), assignee_id, threshold (real,25), description, metadata jsonb, created_by, created_at, updated_at
- **entities** — id, case_id→cases, name, entity_type, jurisdiction, registration_number, formation_date, is_natural_person bool, is_target bool, attributes jsonb, created_by, created_at
- **ownership_edges** — id, case_id→cases, owner_entity_id→entities, owned_entity_id→entities, percentage real, edge_type ('equity'), notes, created_by, created_at
- **control_relationships** — id, case_id→cases, person_entity_id→entities, controlled_entity_id→entities, control_type, description, created_by, created_at
- **resolutions** — id, case_id→cases, threshold real, inputs_hash, qualifying_count int, control_count int, warnings jsonb, status, created_by, created_at
- **resolved_owners** — id, resolution_id→resolutions, person_entity_id→entities, person_name, effective_ownership real, meets_ownership_threshold bool, meets_substantial_control bool, near_threshold bool, created_at
- **ownership_paths** — id, resolved_owner_id→resolved_owners, resolution_id→resolutions, path_entity_ids jsonb, path_labels jsonb, path_percentage real, created_at
- **control_findings** — id, case_id→cases, person_entity_id→entities, criterion, basis, rationale, determination ('control'), created_by, created_at
- **control_worksheet_items** — id, finding_id→control_findings, label, value, evidence_document_id, satisfied bool, created_at
- **snapshots** — id, case_id→cases, label, entity_count int, edge_count int, created_by, created_at
- **snapshot_entities** — id, snapshot_id→snapshots, original_entity_id, name, entity_type, is_natural_person bool, is_target bool, created_at
- **snapshot_edges** — id, snapshot_id→snapshots, owner_entity_id, owned_entity_id, percentage real, edge_type, created_at
- **diffs** — id, case_id→cases, from_snapshot_id, to_snapshot_id, from_resolution_id, to_resolution_id, result jsonb, created_by, created_at
- **filed_owners** — id, case_id→cases, person_name, declared_ownership real, declared_control bool, filing_reference, created_by, created_at
- **discrepancies** — id, case_id→cases, resolution_id→resolutions, kind, person_name, computed_value real, filed_value real, severity ('info'), detail, created_at
- **trusts** — id, case_id→cases, entity_id→entities UNIQUE, trustees jsonb, beneficiaries jsonb, grantor, flow_rule ('beneficiaries'), created_by, created_at
- **documents** — id, case_id→cases, entity_id→entities, title, url, content, doc_type, created_by, created_at
- **notes** — id, case_id→cases, entity_id→entities, finding_id→control_findings, body, created_by, created_at
- **audit_log** — id, workspace_id→workspaces, case_id, user_id, action, target_type, target_id, detail jsonb, created_at
- **exports** — id, case_id→cases, resolution_id→resolutions, export_type, format ('json'), content, created_by, created_at
- **tags** — id, workspace_id→workspaces, name, color, created_at; UNIQUE(workspace_id,name)
- **case_tags** — id, case_id→cases, tag_id→tags, created_at; UNIQUE(case_id,tag_id)
- **seed_scenarios** — id, slug UNIQUE, name, description, difficulty, trap_type, graph jsonb, created_at
- **plans** — id (text 'free'/'pro'), name, price_cents int, created_at
- **subscriptions** — id, user_id UNIQUE, plan_id ('free'), stripe_customer_id, stripe_subscription_id, status ('active'), current_period_end, created_at, updated_at

---

## (b) Backend route files (mount under /api/v1)

### workspaces.ts — mount `workspaces`
- GET `/` — auth — list workspaces the user belongs to — `Workspace[]`
- GET `/:id` — auth — get one workspace (membership-checked) — `Workspace`
- POST `/` — auth — create workspace (creator added as owner member) — `Workspace`
- PUT `/:id` — auth — update workspace name/default_threshold (owner) — `Workspace`
- DELETE `/:id` — auth — delete workspace (owner) — `{success:true}`

### members.ts — mount `members`
- GET `/?workspace_id=` — auth — list members of a workspace — `Member[]`
- POST `/` — auth — add member (owner) `{workspace_id,user_id,role}` — `Member`
- PUT `/:id` — auth — change member role (owner) — `Member`
- DELETE `/:id` — auth — remove member (owner) — `{success:true}`

### cases.ts — mount `cases`
- GET `/?workspace_id=` — auth — list cases in workspace (filter status/assignee/tag) — `Case[]`
- GET `/:id` — auth — get case detail — `Case`
- POST `/` — auth — create case — `Case`
- PUT `/:id` — auth — update case (name/status/assignee/threshold/target_entity_id) — `Case`
- DELETE `/:id` — auth — delete case — `{success:true}`

### entities.ts — mount `entities`
- GET `/?case_id=` — auth — list entities in a case — `Entity[]`
- GET `/:id` — auth — get entity — `Entity`
- POST `/` — auth — create entity — `Entity`
- PUT `/:id` — auth — update entity — `Entity`
- DELETE `/:id` — auth — delete entity — `{success:true}`

### edges.ts — mount `edges`
- GET `/?case_id=` — auth — list ownership edges in a case — `Edge[]`
- POST `/` — auth — create edge (validates owner≠owned, percentage 0-100) — `Edge`
- PUT `/:id` — auth — update edge — `Edge`
- DELETE `/:id` — auth — delete edge — `{success:true}`

### control-relationships.ts — mount `control-relationships`
- GET `/?case_id=` — auth — list control relationships — `ControlRelationship[]`
- POST `/` — auth — create — `ControlRelationship`
- PUT `/:id` — auth — update — `ControlRelationship`
- DELETE `/:id` — auth — delete — `{success:true}`

### resolutions.ts — mount `resolutions`
- GET `/?case_id=` — auth — list resolution runs for a case — `Resolution[]`
- GET `/:id` — auth — get resolution with resolved_owners — `{resolution, owners}`
- POST `/` — auth — run resolution `{case_id}`: traverses graph, computes effective ownership, applies threshold + control, writes resolved_owners + ownership_paths — `{resolution, owners}`
- DELETE `/:id` — auth — delete resolution — `{success:true}`

### owners.ts — mount `owners`
- GET `/?resolution_id=` — auth — list resolved owners for a resolution (roster) — `ResolvedOwner[]`
- GET `/:id` — auth — get one resolved owner — `ResolvedOwner`

### paths.ts — mount `paths`
- GET `/?resolution_id=` — auth — list all ownership paths for a resolution — `OwnershipPath[]`
- GET `/owner/:ownerId` — auth — list contributing paths for one resolved owner — `OwnershipPath[]`

### control-findings.ts — mount `control-findings`
- GET `/?case_id=` — auth — list control findings — `ControlFinding[]`
- GET `/:id` — auth — get finding with worksheet items — `{finding, items}`
- POST `/` — auth — create finding — `ControlFinding`
- PUT `/:id` — auth — update finding — `ControlFinding`
- DELETE `/:id` — auth — delete finding — `{success:true}`

### worksheet-items.ts — mount `worksheet-items`
- GET `/?finding_id=` — auth — list worksheet items for a finding — `WorksheetItem[]`
- POST `/` — auth — create worksheet item — `WorksheetItem`
- PUT `/:id` — auth — update item (value/satisfied/evidence) — `WorksheetItem`
- DELETE `/:id` — auth — delete item — `{success:true}`

### snapshots.ts — mount `snapshots`
- GET `/?case_id=` — auth — list snapshots — `Snapshot[]`
- GET `/:id` — auth — get snapshot with entities+edges — `{snapshot, entities, edges}`
- POST `/` — auth — create snapshot (freezes current graph) `{case_id,label}` — `Snapshot`
- POST `/:id/restore` — auth — restore snapshot into working graph — `{success:true}`
- DELETE `/:id` — auth — delete snapshot — `{success:true}`

### diffs.ts — mount `diffs`
- GET `/?case_id=` — auth — list saved diffs — `Diff[]`
- POST `/snapshots` — auth — compute+save diff between two snapshots `{from_snapshot_id,to_snapshot_id}` — `Diff`
- POST `/resolutions` — auth — compute+save diff between two resolutions `{from_resolution_id,to_resolution_id}` — `Diff`
- GET `/:id` — auth — get a saved diff — `Diff`

### filed-owners.ts — mount `filed-owners`
- GET `/?case_id=` — auth — list filed/declared owners — `FiledOwner[]`
- POST `/` — auth — add filed owner — `FiledOwner`
- PUT `/:id` — auth — update filed owner — `FiledOwner`
- DELETE `/:id` — auth — delete filed owner — `{success:true}`

### discrepancies.ts — mount `discrepancies`
- GET `/?case_id=` — auth — list stored discrepancies — `Discrepancy[]`
- POST `/detect` — auth — compute discrepancies between a resolution and filed set `{case_id,resolution_id}` (persists rows) — `Discrepancy[]`

### trusts.ts — mount `trusts`
- GET `/?case_id=` — auth — list trusts in a case — `Trust[]`
- GET `/entity/:entityId` — auth — get trust detail for an entity — `Trust`
- POST `/` — auth — create trust detail — `Trust`
- PUT `/:id` — auth — update trust detail — `Trust`
- DELETE `/:id` — auth — delete trust detail — `{success:true}`

### documents.ts — mount `documents`
- GET `/?case_id=` — auth — list documents (optionally by entity_id) — `Document[]`
- POST `/` — auth — create document — `Document`
- PUT `/:id` — auth — update document — `Document`
- DELETE `/:id` — auth — delete document — `{success:true}`

### notes.ts — mount `notes`
- GET `/?case_id=` — auth — list notes (optionally by entity_id/finding_id) — `Note[]`
- POST `/` — auth — create note — `Note`
- DELETE `/:id` — auth — delete note (author) — `{success:true}`

### audit-log.ts — mount `audit-log`
- GET `/?workspace_id=` — auth — list audit entries (optionally by case_id) — `AuditEntry[]`

### exports.ts — mount `exports`
- GET `/?case_id=` — auth — list past exports — `Export[]`
- POST `/roster` — auth — generate BO roster export `{case_id,resolution_id,format}` — `Export`
- POST `/diagram` — auth — generate ownership-chain diagram export (DOT/SVG/JSON) `{case_id,format}` — `Export`
- GET `/:id` — auth — get an export (content) — `Export`

### tags.ts — mount `tags`
- GET `/?workspace_id=` — auth — list tags — `Tag[]`
- POST `/` — auth — create tag — `Tag`
- DELETE `/:id` — auth — delete tag — `{success:true}`
- POST `/assign` — auth — assign tag to case `{case_id,tag_id}` — `CaseTag`
- POST `/unassign` — auth — remove tag from case `{case_id,tag_id}` — `{success:true}`

### seed.ts — mount `seed`
- GET `/scenarios` — public — list built-in seed scenarios (traps) — `SeedScenario[]`
- POST `/apply` — auth — apply a seed scenario into a new case `{workspace_id,slug}` — `{case, entities, edges}`

### dashboard.ts — mount `dashboard`
- GET `/?workspace_id=` — auth — workspace overview metrics (open cases, cases-with-discrepancies, recently resolved, qualifying counts, near-threshold alerts) — `DashboardSummary`

### billing.ts — mount `billing`
- GET `/plan` — auth — current subscription+plan (auto-creates free) — `{subscription, plan, stripeEnabled}`
- POST `/checkout` — auth — Stripe checkout url or 503 — `{url}` | 503
- POST `/portal` — auth — Stripe billing portal url or 503 — `{url}` | 503
- POST `/webhook` — public — Stripe webhook or 503 — `{received:true}` | 503

---

## (c) lib/api.ts methods (method → relative proxy path → verb)

```
// workspaces
getWorkspaces()                              -> GET    /api/proxy/workspaces
getWorkspace(id)                             -> GET    /api/proxy/workspaces/:id
createWorkspace(body)                        -> POST   /api/proxy/workspaces
updateWorkspace(id, body)                    -> PUT    /api/proxy/workspaces/:id
deleteWorkspace(id)                          -> DELETE /api/proxy/workspaces/:id
// members
getMembers(workspaceId)                      -> GET    /api/proxy/members?workspace_id=
addMember(body)                              -> POST   /api/proxy/members
updateMember(id, body)                       -> PUT    /api/proxy/members/:id
removeMember(id)                             -> DELETE /api/proxy/members/:id
// cases
getCases(workspaceId, query?)                -> GET    /api/proxy/cases?workspace_id=
getCase(id)                                  -> GET    /api/proxy/cases/:id
createCase(body)                             -> POST   /api/proxy/cases
updateCase(id, body)                         -> PUT    /api/proxy/cases/:id
deleteCase(id)                               -> DELETE /api/proxy/cases/:id
// entities
getEntities(caseId)                          -> GET    /api/proxy/entities?case_id=
getEntity(id)                                -> GET    /api/proxy/entities/:id
createEntity(body)                           -> POST   /api/proxy/entities
updateEntity(id, body)                       -> PUT    /api/proxy/entities/:id
deleteEntity(id)                             -> DELETE /api/proxy/entities/:id
// edges
getEdges(caseId)                             -> GET    /api/proxy/edges?case_id=
createEdge(body)                             -> POST   /api/proxy/edges
updateEdge(id, body)                         -> PUT    /api/proxy/edges/:id
deleteEdge(id)                               -> DELETE /api/proxy/edges/:id
// control relationships
getControlRelationships(caseId)              -> GET    /api/proxy/control-relationships?case_id=
createControlRelationship(body)              -> POST   /api/proxy/control-relationships
updateControlRelationship(id, body)          -> PUT    /api/proxy/control-relationships/:id
deleteControlRelationship(id)                -> DELETE /api/proxy/control-relationships/:id
// resolutions
getResolutions(caseId)                       -> GET    /api/proxy/resolutions?case_id=
getResolution(id)                            -> GET    /api/proxy/resolutions/:id
runResolution(body)                          -> POST   /api/proxy/resolutions
deleteResolution(id)                         -> DELETE /api/proxy/resolutions/:id
// owners
getOwners(resolutionId)                      -> GET    /api/proxy/owners?resolution_id=
getOwner(id)                                 -> GET    /api/proxy/owners/:id
// paths
getPaths(resolutionId)                       -> GET    /api/proxy/paths?resolution_id=
getOwnerPaths(ownerId)                        -> GET    /api/proxy/paths/owner/:ownerId
// control findings
getControlFindings(caseId)                   -> GET    /api/proxy/control-findings?case_id=
getControlFinding(id)                         -> GET    /api/proxy/control-findings/:id
createControlFinding(body)                   -> POST   /api/proxy/control-findings
updateControlFinding(id, body)               -> PUT    /api/proxy/control-findings/:id
deleteControlFinding(id)                     -> DELETE /api/proxy/control-findings/:id
// worksheet items
getWorksheetItems(findingId)                 -> GET    /api/proxy/worksheet-items?finding_id=
createWorksheetItem(body)                     -> POST   /api/proxy/worksheet-items
updateWorksheetItem(id, body)                -> PUT    /api/proxy/worksheet-items/:id
deleteWorksheetItem(id)                      -> DELETE /api/proxy/worksheet-items/:id
// snapshots
getSnapshots(caseId)                         -> GET    /api/proxy/snapshots?case_id=
getSnapshot(id)                              -> GET    /api/proxy/snapshots/:id
createSnapshot(body)                          -> POST   /api/proxy/snapshots
restoreSnapshot(id)                          -> POST   /api/proxy/snapshots/:id/restore
deleteSnapshot(id)                           -> DELETE /api/proxy/snapshots/:id
// diffs
getDiffs(caseId)                             -> GET    /api/proxy/diffs?case_id=
getDiff(id)                                  -> GET    /api/proxy/diffs/:id
diffSnapshots(body)                          -> POST   /api/proxy/diffs/snapshots
diffResolutions(body)                        -> POST   /api/proxy/diffs/resolutions
// filed owners
getFiledOwners(caseId)                       -> GET    /api/proxy/filed-owners?case_id=
createFiledOwner(body)                        -> POST   /api/proxy/filed-owners
updateFiledOwner(id, body)                   -> PUT    /api/proxy/filed-owners/:id
deleteFiledOwner(id)                         -> DELETE /api/proxy/filed-owners/:id
// discrepancies
getDiscrepancies(caseId)                     -> GET    /api/proxy/discrepancies?case_id=
detectDiscrepancies(body)                    -> POST   /api/proxy/discrepancies/detect
// trusts
getTrusts(caseId)                            -> GET    /api/proxy/trusts?case_id=
getTrustByEntity(entityId)                   -> GET    /api/proxy/trusts/entity/:entityId
createTrust(body)                            -> POST   /api/proxy/trusts
updateTrust(id, body)                        -> PUT    /api/proxy/trusts/:id
deleteTrust(id)                              -> DELETE /api/proxy/trusts/:id
// documents
getDocuments(caseId)                         -> GET    /api/proxy/documents?case_id=
createDocument(body)                          -> POST   /api/proxy/documents
updateDocument(id, body)                     -> PUT    /api/proxy/documents/:id
deleteDocument(id)                           -> DELETE /api/proxy/documents/:id
// notes
getNotes(caseId)                             -> GET    /api/proxy/notes?case_id=
createNote(body)                              -> POST   /api/proxy/notes
deleteNote(id)                               -> DELETE /api/proxy/notes/:id
// audit log
getAuditLog(workspaceId)                      -> GET    /api/proxy/audit-log?workspace_id=
// exports
getExports(caseId)                           -> GET    /api/proxy/exports?case_id=
getExport(id)                                -> GET    /api/proxy/exports/:id
exportRoster(body)                           -> POST   /api/proxy/exports/roster
exportDiagram(body)                          -> POST   /api/proxy/exports/diagram
// tags
getTags(workspaceId)                         -> GET    /api/proxy/tags?workspace_id=
createTag(body)                               -> POST   /api/proxy/tags
deleteTag(id)                                -> DELETE /api/proxy/tags/:id
assignTag(body)                              -> POST   /api/proxy/tags/assign
unassignTag(body)                            -> POST   /api/proxy/tags/unassign
// seed
getSeedScenarios()                           -> GET    /api/proxy/seed/scenarios
applySeedScenario(body)                       -> POST   /api/proxy/seed/apply
// dashboard
getDashboard(workspaceId)                     -> GET    /api/proxy/dashboard?workspace_id=
// billing
getBillingPlan()                             -> GET    /api/proxy/billing/plan
createCheckout()                             -> POST   /api/proxy/billing/checkout
createPortal()                               -> POST   /api/proxy/billing/portal
```

Every method maps to exactly one endpoint in section (b); every endpoint (except the Stripe webhook, which Stripe calls directly) is consumed by at least one page in section (d).

---

## (d) Pages (URL → file → kind → api methods → renders)

### Public
1. `/` — `web/app/page.tsx` — public — none — static landing: hero, feature grid, CTAs to sign-up/pricing
2. `/auth/sign-in` — `web/app/auth/sign-in/page.tsx` — public — none (authClient) — sign-in form
3. `/auth/sign-up` — `web/app/auth/sign-up/page.tsx` — public — none (authClient) — sign-up form
4. `/pricing` — `web/app/pricing/page.tsx` — public — none — static plan comparison (Free / Pro), CTA

### Dashboard (wrapped by `web/app/dashboard/layout.tsx` → `DashboardLayout`)
5. `/dashboard` — `web/app/dashboard/page.tsx` — dashboard — getDashboard, getWorkspaces — overview metrics cards, recent cases, near-threshold alerts, discrepancy alerts
6. `/dashboard/cases` — `web/app/dashboard/cases/page.tsx` — dashboard — getCases, createCase, deleteCase, getTags, assignTag, unassignTag — case list with filters, create-case modal
7. `/dashboard/cases/[id]` — `web/app/dashboard/cases/[id]/page.tsx` — dashboard — getCase, updateCase, getEntities, getEdges, getResolutions, getDiscrepancies — case overview, status/assignee/threshold edit, links to sub-tools
8. `/dashboard/cases/[id]/graph` — `web/app/dashboard/cases/[id]/graph/page.tsx` — dashboard — getEntities, getEdges, createEntity, updateEntity, deleteEntity, createEdge, updateEdge, deleteEdge — layered ownership graph editor (canvas + table), validation warnings
9. `/dashboard/entities` — `web/app/dashboard/entities/page.tsx` — dashboard — getCases, getEntities, createEntity, updateEntity, deleteEntity — entity registry across cases
10. `/dashboard/entities/[id]` — `web/app/dashboard/entities/[id]/page.tsx` — dashboard — getEntity, updateEntity, getDocuments, createDocument, getNotes, createNote — entity detail with documents and notes
11. `/dashboard/resolutions` — `web/app/dashboard/resolutions/page.tsx` — dashboard — getCases, getResolutions, runResolution, deleteResolution — resolution history list, run-resolution control
12. `/dashboard/resolutions/[id]` — `web/app/dashboard/resolutions/[id]/page.tsx` — dashboard — getResolution, getOwners, getPaths — resolution detail: resolved owners table, threshold flags, warnings
13. `/dashboard/owners` — `web/app/dashboard/owners/page.tsx` — dashboard — getResolutions, getOwners, exportRoster, getExports — BO roster viewer for a selected resolution, export button
14. `/dashboard/paths` — `web/app/dashboard/paths/page.tsx` — dashboard — getResolutions, getOwners, getOwnerPaths, getPaths — ownership-path explorer per person with per-path multiplied percentages
15. `/dashboard/control-findings` — `web/app/dashboard/control-findings/page.tsx` — dashboard — getCases, getControlFindings, createControlFinding, updateControlFinding, deleteControlFinding, getEntities — substantial-control findings list + create
16. `/dashboard/control-findings/[id]` — `web/app/dashboard/control-findings/[id]/page.tsx` — dashboard — getControlFinding, updateControlFinding, getWorksheetItems, createWorksheetItem, updateWorksheetItem, deleteWorksheetItem — control-test worksheet for a finding
17. `/dashboard/discrepancies` — `web/app/dashboard/discrepancies/page.tsx` — dashboard — getCases, getResolutions, getDiscrepancies, detectDiscrepancies — run + view discrepancy detection between computed and filed sets
18. `/dashboard/filed-set` — `web/app/dashboard/filed-set/page.tsx` — dashboard — getCases, getFiledOwners, createFiledOwner, updateFiledOwner, deleteFiledOwner — manage previously filed/declared owner set
19. `/dashboard/snapshots` — `web/app/dashboard/snapshots/page.tsx` — dashboard — getCases, getSnapshots, getSnapshot, createSnapshot, restoreSnapshot, deleteSnapshot — versioned snapshots list + create/restore
20. `/dashboard/diffs` — `web/app/dashboard/diffs/page.tsx` — dashboard — getCases, getSnapshots, getResolutions, getDiffs, getDiff, diffSnapshots, diffResolutions — before/after diff builder + rendered result
21. `/dashboard/trusts` — `web/app/dashboard/trusts/page.tsx` — dashboard — getCases, getEntities, getTrusts, getTrustByEntity, createTrust, updateTrust, deleteTrust — trust modeling (trustees/beneficiaries/grantor/flow rule)
22. `/dashboard/documents` — `web/app/dashboard/documents/page.tsx` — dashboard — getCases, getDocuments, createDocument, updateDocument, deleteDocument — document/evidence library per case
23. `/dashboard/exports` — `web/app/dashboard/exports/page.tsx` — dashboard — getCases, getResolutions, getExports, getExport, exportRoster, exportDiagram — exports list, generate roster + ownership-chain diagram
24. `/dashboard/audit-log` — `web/app/dashboard/audit-log/page.tsx` — dashboard — getWorkspaces, getAuditLog — immutable audit trail viewer
25. `/dashboard/seed` — `web/app/dashboard/seed/page.tsx` — dashboard — getSeedScenarios, getWorkspaces, applySeedScenario — sample-data seeder gallery (circular/trust-layer traps), apply into new case
26. `/dashboard/settings` — `web/app/dashboard/settings/page.tsx` — dashboard — getWorkspaces, updateWorkspace, getMembers, addMember, updateMember, removeMember, getTags, createTag, deleteTag, getBillingPlan, createCheckout, createPortal — workspace settings, members, tags, billing

Note: `/dashboard/notes` is not a standalone page — notes are consumed within entity detail (page 10). `notes` GET/POST/DELETE methods are exercised there.

---

## (e) DashboardLayout sidebar nav sections

- **Overview**
  - Dashboard → `/dashboard`
- **Cases**
  - Cases → `/dashboard/cases`
  - Entities → `/dashboard/entities`
  - Trusts → `/dashboard/trusts`
  - Documents → `/dashboard/documents`
- **Resolution**
  - Resolutions → `/dashboard/resolutions`
  - Owners Roster → `/dashboard/owners`
  - Paths Explorer → `/dashboard/paths`
  - Control Findings → `/dashboard/control-findings`
- **Compliance**
  - Filed Set → `/dashboard/filed-set`
  - Discrepancies → `/dashboard/discrepancies`
  - Audit Log → `/dashboard/audit-log`
- **Versions**
  - Snapshots → `/dashboard/snapshots`
  - Diffs → `/dashboard/diffs`
  - Exports → `/dashboard/exports`
- **Tools**
  - Seed Scenarios → `/dashboard/seed`
  - Settings → `/dashboard/settings`

Detail pages (`cases/[id]`, `cases/[id]/graph`, `entities/[id]`, `resolutions/[id]`, `control-findings/[id]`) are reached by navigation from their list pages and are not separate top-level nav items.
