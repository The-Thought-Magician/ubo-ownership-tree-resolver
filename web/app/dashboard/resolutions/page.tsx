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
  status?: string
  threshold?: number
  target_entity_id?: string | null
}

interface Resolution {
  id: string
  case_id: string
  threshold: number
  qualifying_count: number
  control_count: number
  inputs_hash?: string
  status?: string
  warnings?: unknown
  created_at?: string
}

const WS_KEY = 'ubo.workspace'

function warningCount(w: unknown): number {
  if (Array.isArray(w)) return w.length
  if (w && typeof w === 'object') return Object.keys(w as object).length
  return 0
}

function fmtDate(d?: string): string {
  if (!d) return '—'
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return d
  return t.toLocaleString()
}

export default function ResolutionsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState<string>('')
  const [resolutions, setResolutions] = useState<Resolution[]>([])

  const [loadingTop, setLoadingTop] = useState(true)
  const [loadingResolutions, setLoadingResolutions] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Resolution | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Load workspaces once.
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
        const initial = list.find((w) => w.id === stored)?.id || list[0]?.id || ''
        setWorkspaceId(initial)
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

  // Load cases when workspace changes.
  useEffect(() => {
    if (!workspaceId) {
      setCases([])
      setCaseId('')
      return
    }
    if (typeof window !== 'undefined') window.localStorage.setItem(WS_KEY, workspaceId)
    let cancelled = false
    ;(async () => {
      setError(null)
      try {
        const cs = (await api.getCases(workspaceId)) as Case[]
        if (cancelled) return
        const list = Array.isArray(cs) ? cs : []
        setCases(list)
        setCaseId((prev) => (list.find((c) => c.id === prev)?.id || list[0]?.id || ''))
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load cases')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const loadResolutions = useCallback(async (cid: string) => {
    if (!cid) {
      setResolutions([])
      return
    }
    setLoadingResolutions(true)
    setError(null)
    try {
      const rs = (await api.getResolutions(cid)) as Resolution[]
      setResolutions(Array.isArray(rs) ? rs : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load resolutions')
    } finally {
      setLoadingResolutions(false)
    }
  }, [])

  useEffect(() => {
    loadResolutions(caseId)
  }, [caseId, loadResolutions])

  const activeCase = useMemo(() => cases.find((c) => c.id === caseId), [cases, caseId])

  async function handleRun() {
    if (!caseId) return
    setRunning(true)
    setRunError(null)
    try {
      await api.runResolution({ case_id: caseId })
      await loadResolutions(caseId)
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Resolution run failed')
    } finally {
      setRunning(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteResolution(deleteTarget.id)
      setDeleteTarget(null)
      await loadResolutions(caseId)
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const sorted = [...resolutions].sort((a, b) =>
      (b.created_at || '').localeCompare(a.created_at || ''),
    )
    if (!q) return sorted
    return sorted.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        (r.inputs_hash || '').toLowerCase().includes(q) ||
        (r.status || '').toLowerCase().includes(q),
    )
  }, [resolutions, search])

  const totals = useMemo(() => {
    const runs = resolutions.length
    const qualifying = resolutions.reduce((s, r) => s + (r.qualifying_count || 0), 0)
    const control = resolutions.reduce((s, r) => s + (r.control_count || 0), 0)
    const warnings = resolutions.reduce((s, r) => s + warningCount(r.warnings), 0)
    return { runs, qualifying, control, warnings }
  }, [resolutions])

  if (loadingTop) return <PageSpinner label="Loading workspaces..." />

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Resolutions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Run ownership resolution over a case graph and review every historical run.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {cases.length === 0 && <option value="">No cases</option>}
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button onClick={handleRun} disabled={!caseId || running}>
            {running ? <Spinner className="mr-2" /> : null}
            {running ? 'Resolving...' : 'Run resolution'}
          </Button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}
      {runError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {runError}
        </div>
      )}

      {workspaces.length === 0 ? (
        <EmptyState
          title="No workspaces yet"
          description="Create a workspace and a case before running ownership resolutions."
        />
      ) : cases.length === 0 ? (
        <EmptyState
          title="No cases in this workspace"
          description={
            <>
              Create a case under{' '}
              <Link href="/dashboard/cases" className="text-indigo-400 hover:underline">
                Cases
              </Link>{' '}
              to begin resolving beneficial ownership.
            </>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Total runs" value={totals.runs} tone="indigo" />
            <Stat label="Qualifying owners" value={totals.qualifying} tone="green" />
            <Stat label="Substantial control" value={totals.control} tone="amber" />
            <Stat
              label="Warnings"
              value={totals.warnings}
              tone={totals.warnings > 0 ? 'rose' : 'default'}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">
                  Resolution history
                  {activeCase && (
                    <span className="ml-2 font-normal text-slate-500">
                      for {activeCase.name}
                      {typeof activeCase.threshold === 'number'
                        ? ` (threshold ${activeCase.threshold}%)`
                        : ''}
                    </span>
                  )}
                </h2>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by id, hash, status"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:w-72"
              />
            </CardHeader>
            <CardBody className="p-0">
              {loadingResolutions ? (
                <div className="px-5 py-10">
                  <Spinner label="Loading resolutions..." />
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-5 py-10">
                  <EmptyState
                    title={resolutions.length === 0 ? 'No resolutions yet' : 'No matches'}
                    description={
                      resolutions.length === 0
                        ? 'Click Run resolution to traverse the ownership graph and compute beneficial owners.'
                        : 'Adjust your search to see more runs.'
                    }
                  />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Run</TH>
                      <TH>Threshold</TH>
                      <TH>Qualifying</TH>
                      <TH>Control</TH>
                      <TH>Warnings</TH>
                      <TH>Status</TH>
                      <TH>Created</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {filtered.map((r) => {
                      const wc = warningCount(r.warnings)
                      return (
                        <TR key={r.id}>
                          <TD>
                            <Link
                              href={`/dashboard/resolutions/${r.id}`}
                              className="font-mono text-xs text-indigo-300 hover:underline"
                            >
                              {r.id.slice(0, 8)}
                            </Link>
                            {r.inputs_hash && (
                              <div className="mt-0.5 font-mono text-[10px] text-slate-600">
                                {r.inputs_hash.slice(0, 12)}
                              </div>
                            )}
                          </TD>
                          <TD className="tabular-nums">{r.threshold}%</TD>
                          <TD>
                            <Badge tone="green">{r.qualifying_count}</Badge>
                          </TD>
                          <TD>
                            <Badge tone="amber">{r.control_count}</Badge>
                          </TD>
                          <TD>
                            {wc > 0 ? <Badge tone="rose">{wc}</Badge> : <span className="text-slate-600">0</span>}
                          </TD>
                          <TD>
                            <Badge tone={r.status === 'complete' ? 'green' : 'slate'}>
                              {r.status || 'complete'}
                            </Badge>
                          </TD>
                          <TD className="text-xs text-slate-500">{fmtDate(r.created_at)}</TD>
                          <TD className="text-right">
                            <div className="flex justify-end gap-2">
                              <Link href={`/dashboard/resolutions/${r.id}`}>
                                <Button variant="secondary" className="px-3 py-1 text-xs">
                                  View
                                </Button>
                              </Link>
                              <Button
                                variant="danger"
                                className="px-3 py-1 text-xs"
                                onClick={() => setDeleteTarget(r)}
                              >
                                Delete
                              </Button>
                            </div>
                          </TD>
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

      <Modal
        open={!!deleteTarget}
        onClose={() => (deleting ? null : setDeleteTarget(null))}
        title="Delete resolution"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete run'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-400">
          This permanently deletes resolution{' '}
          <span className="font-mono text-slate-200">{deleteTarget?.id.slice(0, 8)}</span> along with
          its resolved owners and ownership paths. This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
