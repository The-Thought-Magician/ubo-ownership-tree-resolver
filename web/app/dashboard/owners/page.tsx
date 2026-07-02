'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Spinner, PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Workspace {
  id: string
  name: string
}

interface Case {
  id: string
  name: string
}

interface Resolution {
  id: string
  case_id: string
  threshold: number
  qualifying_count: number
  control_count: number
  created_at?: string
}

interface ResolvedOwner {
  id: string
  person_entity_id: string
  person_name: string
  effective_ownership: number
  meets_ownership_threshold: boolean
  meets_substantial_control: boolean
  near_threshold: boolean
}

interface ExportRecord {
  id: string
  case_id: string
  resolution_id?: string | null
  export_type: string
  format: string
  content?: string | null
  created_at?: string
}

const WS_KEY = 'ubo.workspace'
type Filter = 'all' | 'qualifying' | 'control' | 'near'

function shortDate(d?: string): string {
  if (!d) return '—'
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? d : t.toLocaleString()
}

export default function OwnersRosterPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')
  const [resolutions, setResolutions] = useState<Resolution[]>([])
  const [resolutionId, setResolutionId] = useState('')

  const [owners, setOwners] = useState<ResolvedOwner[]>([])
  const [exportsList, setExportsList] = useState<ExportRecord[]>([])

  const [loadingTop, setLoadingTop] = useState(true)
  const [loadingOwners, setLoadingOwners] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [filter, setFilter] = useState<Filter>('qualifying')
  const [search, setSearch] = useState('')
  const [format, setFormat] = useState<'json' | 'csv'>('csv')
  const [exporting, setExporting] = useState(false)
  const [viewExport, setViewExport] = useState<ExportRecord | null>(null)

  // workspaces
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingTop(true)
      setError(null)
      try {
        const ws = (await api.getWorkspaces()) as Workspace[]
        if (cancelled) return
        const list = Array.isArray(ws) ? ws : []
        setWorkspaces(list)
        const stored = typeof window !== 'undefined' ? window.localStorage.getItem(WS_KEY) : null
        setWorkspaceId(list.find((w) => w.id === stored)?.id || list[0]?.id || '')
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load workspaces')
      } finally {
        if (!cancelled) setLoadingTop(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // cases
  useEffect(() => {
    if (!workspaceId) {
      setCases([])
      setCaseId('')
      return
    }
    if (typeof window !== 'undefined') window.localStorage.setItem(WS_KEY, workspaceId)
    let cancelled = false
    ;(async () => {
      try {
        const cs = (await api.getCases(workspaceId)) as Case[]
        if (cancelled) return
        const list = Array.isArray(cs) ? cs : []
        setCases(list)
        setCaseId((prev) => list.find((c) => c.id === prev)?.id || list[0]?.id || '')
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load cases')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const loadExports = useCallback(async (cid: string) => {
    if (!cid) {
      setExportsList([])
      return
    }
    try {
      const ex = (await api.getExports(cid)) as ExportRecord[]
      setExportsList(Array.isArray(ex) ? ex : [])
    } catch {
      setExportsList([])
    }
  }, [])

  // resolutions + exports when case changes
  useEffect(() => {
    if (!caseId) {
      setResolutions([])
      setResolutionId('')
      setExportsList([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const rs = (await api.getResolutions(caseId)) as Resolution[]
        if (cancelled) return
        const list = (Array.isArray(rs) ? rs : []).sort((a, b) =>
          (b.created_at || '').localeCompare(a.created_at || ''),
        )
        setResolutions(list)
        setResolutionId((prev) => list.find((r) => r.id === prev)?.id || list[0]?.id || '')
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load resolutions')
      }
    })()
    loadExports(caseId)
    return () => {
      cancelled = true
    }
  }, [caseId, loadExports])

  // owners when resolution changes
  useEffect(() => {
    if (!resolutionId) {
      setOwners([])
      return
    }
    let cancelled = false
    ;(async () => {
      setLoadingOwners(true)
      setError(null)
      try {
        const list = (await api.getOwners(resolutionId)) as ResolvedOwner[]
        if (!cancelled) setOwners(Array.isArray(list) ? list : [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load owners')
      } finally {
        if (!cancelled) setLoadingOwners(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [resolutionId])

  const activeResolution = useMemo(
    () => resolutions.find((r) => r.id === resolutionId),
    [resolutions, resolutionId],
  )

  const counts = useMemo(
    () => ({
      all: owners.length,
      qualifying: owners.filter((o) => o.meets_ownership_threshold).length,
      control: owners.filter((o) => o.meets_substantial_control).length,
      near: owners.filter((o) => o.near_threshold).length,
    }),
    [owners],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = [...owners].sort((a, b) => (b.effective_ownership || 0) - (a.effective_ownership || 0))
    if (filter === 'qualifying') list = list.filter((o) => o.meets_ownership_threshold)
    else if (filter === 'control') list = list.filter((o) => o.meets_substantial_control)
    else if (filter === 'near') list = list.filter((o) => o.near_threshold)
    if (q) list = list.filter((o) => (o.person_name || '').toLowerCase().includes(q))
    return list
  }, [owners, filter, search])

  async function handleExport() {
    if (!caseId || !resolutionId) return
    setExporting(true)
    setActionError(null)
    try {
      await api.exportRoster({ case_id: caseId, resolution_id: resolutionId, format })
      await loadExports(caseId)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  async function openExport(ex: ExportRecord) {
    setActionError(null)
    try {
      const full = (await api.getExport(ex.id)) as ExportRecord
      setViewExport(full && (full.content || full.id) ? full : ex)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to load export')
      setViewExport(ex)
    }
  }

  const rosterExports = useMemo(
    () =>
      exportsList
        .filter((e) => (e.export_type || '').toLowerCase().includes('roster') || e.export_type === 'roster')
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [exportsList],
  )

  if (loadingTop) return <PageSpinner label="Loading workspaces..." />

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-100">Owners Roster</h1>
          <p className="mt-1 text-sm text-stone-500">
            Beneficial-ownership roster for a selected resolution, ready for export.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            disabled={cases.length === 0}
            className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {cases.length === 0 && <option value="">No cases</option>}
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={resolutionId}
            onChange={(e) => setResolutionId(e.target.value)}
            disabled={resolutions.length === 0}
            className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {resolutions.length === 0 && <option value="">No resolutions</option>}
            {resolutions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id.slice(0, 8)} · {shortDate(r.created_at)}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}
      {actionError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {actionError}
        </div>
      )}

      {workspaces.length === 0 ? (
        <EmptyState title="No workspaces yet" description="Create a workspace to begin." />
      ) : cases.length === 0 ? (
        <EmptyState
          title="No cases in this workspace"
          description={
            <Link href="/dashboard/cases" className="text-indigo-400 hover:underline">
              Create a case
            </Link>
          }
        />
      ) : resolutions.length === 0 ? (
        <EmptyState
          title="No resolutions for this case"
          description={
            <>
              Run a resolution from the{' '}
              <Link href="/dashboard/resolutions" className="text-indigo-400 hover:underline">
                Resolutions
              </Link>{' '}
              page to build a roster.
            </>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Roster size" value={counts.all} tone="indigo" />
            <Stat label="Meets threshold" value={counts.qualifying} tone="green" />
            <Stat label="Substantial control" value={counts.control} tone="amber" />
            <Stat
              label="Near threshold"
              value={counts.near}
              tone={counts.near > 0 ? 'rose' : 'default'}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-stone-200">Beneficial owners</h2>
                {activeResolution && (
                  <p className="mt-0.5 text-xs text-stone-500">
                    Resolution {activeResolution.id.slice(0, 8)} · threshold{' '}
                    {activeResolution.threshold}%
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'qualifying', 'control', 'near'] as Filter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                      filter === f
                        ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                        : 'border-stone-700 text-stone-400 hover:border-stone-600 hover:text-stone-200'
                    }`}
                  >
                    {f} ({counts[f]})
                  </button>
                ))}
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name"
                  className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm text-stone-200 placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:w-44"
                />
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as 'json' | 'csv')}
                  className="rounded-lg border border-stone-700 bg-stone-900 px-2 py-1.5 text-sm text-stone-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
                <Button onClick={handleExport} disabled={exporting || !resolutionId}>
                  {exporting ? <Spinner className="mr-2" /> : null}
                  {exporting ? 'Exporting...' : 'Export roster'}
                </Button>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              {loadingOwners ? (
                <div className="px-5 py-10">
                  <Spinner label="Loading roster..." />
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-5 py-10">
                  <EmptyState
                    title={owners.length === 0 ? 'No owners in this resolution' : 'No matches'}
                    description={
                      owners.length === 0
                        ? 'This resolution produced no resolved owners.'
                        : 'Adjust the filter or search.'
                    }
                  />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH className="w-10">#</TH>
                      <TH>Person</TH>
                      <TH>Effective ownership</TH>
                      <TH>Threshold</TH>
                      <TH>Control</TH>
                      <TH>Near</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {filtered.map((o, i) => (
                      <TR key={o.id}>
                        <TD className="text-stone-600">{i + 1}</TD>
                        <TD>
                          <div className="font-medium text-stone-100">{o.person_name}</div>
                          <div className="font-mono text-[10px] text-stone-600">
                            {o.person_entity_id.slice(0, 8)}
                          </div>
                        </TD>
                        <TD>
                          <div className="flex items-center gap-3">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-stone-800">
                              <div
                                className={`h-full rounded-full ${
                                  o.meets_ownership_threshold
                                    ? 'bg-emerald-500'
                                    : o.near_threshold
                                      ? 'bg-amber-500'
                                      : 'bg-stone-600'
                                }`}
                                style={{ width: `${Math.min(100, o.effective_ownership || 0)}%` }}
                              />
                            </div>
                            <span className="tabular-nums text-stone-100">
                              {(o.effective_ownership || 0).toFixed(2)}%
                            </span>
                          </div>
                        </TD>
                        <TD>
                          {o.meets_ownership_threshold ? (
                            <Badge tone="green">Yes</Badge>
                          ) : (
                            <span className="text-xs text-stone-600">No</span>
                          )}
                        </TD>
                        <TD>
                          {o.meets_substantial_control ? (
                            <Badge tone="amber">Yes</Badge>
                          ) : (
                            <span className="text-xs text-stone-600">No</span>
                          )}
                        </TD>
                        <TD>
                          {o.near_threshold ? (
                            <Badge tone="rose">Near</Badge>
                          ) : (
                            <span className="text-xs text-stone-600">—</span>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-stone-200">
                Roster exports for this case ({rosterExports.length})
              </h2>
            </CardHeader>
            <CardBody className="p-0">
              {rosterExports.length === 0 ? (
                <div className="px-5 py-8">
                  <EmptyState
                    title="No roster exports yet"
                    description="Use Export roster above to generate a downloadable beneficial-owner roster."
                  />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Export</TH>
                      <TH>Format</TH>
                      <TH>Resolution</TH>
                      <TH>Created</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {rosterExports.map((ex) => (
                      <TR key={ex.id}>
                        <TD className="font-mono text-xs text-stone-300">{ex.id.slice(0, 8)}</TD>
                        <TD>
                          <Badge tone="indigo">{(ex.format || 'json').toUpperCase()}</Badge>
                        </TD>
                        <TD className="font-mono text-xs text-stone-500">
                          {ex.resolution_id ? ex.resolution_id.slice(0, 8) : '—'}
                        </TD>
                        <TD className="text-xs text-stone-500">{shortDate(ex.created_at)}</TD>
                        <TD className="text-right">
                          <Button
                            variant="secondary"
                            className="px-3 py-1 text-xs"
                            onClick={() => openExport(ex)}
                          >
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

      <Modal
        open={!!viewExport}
        onClose={() => setViewExport(null)}
        title={`Export ${viewExport?.id.slice(0, 8) ?? ''}`}
        className="max-w-3xl"
        footer={
          <>
            {viewExport?.content && (
              <Button
                variant="secondary"
                onClick={() => {
                  if (!viewExport?.content) return
                  const blob = new Blob([viewExport.content], {
                    type: viewExport.format === 'csv' ? 'text/csv' : 'application/json',
                  })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `roster-${viewExport.id.slice(0, 8)}.${viewExport.format || 'json'}`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
              >
                Download
              </Button>
            )}
            <Button onClick={() => setViewExport(null)}>Close</Button>
          </>
        }
      >
        {viewExport?.content ? (
          <pre className="max-h-[55vh] overflow-auto rounded-lg border border-stone-800 bg-stone-950 p-3 text-xs text-stone-300">
            {viewExport.content}
          </pre>
        ) : (
          <p className="text-sm text-stone-500">This export has no stored content.</p>
        )}
      </Modal>
    </div>
  )
}
