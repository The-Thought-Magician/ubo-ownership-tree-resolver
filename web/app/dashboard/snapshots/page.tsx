'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

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
  case_id: string
  label: string
  entity_count: number
  edge_count: number
  created_by?: string
  created_at?: string
}

interface SnapshotEntity {
  id: string
  original_entity_id: string
  name: string
  entity_type: string | null
  is_natural_person: boolean
  is_target: boolean
}

interface SnapshotEdge {
  id: string
  owner_entity_id: string
  owned_entity_id: string
  percentage: number | null
  edge_type: string | null
}

interface SnapshotDetail {
  snapshot: Snapshot
  entities: SnapshotEntity[]
  edges: SnapshotEdge[]
}

function fmtDate(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString()
}

function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${Number(n).toFixed(2).replace(/\.00$/, '')}%`
}

export default function SnapshotsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')

  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [detail, setDetail] = useState<SnapshotDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const ws: Workspace[] = await api.getWorkspaces()
        if (cancelled) return
        setWorkspaces(ws || [])
        if (!ws || ws.length === 0) {
          setLoading(false)
          return
        }
        const allCases: Case[] = []
        for (const w of ws) {
          const cs: Case[] = await api.getCases(w.id)
          allCases.push(...(cs || []))
        }
        if (cancelled) return
        setCases(allCases)
        if (allCases.length > 0) setCaseId(allCases[0].id)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load workspaces')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadSnapshots = useCallback(async (cid: string) => {
    if (!cid) {
      setSnapshots([])
      return
    }
    try {
      setListLoading(true)
      setError(null)
      const rows: Snapshot[] = await api.getSnapshots(cid)
      const sorted = [...(rows || [])].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      setSnapshots(sorted)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load snapshots')
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    if (caseId) void loadSnapshots(caseId)
    setDetail(null)
    setDetailId(null)
  }, [caseId, loadSnapshots])

  async function createSnapshot() {
    if (!caseId) return
    if (!label.trim()) {
      setCreateError('Label is required.')
      return
    }
    try {
      setCreating(true)
      setCreateError(null)
      await api.createSnapshot({ case_id: caseId, label: label.trim() })
      setCreateOpen(false)
      setLabel('')
      setNotice('Snapshot created from the current working graph.')
      await loadSnapshots(caseId)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create snapshot')
    } finally {
      setCreating(false)
    }
  }

  async function viewDetail(s: Snapshot) {
    if (detailId === s.id) {
      setDetail(null)
      setDetailId(null)
      return
    }
    try {
      setDetailLoading(true)
      setDetailId(s.id)
      setError(null)
      const d: SnapshotDetail = await api.getSnapshot(s.id)
      setDetail(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load snapshot detail')
      setDetailId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  async function restore(s: Snapshot) {
    if (
      !confirm(
        `Restore snapshot "${s.label}"? This replaces the current working graph (${s.entity_count} entities, ${s.edge_count} edges).`
      )
    )
      return
    try {
      setBusyId(s.id)
      setError(null)
      await api.restoreSnapshot(s.id)
      setNotice(`Working graph restored from "${s.label}".`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to restore snapshot')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(s: Snapshot) {
    if (!confirm(`Delete snapshot "${s.label}"? This cannot be undone.`)) return
    try {
      setBusyId(s.id)
      setError(null)
      await api.deleteSnapshot(s.id)
      if (detailId === s.id) {
        setDetail(null)
        setDetailId(null)
      }
      await loadSnapshots(caseId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete snapshot')
    } finally {
      setBusyId(null)
    }
  }

  const stats = useMemo(() => {
    const total = snapshots.length
    const maxEntities = snapshots.reduce((m, s) => Math.max(m, s.entity_count || 0), 0)
    const maxEdges = snapshots.reduce((m, s) => Math.max(m, s.edge_count || 0), 0)
    const latest = snapshots[0]
    return { total, maxEntities, maxEdges, latest }
  }, [snapshots])

  const entityNameById = useMemo(() => {
    const map = new Map<string, string>()
    detail?.entities.forEach((e) => map.set(e.original_entity_id, e.name))
    return map
  }, [detail])

  if (loading) return <PageSpinner label="Loading snapshots..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-100">Snapshots</h1>
          <p className="mt-1 text-sm text-stone-500">
            Versioned freezes of a case ownership graph. Capture a snapshot before edits, then restore or diff it later.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={!caseId}>
          + Capture Snapshot
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-emerald-400 hover:text-emerald-200">
            Dismiss
          </button>
        </div>
      )}

      {workspaces.length === 0 ? (
        <EmptyState title="No workspace yet" description="Create a workspace and a case to capture snapshots." />
      ) : cases.length === 0 ? (
        <EmptyState
          title="No cases available"
          description="Create a case and build its ownership graph before capturing snapshots."
        />
      ) : (
        <>
          <Card>
            <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="text-xs font-medium uppercase tracking-wide text-stone-500">Case</label>
              <select
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none sm:w-80"
              >
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </CardBody>
          </Card>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Snapshots" value={stats.total} />
            <Stat label="Largest Entity Count" value={stats.maxEntities} tone="indigo" />
            <Stat label="Largest Edge Count" value={stats.maxEdges} tone="indigo" />
            <Stat label="Latest Capture" value={stats.latest ? fmtDate(stats.latest.created_at).split(',')[0] : '—'} />
          </div>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-200">Version History</h2>
              <span className="text-xs text-stone-500">{snapshots.length} snapshot(s)</span>
            </CardHeader>
            <CardBody className="p-0">
              {listLoading ? (
                <div className="py-12">
                  <Spinner label="Loading snapshots..." />
                </div>
              ) : snapshots.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title="No snapshots yet"
                    description="Capture the current ownership graph to create the first version."
                    action={<Button onClick={() => setCreateOpen(true)}>+ Capture Snapshot</Button>}
                  />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Label</TH>
                      <TH>Entities</TH>
                      <TH>Edges</TH>
                      <TH>Captured</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {snapshots.map((s, i) => (
                      <TR key={s.id}>
                        <TD className="font-medium text-stone-100">
                          <div className="flex items-center gap-2">
                            {s.label}
                            {i === 0 && <Badge tone="green">latest</Badge>}
                          </div>
                        </TD>
                        <TD className="tabular-nums">{s.entity_count}</TD>
                        <TD className="tabular-nums">{s.edge_count}</TD>
                        <TD className="text-stone-400">{fmtDate(s.created_at)}</TD>
                        <TD className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => viewDetail(s)}>
                              {detailId === s.id ? 'Hide' : 'Inspect'}
                            </Button>
                            <Button
                              variant="secondary"
                              className="px-2 py-1 text-xs"
                              disabled={busyId === s.id}
                              onClick={() => restore(s)}
                            >
                              {busyId === s.id ? '...' : 'Restore'}
                            </Button>
                            <Button
                              variant="ghost"
                              className="px-2 py-1 text-xs text-rose-400 hover:text-rose-300"
                              disabled={busyId === s.id}
                              onClick={() => remove(s)}
                            >
                              Delete
                            </Button>
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>

          {detailId && (
            <Card>
              <CardHeader className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-stone-200">
                  Snapshot Contents{detail ? ` — ${detail.snapshot.label}` : ''}
                </h2>
                <button
                  onClick={() => {
                    setDetail(null)
                    setDetailId(null)
                  }}
                  className="text-xs text-stone-500 hover:text-stone-300"
                >
                  Close
                </button>
              </CardHeader>
              <CardBody>
                {detailLoading || !detail ? (
                  <div className="py-8">
                    <Spinner label="Loading contents..." />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                        Entities ({detail.entities.length})
                      </h3>
                      {detail.entities.length === 0 ? (
                        <p className="text-sm text-stone-500">No entities captured.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {detail.entities.map((e) => (
                            <div
                              key={e.id}
                              className="flex items-center justify-between rounded-lg border border-stone-800 bg-stone-950/40 px-3 py-2"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-stone-200">{e.name}</span>
                                {e.is_target && <Badge tone="indigo">target</Badge>}
                                {e.is_natural_person && <Badge tone="sky">person</Badge>}
                              </div>
                              <span className="text-xs text-stone-500">{e.entity_type || '—'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                        Ownership Edges ({detail.edges.length})
                      </h3>
                      {detail.edges.length === 0 ? (
                        <p className="text-sm text-stone-500">No edges captured.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {detail.edges.map((edge) => (
                            <div
                              key={edge.id}
                              className="flex items-center gap-2 rounded-lg border border-stone-800 bg-stone-950/40 px-3 py-2 text-sm"
                            >
                              <span className="text-stone-300">
                                {entityNameById.get(edge.owner_entity_id) || edge.owner_entity_id.slice(0, 8)}
                              </span>
                              <span className="text-stone-600">→</span>
                              <span className="text-stone-300">
                                {entityNameById.get(edge.owned_entity_id) || edge.owned_entity_id.slice(0, 8)}
                              </span>
                              <span className="ml-auto tabular-nums text-indigo-300">{pct(edge.percentage)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        title="Capture Snapshot"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={createSnapshot} disabled={creating}>
              {creating ? 'Capturing...' : 'Capture'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {createError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {createError}
            </div>
          )}
          <p className="text-sm text-stone-400">
            This freezes the current entities and ownership edges of the selected case into a named version.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Pre-restructure baseline"
              autoFocus
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
