'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
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

interface Resolution {
  id: string
  case_id: string
  threshold: number
  qualifying_count: number
  control_count: number
  status?: string
  created_at?: string
}

interface Discrepancy {
  id: string
  case_id: string
  resolution_id: string
  kind: string
  person_name: string
  computed_value: number | null
  filed_value: number | null
  severity: string
  detail: string | null
  created_at?: string
}

type SeverityTone = 'rose' | 'amber' | 'sky' | 'slate'

const severityTone: Record<string, SeverityTone> = {
  critical: 'rose',
  high: 'rose',
  warning: 'amber',
  medium: 'amber',
  info: 'sky',
  low: 'slate',
}

function toneFor(sev: string): SeverityTone {
  return severityTone[sev?.toLowerCase()] ?? 'slate'
}

function fmtVal(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${Number(n).toFixed(2).replace(/\.00$/, '')}%`
}

function kindLabel(kind: string): string {
  return kind
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function DiscrepanciesPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')

  const [resolutions, setResolutions] = useState<Resolution[]>([])
  const [resolutionId, setResolutionId] = useState('')
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)

  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

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

  const loadCaseData = useCallback(async (cid: string) => {
    if (!cid) {
      setResolutions([])
      setDiscrepancies([])
      setResolutionId('')
      return
    }
    try {
      setListLoading(true)
      setError(null)
      const [res, disc]: [Resolution[], Discrepancy[]] = await Promise.all([
        api.getResolutions(cid),
        api.getDiscrepancies(cid),
      ])
      const sortedRes = [...(res || [])].sort((a, b) =>
        (b.created_at || '').localeCompare(a.created_at || '')
      )
      setResolutions(sortedRes)
      setResolutionId(sortedRes.length > 0 ? sortedRes[0].id : '')
      setDiscrepancies(disc || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load case data')
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    if (caseId) void loadCaseData(caseId)
  }, [caseId, loadCaseData])

  async function runDetection() {
    if (!caseId || !resolutionId) return
    try {
      setDetecting(true)
      setError(null)
      const rows: Discrepancy[] = await api.detectDiscrepancies({
        case_id: caseId,
        resolution_id: resolutionId,
      })
      // Refresh full stored list so persisted rows from any resolution show.
      const stored: Discrepancy[] = await api.getDiscrepancies(caseId)
      setDiscrepancies(stored || rows || [])
      setLastRun(`${(rows || []).length} discrepancies detected at ${new Date().toLocaleTimeString()}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Discrepancy detection failed')
    } finally {
      setDetecting(false)
    }
  }

  const severities = useMemo(() => {
    const set = new Set<string>()
    discrepancies.forEach((d) => set.add(d.severity || 'info'))
    return ['all', ...Array.from(set)]
  }, [discrepancies])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return discrepancies.filter((d) => {
      if (severityFilter !== 'all' && (d.severity || 'info') !== severityFilter) return false
      if (!q) return true
      return (
        d.person_name.toLowerCase().includes(q) ||
        kindLabel(d.kind).toLowerCase().includes(q) ||
        (d.detail || '').toLowerCase().includes(q)
      )
    })
  }, [discrepancies, severityFilter, search])

  const stats = useMemo(() => {
    const total = discrepancies.length
    const bySev: Record<string, number> = {}
    discrepancies.forEach((d) => {
      const s = (d.severity || 'info').toLowerCase()
      bySev[s] = (bySev[s] || 0) + 1
    })
    const critical = (bySev.critical || 0) + (bySev.high || 0)
    const warnings = (bySev.warning || 0) + (bySev.medium || 0)
    const info = (bySev.info || 0) + (bySev.low || 0)
    return { total, critical, warnings, info, bySev }
  }, [discrepancies])

  if (loading) return <PageSpinner label="Loading discrepancies..." />

  const activeRes = resolutions.find((r) => r.id === resolutionId)
  const maxSev = Math.max(1, ...Object.values(stats.bySev))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Discrepancy Detection</h1>
          <p className="mt-1 text-sm text-slate-500">
            Compare the computed beneficial-owner set against the filed set to surface mismatches, omissions, and
            over-declarations.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {workspaces.length === 0 ? (
        <EmptyState title="No workspace yet" description="Create a workspace and a case to begin." />
      ) : cases.length === 0 ? (
        <EmptyState
          title="No cases available"
          description="Create a case and run a resolution before detecting discrepancies."
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-slate-200">Run Detection</h2>
            </CardHeader>
            <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Case</label>
                <select
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                >
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Resolution Run
                </label>
                <select
                  value={resolutionId}
                  onChange={(e) => setResolutionId(e.target.value)}
                  disabled={resolutions.length === 0}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                >
                  {resolutions.length === 0 && <option value="">No resolutions</option>}
                  {resolutions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {(r.created_at ? new Date(r.created_at).toLocaleString() : r.id.slice(0, 8))} ·{' '}
                      {r.qualifying_count} owners @ {fmtVal(r.threshold)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button onClick={runDetection} disabled={detecting || !resolutionId} className="w-full">
                  {detecting ? 'Detecting...' : 'Detect Discrepancies'}
                </Button>
              </div>
              {resolutions.length === 0 && (
                <p className="md:col-span-3 text-xs text-amber-300">
                  This case has no resolution runs yet. Run a resolution first, then return here to detect discrepancies
                  against the filed set.
                </p>
              )}
              {lastRun && <p className="md:col-span-3 text-xs text-emerald-300">{lastRun}</p>}
              {activeRes && (
                <p className="md:col-span-3 text-xs text-slate-500">
                  Selected run: {activeRes.qualifying_count} qualifying owner(s), {activeRes.control_count} via control,
                  threshold {fmtVal(activeRes.threshold)}.
                </p>
              )}
            </CardBody>
          </Card>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Total Discrepancies" value={stats.total} />
            <Stat label="Critical / High" value={stats.critical} tone="rose" />
            <Stat label="Warnings" value={stats.warnings} tone="amber" />
            <Stat label="Informational" value={stats.info} tone="indigo" />
          </div>

          {Object.keys(stats.bySev).length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-slate-200">Severity Breakdown</h2>
              </CardHeader>
              <CardBody className="space-y-3">
                {Object.entries(stats.bySev)
                  .sort((a, b) => b[1] - a[1])
                  .map(([sev, count]) => (
                    <div key={sev} className="flex items-center gap-3">
                      <div className="w-24 shrink-0">
                        <Badge tone={toneFor(sev)}>{sev}</Badge>
                      </div>
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-full rounded-full ${
                            toneFor(sev) === 'rose'
                              ? 'bg-rose-500'
                              : toneFor(sev) === 'amber'
                                ? 'bg-amber-500'
                                : toneFor(sev) === 'sky'
                                  ? 'bg-sky-500'
                                  : 'bg-slate-500'
                          }`}
                          style={{ width: `${(count / maxSev) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 text-right tabular-nums text-sm text-slate-300">{count}</span>
                    </div>
                  ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search person, kind, or detail..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none sm:w-64"
                />
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                >
                  {severities.map((s) => (
                    <option key={s} value={s}>
                      {s === 'all' ? 'All severities' : s}
                    </option>
                  ))}
                </select>
              </div>
              <span className="text-xs text-slate-500">
                {filtered.length} of {discrepancies.length} shown
              </span>
            </CardHeader>
            <CardBody className="p-0">
              {listLoading ? (
                <div className="py-12">
                  <Spinner label="Loading discrepancies..." />
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title={discrepancies.length === 0 ? 'No discrepancies recorded' : 'No matches'}
                    description={
                      discrepancies.length === 0
                        ? 'Run detection for a resolution to compare computed owners against the filed set.'
                        : 'Adjust your search or severity filter.'
                    }
                  />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Severity</TH>
                      <TH>Kind</TH>
                      <TH>Person</TH>
                      <TH>Computed</TH>
                      <TH>Filed</TH>
                      <TH>Detail</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {filtered.map((d) => {
                      const delta =
                        d.computed_value !== null && d.filed_value !== null
                          ? d.computed_value - d.filed_value
                          : null
                      return (
                        <TR key={d.id}>
                          <TD>
                            <Badge tone={toneFor(d.severity)}>{d.severity || 'info'}</Badge>
                          </TD>
                          <TD className="text-slate-200">{kindLabel(d.kind)}</TD>
                          <TD className="font-medium text-slate-100">{d.person_name}</TD>
                          <TD className="tabular-nums">{fmtVal(d.computed_value)}</TD>
                          <TD className="tabular-nums">
                            <span>{fmtVal(d.filed_value)}</span>
                            {delta !== null && Math.abs(delta) > 0.001 && (
                              <span className={`ml-2 text-xs ${delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {delta > 0 ? '+' : ''}
                                {delta.toFixed(2).replace(/\.00$/, '')}
                              </span>
                            )}
                          </TD>
                          <TD className="max-w-md text-slate-400">{d.detail || '—'}</TD>
                        </TR>
                      )
                    })}
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
