'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'

interface Workspace {
  id: string
  name: string
}
interface Case {
  id: string
  name: string
  status?: string
}
interface Snapshot {
  id: string
  label?: string
  entity_count?: number
  edge_count?: number
  created_at?: string
}
interface Resolution {
  id: string
  threshold?: number
  qualifying_count?: number
  control_count?: number
  status?: string
  created_at?: string
}
interface Diff {
  id: string
  case_id: string
  from_snapshot_id?: string | null
  to_snapshot_id?: string | null
  from_resolution_id?: string | null
  to_resolution_id?: string | null
  result?: unknown
  created_at?: string
}

type Mode = 'snapshots' | 'resolutions'

function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  if (v && typeof v === 'object') {
    for (const key of ['data', 'items', 'rows', 'results']) {
      const inner = (v as Record<string, unknown>)[key]
      if (Array.isArray(inner)) return inner as T[]
    }
  }
  return []
}

function fmtDate(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString()
}

function shortId(id?: string | null): string {
  if (!id) return '—'
  return id.length > 10 ? `${id.slice(0, 8)}…` : id
}

/** Normalize a diff `result` jsonb into rows for rendering. Backend shape is
 * not strictly typed, so we defensively extract added/removed/changed buckets. */
interface DiffRow {
  kind: 'added' | 'removed' | 'changed' | 'unchanged'
  label: string
  before?: string
  after?: string
}

function flattenDiffResult(result: unknown): {
  rows: DiffRow[]
  counts: { added: number; removed: number; changed: number }
} {
  const rows: DiffRow[] = []
  const counts = { added: 0, removed: 0, changed: 0 }
  if (!result || typeof result !== 'object') return { rows, counts }
  const r = result as Record<string, unknown>

  const pushBucket = (bucket: unknown, kind: DiffRow['kind']) => {
    const items = asArray<Record<string, unknown>>(bucket)
    for (const it of items) {
      const label =
        (it.name as string) ||
        (it.label as string) ||
        (it.person_name as string) ||
        (it.id as string) ||
        JSON.stringify(it)
      let before: string | undefined
      let after: string | undefined
      if (kind === 'changed') {
        const b = it.before ?? it.from ?? it.old
        const a = it.after ?? it.to ?? it.new
        before = b == null ? undefined : typeof b === 'object' ? JSON.stringify(b) : String(b)
        after = a == null ? undefined : typeof a === 'object' ? JSON.stringify(a) : String(a)
        counts.changed += 1
      } else if (kind === 'added') {
        counts.added += 1
      } else if (kind === 'removed') {
        counts.removed += 1
      }
      rows.push({ kind, label: String(label).slice(0, 80), before, after })
    }
  }

  // Common bucket names across snapshot + resolution diffs.
  pushBucket(r.added ?? r.added_entities ?? r.added_owners ?? r.added_edges, 'added')
  pushBucket(r.removed ?? r.removed_entities ?? r.removed_owners ?? r.removed_edges, 'removed')
  pushBucket(r.changed ?? r.changed_entities ?? r.changed_owners ?? r.changed_edges, 'changed')

  return { rows, counts }
}

export default function DiffsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')

  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [resolutions, setResolutions] = useState<Resolution[]>([])
  const [diffs, setDiffs] = useState<Diff[]>([])

  const [mode, setMode] = useState<Mode>('snapshots')
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')

  const [selectedDiff, setSelectedDiff] = useState<Diff | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)

  const [bootLoading, setBootLoading] = useState(true)
  const [caseLoading, setCaseLoading] = useState(false)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState('')

  // Bootstrap: workspaces -> first workspace -> cases.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setBootLoading(true)
        const ws = asArray<Workspace>(await api.getWorkspaces())
        if (cancelled) return
        setWorkspaces(ws)
        if (ws.length) setWorkspaceId(ws[0].id)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load workspaces')
      } finally {
        if (!cancelled) setBootLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    ;(async () => {
      try {
        const cs = asArray<Case>(await api.getCases(workspaceId))
        if (cancelled) return
        setCases(cs)
        setCaseId((prev) => (cs.some((c) => c.id === prev) ? prev : cs[0]?.id ?? ''))
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load cases')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const loadCaseData = useCallback(async (cid: string) => {
    setCaseLoading(true)
    setError('')
    try {
      const [snaps, res, dfs] = await Promise.all([
        api.getSnapshots(cid),
        api.getResolutions(cid),
        api.getDiffs(cid),
      ])
      setSnapshots(asArray<Snapshot>(snaps))
      setResolutions(asArray<Resolution>(res))
      setDiffs(asArray<Diff>(dfs))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load case data')
    } finally {
      setCaseLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!caseId) {
      setSnapshots([])
      setResolutions([])
      setDiffs([])
      return
    }
    loadCaseData(caseId)
    setFromId('')
    setToId('')
    setSelectedDiff(null)
  }, [caseId, loadCaseData])

  const options = mode === 'snapshots' ? snapshots : resolutions
  const optionLabel = (o: Snapshot | Resolution): string => {
    if (mode === 'snapshots') {
      const s = o as Snapshot
      return `${s.label || 'Snapshot'} · ${s.entity_count ?? 0} entities · ${fmtDate(s.created_at)}`
    }
    const r = o as Resolution
    return `Resolution @${r.threshold ?? '?'}% · ${r.qualifying_count ?? 0} qualifying · ${fmtDate(r.created_at)}`
  }

  const canBuild = Boolean(fromId && toId && fromId !== toId && !building)

  async function build() {
    if (!canBuild) return
    setBuilding(true)
    setError('')
    try {
      let diff: Diff
      if (mode === 'snapshots') {
        diff = (await api.diffSnapshots({ from_snapshot_id: fromId, to_snapshot_id: toId })) as Diff
      } else {
        diff = (await api.diffResolutions({ from_resolution_id: fromId, to_resolution_id: toId })) as Diff
      }
      setSelectedDiff(diff)
      // Refresh saved diff list so the new one appears.
      if (caseId) {
        const dfs = asArray<Diff>(await api.getDiffs(caseId))
        setDiffs(dfs)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to build diff')
    } finally {
      setBuilding(false)
    }
  }

  async function openDiff(id: string) {
    setLoadingDiff(true)
    setError('')
    try {
      const d = (await api.getDiff(id)) as Diff
      setSelectedDiff(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load diff')
    } finally {
      setLoadingDiff(false)
    }
  }

  const flat = useMemo(
    () => (selectedDiff ? flattenDiffResult(selectedDiff.result) : { rows: [], counts: { added: 0, removed: 0, changed: 0 } }),
    [selectedDiff],
  )

  const diffMode = (d: Diff): Mode =>
    d.from_resolution_id || d.to_resolution_id ? 'resolutions' : 'snapshots'

  if (bootLoading) return <PageSpinner label="Loading diffs workspace…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-100">Diffs</h1>
          <p className="mt-1 text-sm text-stone-500">
            Compare two snapshots or two resolution runs to surface added, removed, and changed beneficial owners.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {workspaces.length === 0 && <option value="">No workspaces</option>}
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <select
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {cases.length === 0 && <option value="">No cases</option>}
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      {!caseId ? (
        <EmptyState
          title="No case selected"
          description="Create a case and capture snapshots or run resolutions before building a diff."
        />
      ) : caseLoading ? (
        <PageSpinner label="Loading case data…" />
      ) : (
        <>
          {/* Diff builder */}
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-semibold text-stone-100">Build a diff</h2>
              <div className="inline-flex rounded-lg border border-stone-700 bg-stone-950 p-0.5">
                {(['snapshots', 'resolutions'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setMode(m)
                      setFromId('')
                      setToId('')
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                      mode === m ? 'bg-indigo-600 text-white' : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              {options.length < 2 ? (
                <p className="text-sm text-stone-500">
                  You need at least two {mode} in this case to build a diff. Currently {options.length}.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                      Before ({mode === 'snapshots' ? 'from snapshot' : 'from resolution'})
                    </label>
                    <select
                      value={fromId}
                      onChange={(e) => setFromId(e.target.value)}
                      className="w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select…</option>
                      {options.map((o) => (
                        <option key={o.id} value={o.id} disabled={o.id === toId}>
                          {optionLabel(o)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                      After ({mode === 'snapshots' ? 'to snapshot' : 'to resolution'})
                    </label>
                    <select
                      value={toId}
                      onChange={(e) => setToId(e.target.value)}
                      className="w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select…</option>
                      {options.map((o) => (
                        <option key={o.id} value={o.id} disabled={o.id === fromId}>
                          {optionLabel(o)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Button onClick={build} disabled={!canBuild}>
                  {building ? 'Building…' : 'Build diff'}
                </Button>
                {fromId && toId && fromId === toId && (
                  <span className="text-xs text-amber-300">Choose two different items.</span>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Rendered result */}
          {loadingDiff ? (
            <Card>
              <CardBody>
                <Spinner label="Loading diff…" />
              </CardBody>
            </Card>
          ) : selectedDiff ? (
            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-stone-100">Diff result</h2>
                  <Badge tone={diffMode(selectedDiff) === 'resolutions' ? 'indigo' : 'sky'}>
                    {diffMode(selectedDiff)}
                  </Badge>
                </div>
                <span className="text-xs text-stone-500">{fmtDate(selectedDiff.created_at)}</span>
              </CardHeader>
              <CardBody className="space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Added" value={flat.counts.added} tone="green" />
                  <Stat label="Removed" value={flat.counts.removed} tone="rose" />
                  <Stat label="Changed" value={flat.counts.changed} tone="amber" />
                </div>

                {flat.rows.length === 0 ? (
                  <EmptyState
                    title="No structural changes detected"
                    description="The two selected items resolved to the same beneficial-ownership picture."
                  />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Change</TH>
                        <TH>Subject</TH>
                        <TH>Before</TH>
                        <TH>After</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {flat.rows.map((row, i) => (
                        <TR key={i}>
                          <TD>
                            <Badge
                              tone={
                                row.kind === 'added'
                                  ? 'green'
                                  : row.kind === 'removed'
                                    ? 'rose'
                                    : row.kind === 'changed'
                                      ? 'amber'
                                      : 'slate'
                              }
                            >
                              {row.kind}
                            </Badge>
                          </TD>
                          <TD className="font-medium text-stone-200">{row.label}</TD>
                          <TD className="text-stone-400">{row.before ?? '—'}</TD>
                          <TD className="text-stone-400">{row.after ?? '—'}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}

                <details className="rounded-lg border border-stone-800 bg-stone-950/60">
                  <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-stone-400 hover:text-stone-200">
                    Raw result JSON
                  </summary>
                  <pre className="max-h-80 overflow-auto px-4 py-3 text-xs text-stone-400">
                    {JSON.stringify(selectedDiff.result ?? {}, null, 2)}
                  </pre>
                </details>
              </CardBody>
            </Card>
          ) : null}

          {/* Saved diffs */}
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-stone-100">Saved diffs</h2>
            </CardHeader>
            <CardBody>
              {diffs.length === 0 ? (
                <EmptyState title="No saved diffs yet" description="Build a diff above and it will be saved here." />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Type</TH>
                      <TH>From</TH>
                      <TH>To</TH>
                      <TH>Created</TH>
                      <TH className="text-right">Action</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {diffs.map((d) => (
                      <TR key={d.id}>
                        <TD>
                          <Badge tone={diffMode(d) === 'resolutions' ? 'indigo' : 'sky'}>{diffMode(d)}</Badge>
                        </TD>
                        <TD className="font-mono text-xs text-stone-400">
                          {shortId(d.from_snapshot_id ?? d.from_resolution_id)}
                        </TD>
                        <TD className="font-mono text-xs text-stone-400">
                          {shortId(d.to_snapshot_id ?? d.to_resolution_id)}
                        </TD>
                        <TD className="text-xs text-stone-500">{fmtDate(d.created_at)}</TD>
                        <TD className="text-right">
                          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => openDiff(d.id)}>
                            View
                          </Button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
