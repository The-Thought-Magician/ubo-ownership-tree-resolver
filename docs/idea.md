# UboOwnershipTreeResolver

## Overview

UboOwnershipTreeResolver builds the layered ownership tree behind any business entity and deterministically computes who clears the 25% beneficial-ownership and substantial-control thresholds, so a BOI (Beneficial Ownership Information) report names the correct natural persons. It multiplies direct ownership percentages through nested holding companies, trusts, and intermediate entities to compute each natural person's effective indirect ownership, applies the FinCEN 25% test and the substantial-control test, records the documented basis for each control finding, detects discrepancies against previously filed sets, and produces versioned snapshots with before/after diffs plus exportable rosters and ownership-chain diagrams.

This is a deterministic analysis platform: no probabilistic guessing. Given an ownership graph, the same inputs always produce the same beneficial-owner set. The math is transparent, auditable, and every percentage is traceable to a chain of edges.

## Problem

Resolving ultimate beneficial owners (UBOs) through layered holding companies, trusts, and intermediate entities is the hardest and most error-prone step in both BOI filing and KYB (Know Your Business) onboarding. A natural person may own 30% of HoldCo A and 40% of HoldCo B, where HoldCo A owns 50% of the target and HoldCo B owns 30% of the target; their effective ownership is 30%*50% + 40%*30% = 27%, clearing the 25% threshold even though no single direct edge does. Doing this by hand across dozens of entities with circular cross-holdings and trust layers is slow and mistakes are common. Getting it wrong means filing the wrong people (triggering corrected-report obligations and penalties) or onboarding a misclassified customer. Every fintech, neobank, payments provider, and corporate-services firm hits this on complex accounts, and it recurs on every ownership change.

## Target Users

KYB analysts and onboarding-compliance specialists at fintechs, payments providers, neobanks, and corporate-services firms who approve complex multi-layer corporate customers. The buyer is the KYB/onboarding-compliance specialist responsible for filing accurate BOI reports and clearing customers for onboarding.

## Why this is NOT an existing project

Near-neighbors and why they do not solve this:

- **Generic graph/tree editors (Mermaid, Lucidchart, draw.io, org-chart tools):** They draw nodes and edges but perform zero ownership-percentage multiplication and have no concept of the 25% effective-ownership threshold or substantial-control test. They are diagramming tools, not computation engines.
- **Account-hierarchy / parent-child CRM tools (Salesforce account hierarchy, HubSpot company associations):** They model corporate parentage as a tree but never multiply fractional ownership through layers and have no KYB or beneficial-ownership logic.
- **KYC identity-verification vendors (Persona, Onfido, Alloy):** They verify the identity of a single named person; they do not resolve who the beneficial owners are from an ownership structure.
- **Full KYB suites (Middesk, Baselayer):** They fetch registry data and flag risk, but the layered effective-ownership multiplication plus FinCEN-specific 25%/substantial-control resolution with a documented control-test worksheet and discrepancy diffing is not their differentiated core; this tool is purpose-built and deterministic around exactly that math.
- **Cap-table tools (Carta, Pulley):** They track equity for a single company's funding rounds, not multi-entity layered ownership trees resolving to natural persons across holding companies and trusts.

The differentiator is **deterministic effective-ownership math through layered entities plus the FinCEN-specific threshold tests**, with a documented control-test worksheet and discrepancy detection against previously filed sets.

## Data Model (tables)

- `workspaces` — tenant container for cases and entities.
- `workspace_members` — user membership in a workspace with role.
- `cases` — a BOI/KYB resolution case for a target entity.
- `entities` — companies, holding companies, trusts, intermediate entities, and natural persons in a case graph.
- `ownership_edges` — directed edges with ownership percentage from owner entity to owned entity.
- `control_relationships` — non-equity control links (board control, senior officer, voting agreement).
- `resolutions` — a computed run resolving effective ownership and thresholds for a case.
- `resolved_owners` — per-resolution output rows: each natural person with effective ownership %, threshold flags.
- `ownership_paths` — the contributing paths and per-path percentages for a resolved owner.
- `control_findings` — substantial-control determinations with documented basis.
- `control_worksheet_items` — line items of evidence/criteria backing a control finding.
- `snapshots` — versioned frozen copies of a case graph.
- `snapshot_entities` / `snapshot_edges` — frozen graph contents per snapshot.
- `diffs` — computed before/after comparison between two snapshots or resolutions.
- `filed_owners` — the previously filed/declared beneficial-owner set for a case.
- `discrepancies` — detected differences between computed and filed sets.
- `trusts` — trust-specific detail (trustees, beneficiaries, grantor) for trust entities.
- `documents` — uploaded supporting documents attached to entities/findings.
- `notes` — analyst notes on cases/entities/findings.
- `audit_log` — immutable record of mutations for compliance.
- `exports` — generated roster/diagram/report export records.
- `tags` — labels for cases and entities.
- `case_tags` — join of cases to tags.
- `seed_scenarios` — built-in sample-data scenarios (circular ownership, trust-layer traps).
- `plans` / `subscriptions` — billing.

## Major Features

### 1. Layered ownership graph editor
Create entities (company, holding company, trust, intermediate, natural person), draw directed ownership edges with percentages, edit/move/delete nodes, validate that direct ownership of any entity does not exceed 100%, support cross-holdings and circular structures, inline edge percentage editing, bulk import of edges, and a canvas + table view of the graph.

### 2. Effective indirect ownership computation
Deterministically multiply direct percentages through every path from each natural person to the target, summing across all paths, with cycle-safe traversal (damping/visited-set), per-path breakdown, and full traceability of each contribution.

### 3. 25% beneficial-ownership threshold resolver
Flag every natural person whose summed effective ownership is at or above 25%, with configurable threshold, near-threshold warnings (e.g. 20-25%), and per-person path evidence.

### 4. Substantial-control test resolver
Separately identify persons meeting substantial-control criteria (senior officer, authority to appoint/remove, important-decision authority, any other substantial control) independent of ownership percentage.

### 5. Control-test worksheet
For each control finding, record the documented basis: which criterion applies, the supporting evidence, the analyst rationale, and worksheet line items, producing an auditable record per finding.

### 6. Discrepancy detector
Compare the computed beneficial-owner set against the previously filed/declared set, flagging additions, removals, percentage changes, and threshold-crossing changes, with severity classification.

### 7. Filed-set management
Import/record the previously filed BOI set per case, edit declared owners and percentages, and mark which filing it corresponds to.

### 8. Versioned ownership snapshots
Freeze the current case graph as an immutable snapshot, list snapshots, restore a snapshot into the working graph, and label snapshots.

### 9. Before/after diffs
Compute and render diffs between two snapshots (or two resolutions): entities added/removed, edges changed, resolved-owner set changes, and effective-percentage deltas.

### 10. Exportable BO roster
Generate a beneficial-owner roster (CSV/JSON) listing each qualifying natural person, their effective ownership, control basis, and the reason they qualify.

### 11. Ownership-chain diagram export
Generate an exportable diagram (DOT/SVG/JSON) of the ownership tree with percentages on edges and qualifying owners highlighted.

### 12. Sample-data seeder with traps
Built-in scenarios that seed a case with deliberate traps: circular ownership, trust-layer indirection, just-below-threshold splits, and nominee chains, for demoability and training.

### 13. Trust modeling
Trust-specific entity detail: trustees, beneficiaries, grantor, and rules for how trust interests flow to natural persons for ownership and control purposes.

### 14. Entity registry / management
CRUD for all entities, entity types, jurisdiction, registration number, formation date, and entity-level documents and notes.

### 15. Case management
Create cases for a target entity, set the target, case status (draft, in-review, resolved, filed), assignee, and case-level metadata.

### 16. Resolution history
Persist every resolution run with timestamp, inputs hash, resolved owners, and the ability to compare runs over time.

### 17. Ownership-path explorer
For any natural person, list every contributing path with the multiplied percentage and the entities traversed, sortable by contribution.

### 18. Validation and integrity checks
Detect over-100% ownership of an entity, orphan entities, dangling edges, self-loops, and unreachable natural persons, surfacing warnings before resolution.

### 19. Documents and evidence
Upload supporting documents, attach to entities/findings, and reference them in control-test worksheets.

### 20. Notes and collaboration
Threaded notes on cases, entities, and findings; workspace membership and roles.

### 21. Audit log
Immutable log of every mutating action (entity/edge changes, resolutions, filings) for compliance traceability.

### 22. Tagging and search
Tag cases and entities; search/filter cases by status, tag, assignee, and target entity.

### 23. Dashboard and metrics
Per-workspace overview: open cases, cases with discrepancies, recently resolved, qualifying-owner counts, and near-threshold alerts.

### 24. Workspace settings and billing
Manage workspace, members, default threshold, and (optional, 503-stubbed) Stripe billing for plan upgrade.

## API Surface

REST under `/api/v1`. Public reads for catalog/seed data; auth-gated writes with ownership checks. Domains: workspaces, members, cases, entities, edges, control-relationships, resolutions, resolved-owners (via resolution), paths, control-findings, worksheet-items, snapshots, diffs, filed-owners, discrepancies, trusts, documents, notes, audit-log, exports, tags, seed, dashboard, billing.

## Frontend Pages (~24)

Public: landing, sign-in, sign-up, pricing.
Dashboard: overview, cases list, case detail, graph editor, entities, entity detail, resolutions, resolution detail, owners roster, paths explorer, control findings, control worksheet, discrepancies, filed set, snapshots, snapshot diff, trusts, documents, notes, audit log, exports, seed scenarios, tags, settings.
