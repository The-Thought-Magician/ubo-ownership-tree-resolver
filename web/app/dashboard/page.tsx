'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Workspace {
  id: string
  name: string
  default_threshold?: number
}

interface RecentCase {
  id: string
  name: string
  status?: string
  threshold?: number
  updated_at?: string
  created_at?: string
}

interface NearThresholdAlert {
  case_id?: string
  case_name?: string
  person_name?: string
  effective_ownership?: number
  threshold?: number
}

interface DiscrepancyAlert {
  case_id?: string
  case_name?: string
  person_name?: string
  kind?: string
  severity?: string
  computed_value?: number
  filed_value?: number
}

interface DashboardSummary {
  open_cases?: number
  total_cases?: number
  cases_with_discrepancies?: number
  recently_resolved?: number
  qualifying_count?: number
  near_threshold_count?: number
  recent_cases?: RecentCase[]
  near_threshold_alerts?: NearThresholdAlert[]
  discrepancy_alerts?: DiscrepancyAlert[]
}

const WS_KEY = 'ubo.active_workspace'

function statusTone(status?: string): 'slate' | 'indigo' | 'amber' | 'green' | 'sky' {
  switch (status) {
    case 'draft':
      return 'slate'
    case 'in_review':
    case 'review':
      return 'amber'
    case 'resolved':
    case 'complete':
    case 'completed':
      return 'green'
    case 'active':
    case 'open':
      return 'indigo'
    default:
      return 'sky'
  }
}

function severityTone(sev?: string): 'rose' | 'amber' | 'sky' {
  switch (sev) {
    case 'critical':
    case 'high':
      return 'rose'
    case 'warning':
    case 'medium':
      return 'amber'
    default:
      return 'sky'
  }
}

function fmtPct(v?: number): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—'
  return `${(Math.round(v * 100) / 100).toString()}%`
}

function fmtDate(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DashboardOverviewPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWs, setActiveWs] = useState<string>('')
  const [summary, setSummary] = useState<DashboardSummary | null>(null)

  // Load workspaces once.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ws = (await api.getWorkspaces()) as Workspace[]
        if (cancelled) return
        const list = Array.isArray(ws) ? ws : []
        setWorkspaces(list)
        const stored = typeof window !== 'undefined' ? window.localStorage.getItem(WS_KEY) : null
        const pick = (stored && list.some((w) => w.id === stored) ? stored : list[0]?.id) || ''
        setActiveWs(pick)
        if (!pick) setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load workspaces')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Load dashboard for active workspace.
  useEffect(() => {
    if (!activeWs) return
    let cancelled = false
    setLoading(true)
    setError(null)
    if (typeof window !== 'undefined') window.localStorage.setItem(WS_KEY, activeWs)
    ;(async () => {
      try {
        const data = (await api.getDashboard(activeWs)) as DashboardSummary
        if (!cancelled) setSummary(data ?? {})
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeWs])

  const recentCases = summary?.recent_cases ?? []
  const nearAlerts = summary?.near_threshold_alerts ?? []
  const discAlerts = summary?.discrepancy_alerts ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-100">Overview</h1>
          <p className="mt-1 text-sm text-stone-500">
            Beneficial-ownership cases, resolution health, and compliance alerts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {workspaces.length > 0 && (
            <select
              value={activeWs}
              onChange={(e) => setActiveWs(e.target.value)}
              className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
          <Link href="/dashboard/cases">
            <Button variant="primary">New case</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <PageSpinner label="Loading dashboard..." />
      ) : workspaces.length === 0 ? (
        <EmptyState
          title="No workspaces yet"
          description="Create a workspace in settings to start resolving ownership trees."
          action={
            <Link href="/dashboard/settings">
              <Button>Go to settings</Button>
            </Link>
          }
        />
      ) : !summary ? (
        <EmptyState title="No dashboard data" description="Nothing to show for this workspace yet." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat
              label="Open cases"
              value={summary.open_cases ?? 0}
              hint={`${summary.total_cases ?? 0} total`}
              tone="indigo"
            />
            <Stat label="Recently resolved" value={summary.recently_resolved ?? 0} tone="green" />
            <Stat
              label="Qualifying owners"
              value={summary.qualifying_count ?? 0}
              hint="Meeting threshold"
              tone="default"
            />
            <Stat
              label="Near threshold"
              value={summary.near_threshold_count ?? nearAlerts.length}
              hint="Within margin"
              tone="amber"
            />
            <Stat
              label="Discrepancies"
              value={summary.cases_with_discrepancies ?? discAlerts.length}
              hint="Cases flagged"
              tone="rose"
            />
          </div>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-200">Recent cases</h2>
              <Link href="/dashboard/cases" className="text-xs font-medium text-indigo-400 hover:text-indigo-300">
                View all
              </Link>
            </CardHeader>
            <CardBody className="p-0">
              {recentCases.length === 0 ? (
                <div className="px-5 py-8">
                  <EmptyState
                    title="No cases yet"
                    description="Create your first beneficial-ownership case to begin."
                    action={
                      <Link href="/dashboard/cases">
                        <Button>Create case</Button>
                      </Link>
                    }
                  />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Case</TH>
                      <TH>Status</TH>
                      <TH>Threshold</TH>
                      <TH>Updated</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {recentCases.map((c) => (
                      <TR key={c.id}>
                        <TD>
                          <Link
                            href={`/dashboard/cases/${c.id}`}
                            className="font-medium text-stone-100 hover:text-indigo-300"
                          >
                            {c.name}
                          </Link>
                        </TD>
                        <TD>
                          <Badge tone={statusTone(c.status)}>{c.status ?? 'draft'}</Badge>
                        </TD>
                        <TD className="tabular-nums">{fmtPct(c.threshold)}</TD>
                        <TD className="text-stone-500">{fmtDate(c.updated_at ?? c.created_at)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-stone-200">Near-threshold alerts</h2>
                <Badge tone="amber">{nearAlerts.length}</Badge>
              </CardHeader>
              <CardBody className="p-0">
                {nearAlerts.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-stone-500">
                    No owners sitting near the reporting threshold.
                  </div>
                ) : (
                  <ul className="divide-y divide-stone-800">
                    {nearAlerts.map((a, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-stone-100">
                            {a.person_name ?? 'Unknown person'}
                          </div>
                          <div className="truncate text-xs text-stone-500">
                            {a.case_id ? (
                              <Link href={`/dashboard/cases/${a.case_id}`} className="hover:text-indigo-300">
                                {a.case_name ?? 'View case'}
                              </Link>
                            ) : (
                              (a.case_name ?? '—')
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="text-sm font-semibold tabular-nums text-amber-300">
                            {fmtPct(a.effective_ownership)}
                          </span>
                          <span className="text-xs text-stone-500">/ {fmtPct(a.threshold)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-stone-200">Discrepancy alerts</h2>
                <Badge tone="rose">{discAlerts.length}</Badge>
              </CardHeader>
              <CardBody className="p-0">
                {discAlerts.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-stone-500">
                    No mismatches between computed and filed ownership.
                  </div>
                ) : (
                  <ul className="divide-y divide-stone-800">
                    {discAlerts.map((d, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-stone-100">
                              {d.person_name ?? 'Unknown person'}
                            </span>
                            <Badge tone={severityTone(d.severity)}>{d.severity ?? 'info'}</Badge>
                          </div>
                          <div className="truncate text-xs text-stone-500">
                            {d.kind ?? 'discrepancy'}
                            {d.case_id ? (
                              <>
                                {' · '}
                                <Link href={`/dashboard/cases/${d.case_id}`} className="hover:text-indigo-300">
                                  {d.case_name ?? 'View case'}
                                </Link>
                              </>
                            ) : null}
                          </div>
                        </div>
                        <div className="whitespace-nowrap text-right text-xs text-stone-400">
                          <div>
                            computed <span className="font-semibold text-stone-200">{fmtPct(d.computed_value)}</span>
                          </div>
                          <div>
                            filed <span className="font-semibold text-stone-200">{fmtPct(d.filed_value)}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
