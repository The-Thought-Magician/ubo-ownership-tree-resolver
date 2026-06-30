'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'

interface Workspace {
  id: string
  name: string
}
interface AuditEntry {
  id: string
  workspace_id: string
  case_id?: string | null
  user_id?: string | null
  action: string
  target_type?: string | null
  target_id?: string | null
  detail?: unknown
  created_at?: string
}

function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  if (v && typeof v === 'object') {
    for (const key of ['data', 'items', 'rows', 'results', 'entries']) {
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

function actionTone(action: string): 'green' | 'amber' | 'rose' | 'indigo' | 'sky' | 'slate' {
  const a = action.toLowerCase()
  if (a.includes('create') || a.includes('add') || a.includes('apply') || a.includes('run')) return 'green'
  if (a.includes('update') || a.includes('edit') || a.includes('restore')) return 'amber'
  if (a.includes('delete') || a.includes('remove')) return 'rose'
  if (a.includes('resolve') || a.includes('export')) return 'indigo'
  if (a.includes('snapshot') || a.includes('diff')) return 'sky'
  return 'slate'
}

function detailToString(detail: unknown): string {
  if (detail == null) return '—'
  if (typeof detail === 'string') return detail
  try {
    return JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}

export default function AuditLogPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [entries, setEntries] = useState<AuditEntry[]>([])

  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [targetFilter, setTargetFilter] = useState('')

  const [expanded, setExpanded] = useState<string | null>(null)

  const [bootLoading, setBootLoading] = useState(true)
  const [logLoading, setLogLoading] = useState(false)
  const [error, setError] = useState('')

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

  const loadLog = useCallback(async (wid: string) => {
    setLogLoading(true)
    setError('')
    try {
      setEntries(asArray<AuditEntry>(await api.getAuditLog(wid)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log')
    } finally {
      setLogLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!workspaceId) {
      setEntries([])
      return
    }
    setExpanded(null)
    loadLog(workspaceId)
  }, [workspaceId, loadLog])

  const actionOptions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action).filter(Boolean))).sort(),
    [entries],
  )
  const targetOptions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.target_type ?? '').filter(Boolean))).sort(),
    [entries],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter((e) => {
      if (actionFilter && e.action !== actionFilter) return false
      if (targetFilter && (e.target_type ?? '') !== targetFilter) return false
      if (!q) return true
      const hay = [e.action, e.target_type, e.target_id, e.user_id, e.case_id, detailToString(e.detail)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [entries, search, actionFilter, targetFilter])

  const uniqueActors = useMemo(
    () => new Set(entries.map((e) => e.user_id ?? '').filter(Boolean)).size,
    [entries],
  )

  if (bootLoading) return <PageSpinner label="Loading audit log…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Audit Log</h1>
          <p className="mt-1 text-sm text-slate-500">
            Immutable, append-only trail of every mutation in this workspace — who did what, to which target, and when.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <Button variant="secondary" onClick={() => workspaceId && loadLog(workspaceId)} disabled={logLoading}>
            {logLoading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      {!workspaceId ? (
        <EmptyState title="No workspace selected" description="Pick a workspace to view its audit trail." />
      ) : logLoading ? (
        <PageSpinner label="Loading entries…" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Total events" value={entries.length} tone="indigo" />
            <Stat label="Matching filter" value={filtered.length} />
            <Stat label="Distinct actors" value={uniqueActors} tone="default" />
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-semibold text-slate-100">Trail</h2>
              <div className="flex flex-wrap gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search action, target, actor…"
                  className="w-56 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All actions</option>
                  {actionOptions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <select
                  value={targetFilter}
                  onChange={(e) => setTargetFilter(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All targets</option>
                  {targetOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {(search || actionFilter || targetFilter) && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSearch('')
                      setActionFilter('')
                      setTargetFilter('')
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardBody>
              {entries.length === 0 ? (
                <EmptyState
                  title="No audit entries"
                  description="Activity in this workspace will be recorded here automatically."
                />
              ) : filtered.length === 0 ? (
                <EmptyState title="No matching entries" description="Adjust your search or filters." />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>When</TH>
                      <TH>Action</TH>
                      <TH>Target</TH>
                      <TH>Actor</TH>
                      <TH>Case</TH>
                      <TH className="text-right">Detail</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {filtered.map((e) => {
                      const open = expanded === e.id
                      const hasDetail = e.detail != null && detailToString(e.detail) !== '—'
                      return (
                        <Fragment key={e.id}>
                          <TR>
                            <TD className="whitespace-nowrap text-xs text-slate-500">{fmtDate(e.created_at)}</TD>
                            <TD>
                              <Badge tone={actionTone(e.action)}>{e.action}</Badge>
                            </TD>
                            <TD className="text-slate-300">
                              {e.target_type ? (
                                <span>
                                  <span className="text-slate-200">{e.target_type}</span>
                                  {e.target_id && (
                                    <span className="ml-1 font-mono text-xs text-slate-500">
                                      {e.target_id.slice(0, 8)}…
                                    </span>
                                  )}
                                </span>
                              ) : (
                                '—'
                              )}
                            </TD>
                            <TD className="font-mono text-xs text-slate-400">
                              {e.user_id ? `${e.user_id.slice(0, 10)}…` : 'system'}
                            </TD>
                            <TD className="font-mono text-xs text-slate-500">
                              {e.case_id ? `${e.case_id.slice(0, 8)}…` : '—'}
                            </TD>
                            <TD className="text-right">
                              {hasDetail ? (
                                <Button
                                  variant="ghost"
                                  className="px-2 py-1 text-xs"
                                  onClick={() => setExpanded(open ? null : e.id)}
                                >
                                  {open ? 'Hide' : 'View'}
                                </Button>
                              ) : (
                                <span className="text-xs text-slate-600">—</span>
                              )}
                            </TD>
                          </TR>
                          {open && hasDetail && (
                            <TR>
                              <TD colSpan={6} className="bg-slate-950/60">
                                <pre className="max-h-72 overflow-auto rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-400">
                                  {typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail, null, 2)}
                                </pre>
                              </TD>
                            </TR>
                          )}
                        </Fragment>
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
