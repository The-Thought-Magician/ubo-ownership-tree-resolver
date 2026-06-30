'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Workspace {
  id: string
  name: string
}

interface Resolution {
  id: string
  case_id: string
  threshold: number
  qualifying_count: number
  control_count: number
  status: string
  created_at: string
}

interface ResolvedOwner {
  id: string
  resolution_id: string
  person_entity_id: string | null
  person_name: string
  effective_ownership: number
  meets_ownership_threshold: boolean
  meets_substantial_control: boolean
  near_threshold: boolean
}

interface OwnershipPath {
  id: string
  resolved_owner_id: string
  resolution_id: string
  path_entity_ids: string[]
  path_labels: string[]
  path_percentage: number
  created_at: string
}

function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '0%'
  return `${Number(n).toFixed(2).replace(/\.00$/, '')}%`
}

function ownerTone(o: ResolvedOwner): 'green' | 'amber' | 'slate' {
  if (o.meets_ownership_threshold) return 'green'
  if (o.near_threshold) return 'amber'
  return 'slate'
}

export default function PathsExplorerPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState<string>('')

  const [resolutions, setResolutions] = useState<Resolution[]>([])
  const [resolutionId, setResolutionId] = useState<string>('')

  const [owners, setOwners] = useState<ResolvedOwner[]>([])
  const [allPaths, setAllPaths] = useState<OwnershipPath[]>([])
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('')
  const [ownerPaths, setOwnerPaths] = useState<OwnershipPath[]>([])

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'qualifying' | 'near' | 'control'>('all')

  const [bootLoading, setBootLoading] = useState(true)
  const [resLoading, setResLoading] = useState(false)
  const [ownersLoading, setOwnersLoading] = useState(false)
  const [pathsLoading, setPathsLoading] = useState(false)
  const [error, setError] = useState('')

  // bootstrap workspaces + their cases' resolutions
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setBootLoading(true)
        const ws: Workspace[] = await api.getWorkspaces()
        if (cancelled) return
        setWorkspaces(ws ?? [])
        if (ws && ws.length) setWorkspaceId(ws[0].id)
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

  // load resolutions across all cases in the chosen workspace
  const loadResolutions = useCallback(async (wsId: string) => {
    if (!wsId) {
      setResolutions([])
      return
    }
    setResLoading(true)
    setError('')
    try {
      const cases: Array<{ id: string; name: string }> = await api.getCases(wsId)
      const lists = await Promise.all(
        (cases ?? []).map(async (c) => {
          try {
            const rs: Resolution[] = await api.getResolutions(c.id)
            return (rs ?? []).map((r) => ({ ...r, _caseName: c.name }))
          } catch {
            return [] as Resolution[]
          }
        }),
      )
      const flat = lists.flat() as Resolution[]
      flat.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      setResolutions(flat)
      setResolutionId((prev) => (flat.some((r) => r.id === prev) ? prev : flat[0]?.id ?? ''))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load resolutions')
      setResolutions([])
    } finally {
      setResLoading(false)
    }
  }, [])

  useEffect(() => {
    if (workspaceId) loadResolutions(workspaceId)
  }, [workspaceId, loadResolutions])

  // load owners + all paths for the chosen resolution
  const loadResolutionData = useCallback(async (rid: string) => {
    if (!rid) {
      setOwners([])
      setAllPaths([])
      return
    }
    setOwnersLoading(true)
    setError('')
    try {
      const [os, ps] = await Promise.all([api.getOwners(rid), api.getPaths(rid)])
      const owns: ResolvedOwner[] = os ?? []
      owns.sort((a, b) => Number(b.effective_ownership) - Number(a.effective_ownership))
      setOwners(owns)
      setAllPaths(ps ?? [])
      setSelectedOwnerId((prev) => (owns.some((o) => o.id === prev) ? prev : owns[0]?.id ?? ''))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load resolution data')
      setOwners([])
      setAllPaths([])
    } finally {
      setOwnersLoading(false)
    }
  }, [])

  useEffect(() => {
    if (resolutionId) loadResolutionData(resolutionId)
  }, [resolutionId, loadResolutionData])

  // load contributing paths for the selected owner
  useEffect(() => {
    let cancelled = false
    if (!selectedOwnerId) {
      setOwnerPaths([])
      return
    }
    ;(async () => {
      setPathsLoading(true)
      try {
        const ps: OwnershipPath[] = await api.getOwnerPaths(selectedOwnerId)
        if (cancelled) return
        const sorted = (ps ?? []).slice().sort((a, b) => Number(b.path_percentage) - Number(a.path_percentage))
        setOwnerPaths(sorted)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load paths')
          setOwnerPaths([])
        }
      } finally {
        if (!cancelled) setPathsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedOwnerId])

  const filteredOwners = useMemo(() => {
    return owners.filter((o) => {
      if (search && !o.person_name.toLowerCase().includes(search.toLowerCase())) return false
      if (filter === 'qualifying' && !o.meets_ownership_threshold) return false
      if (filter === 'near' && !o.near_threshold) return false
      if (filter === 'control' && !o.meets_substantial_control) return false
      return true
    })
  }, [owners, search, filter])

  const selectedOwner = useMemo(
    () => owners.find((o) => o.id === selectedOwnerId) ?? null,
    [owners, selectedOwnerId],
  )

  const activeResolution = useMemo(
    () => resolutions.find((r) => r.id === resolutionId) ?? null,
    [resolutions, resolutionId],
  )

  // sum of contributing paths (should approximate effective ownership)
  const pathsSum = useMemo(
    () => ownerPaths.reduce((acc, p) => acc + Number(p.path_percentage || 0), 0),
    [ownerPaths],
  )
  const maxPathPct = useMemo(
    () => ownerPaths.reduce((m, p) => Math.max(m, Number(p.path_percentage || 0)), 0),
    [ownerPaths],
  )

  if (bootLoading) return <PageSpinner label="Loading workspaces..." />

  if (!workspaces.length) {
    return (
      <div className="space-y-6">
        <Header />
        <EmptyState
          title="No workspaces yet"
          description="Create a workspace and a case, build the ownership graph, then run a resolution to explore ownership paths."
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Header />

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* selectors */}
      <Card>
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Workspace
            </label>
            <select
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Resolution
            </label>
            <select
              value={resolutionId}
              onChange={(e) => setResolutionId(e.target.value)}
              disabled={resLoading || !resolutions.length}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
            >
              {resLoading && <option>Loading...</option>}
              {!resLoading && !resolutions.length && <option value="">No resolutions</option>}
              {resolutions.map((r) => (
                <option key={r.id} value={r.id}>
                  {(r as Resolution & { _caseName?: string })._caseName ?? 'Case'} · thr {pct(r.threshold)} ·{' '}
                  {new Date(r.created_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
          <Button variant="secondary" onClick={() => resolutionId && loadResolutionData(resolutionId)}>
            Refresh
          </Button>
        </CardBody>
      </Card>

      {!resolutions.length && !resLoading ? (
        <EmptyState
          title="No resolutions in this workspace"
          description="Run a resolution from the Resolutions page to compute effective ownership and produce ownership paths."
        />
      ) : (
        <>
          {/* stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Qualifying owners" value={activeResolution?.qualifying_count ?? owners.filter((o) => o.meets_ownership_threshold).length} tone="green" />
            <Stat label="Control flags" value={activeResolution?.control_count ?? owners.filter((o) => o.meets_substantial_control).length} tone="indigo" />
            <Stat label="Near threshold" value={owners.filter((o) => o.near_threshold).length} tone="amber" />
            <Stat label="Total paths" value={allPaths.length} hint={`across ${owners.length} owners`} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
            {/* owner list */}
            <Card className="overflow-hidden">
              <CardHeader className="space-y-3">
                <div className="text-sm font-semibold text-slate-100">People</div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
                />
                <div className="flex flex-wrap gap-1.5">
                  {(['all', 'qualifying', 'near', 'control'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize transition-colors ${
                        filter === f
                          ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300'
                          : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <div className="max-h-[520px] overflow-y-auto">
                {ownersLoading ? (
                  <div className="py-10">
                    <Spinner label="Loading owners..." />
                  </div>
                ) : filteredOwners.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-slate-500">No matching people.</div>
                ) : (
                  <ul className="divide-y divide-slate-800">
                    {filteredOwners.map((o) => (
                      <li key={o.id}>
                        <button
                          onClick={() => setSelectedOwnerId(o.id)}
                          className={`flex w-full items-center justify-between gap-2 px-5 py-3 text-left transition-colors ${
                            o.id === selectedOwnerId ? 'bg-indigo-500/10' : 'hover:bg-slate-800/50'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-100">{o.person_name}</div>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {o.meets_ownership_threshold && <Badge tone="green">Qualifying</Badge>}
                              {o.meets_substantial_control && <Badge tone="indigo">Control</Badge>}
                              {o.near_threshold && !o.meets_ownership_threshold && <Badge tone="amber">Near</Badge>}
                            </div>
                          </div>
                          <span className={`shrink-0 text-sm font-semibold tabular-nums ${
                            ownerTone(o) === 'green' ? 'text-emerald-300' : ownerTone(o) === 'amber' ? 'text-amber-300' : 'text-slate-300'
                          }`}>
                            {pct(o.effective_ownership)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>

            {/* path detail */}
            <div className="space-y-4">
              {selectedOwner ? (
                <>
                  <Card>
                    <CardBody className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Selected person</div>
                        <div className="mt-1 text-lg font-semibold text-slate-100">{selectedOwner.person_name}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {selectedOwner.meets_ownership_threshold && <Badge tone="green">Meets ownership threshold</Badge>}
                          {selectedOwner.meets_substantial_control && <Badge tone="indigo">Substantial control</Badge>}
                          {selectedOwner.near_threshold && <Badge tone="amber">Near threshold</Badge>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Effective ownership</div>
                        <div className="mt-1 text-3xl font-semibold tabular-nums text-indigo-300">
                          {pct(selectedOwner.effective_ownership)}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {ownerPaths.length} contributing path{ownerPaths.length === 1 ? '' : 's'} · Σ {pct(pathsSum)}
                        </div>
                      </div>
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader className="text-sm font-semibold text-slate-100">
                      Ownership paths (per-path multiplied percentages)
                    </CardHeader>
                    {pathsLoading ? (
                      <div className="py-10">
                        <Spinner label="Loading paths..." />
                      </div>
                    ) : ownerPaths.length === 0 ? (
                      <CardBody>
                        <EmptyState
                          title="No contributing paths"
                          description="This person may qualify solely through substantial control with no equity path, or paths were not recorded for this resolution."
                        />
                      </CardBody>
                    ) : (
                      <div className="space-y-3 px-5 py-4">
                        {ownerPaths.map((p, idx) => {
                          const labels = p.path_labels ?? []
                          const ids = p.path_entity_ids ?? []
                          const steps = labels.length ? labels : ids
                          const barW = maxPathPct > 0 ? (Number(p.path_percentage) / maxPathPct) * 100 : 0
                          return (
                            <div key={p.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Path {idx + 1}
                                </span>
                                <span className="text-sm font-semibold tabular-nums text-indigo-300">
                                  {pct(p.path_percentage)}
                                </span>
                              </div>
                              {/* chain */}
                              <div className="flex flex-wrap items-center gap-1.5">
                                {steps.map((label, i) => (
                                  <span key={i} className="flex items-center gap-1.5">
                                    <span className="rounded-md border border-slate-700 bg-slate-800/70 px-2 py-1 text-xs text-slate-200">
                                      {String(label)}
                                    </span>
                                    {i < steps.length - 1 && (
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-600">
                                        <path d="M5 12h14M13 6l6 6-6 6" />
                                      </svg>
                                    )}
                                  </span>
                                ))}
                              </div>
                              {/* contribution bar */}
                              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400"
                                  style={{ width: `${Math.max(barW, 2)}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </Card>

                  {/* breakdown table */}
                  {ownerPaths.length > 0 && (
                    <Card className="overflow-hidden">
                      <CardHeader className="text-sm font-semibold text-slate-100">Path breakdown</CardHeader>
                      <Table>
                        <THead>
                          <TR>
                            <TH>#</TH>
                            <TH>Chain length</TH>
                            <TH>Path</TH>
                            <TH className="text-right">Contribution</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {ownerPaths.map((p, idx) => {
                            const steps = (p.path_labels ?? p.path_entity_ids ?? []) as unknown[]
                            return (
                              <TR key={p.id}>
                                <TD className="tabular-nums">{idx + 1}</TD>
                                <TD className="tabular-nums">{steps.length}</TD>
                                <TD className="text-slate-400">{steps.map(String).join(' → ')}</TD>
                                <TD className="text-right font-semibold tabular-nums text-indigo-300">
                                  {pct(p.path_percentage)}
                                </TD>
                              </TR>
                            )
                          })}
                          <TR className="bg-slate-900/60">
                            <TD />
                            <TD />
                            <TD className="font-medium text-slate-300">Sum of paths</TD>
                            <TD className="text-right font-semibold tabular-nums text-emerald-300">{pct(pathsSum)}</TD>
                          </TR>
                        </TBody>
                      </Table>
                    </Card>
                  )}
                </>
              ) : (
                <EmptyState
                  title="No person selected"
                  description="Pick a person from the list to inspect every ownership path and the multiplied percentage each contributes."
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-100">Paths Explorer</h1>
      <p className="mt-1 text-sm text-slate-400">
        Trace every ownership chain to each person and see the per-path multiplied percentage that rolls up to their
        effective ownership.
      </p>
    </div>
  )
}
