'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import api from '@/lib/api'

interface Workspace {
  id: string
  name: string
}
interface SeedScenario {
  id: string
  slug: string
  name: string
  description?: string
  difficulty?: string
  trap_type?: string
  graph?: unknown
  created_at?: string
}
interface ApplyResult {
  case?: { id: string; name?: string }
  entities?: unknown[]
  edges?: unknown[]
}

function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  if (v && typeof v === 'object') {
    for (const key of ['data', 'items', 'rows', 'results', 'scenarios']) {
      const inner = (v as Record<string, unknown>)[key]
      if (Array.isArray(inner)) return inner as T[]
    }
  }
  return []
}

function difficultyTone(d?: string): 'green' | 'amber' | 'rose' | 'slate' {
  switch ((d ?? '').toLowerCase()) {
    case 'easy':
    case 'beginner':
      return 'green'
    case 'medium':
    case 'intermediate':
      return 'amber'
    case 'hard':
    case 'advanced':
    case 'expert':
      return 'rose'
    default:
      return 'slate'
  }
}

function trapTone(t?: string): 'indigo' | 'sky' | 'rose' | 'amber' | 'slate' {
  const v = (t ?? '').toLowerCase()
  if (v.includes('circular') || v.includes('cycle')) return 'rose'
  if (v.includes('trust')) return 'indigo'
  if (v.includes('control')) return 'amber'
  if (v.includes('layer') || v.includes('chain')) return 'sky'
  return 'slate'
}

function trapIcon(t?: string): string {
  const v = (t ?? '').toLowerCase()
  if (v.includes('circular') || v.includes('cycle')) return '↻'
  if (v.includes('trust')) return '§'
  if (v.includes('control')) return '⚖'
  if (v.includes('layer') || v.includes('chain')) return '⌗'
  return '◇'
}

function graphCounts(graph: unknown): { entities: number; edges: number } {
  if (!graph || typeof graph !== 'object') return { entities: 0, edges: 0 }
  const g = graph as Record<string, unknown>
  return {
    entities: asArray(g.entities ?? g.nodes).length,
    edges: asArray(g.edges ?? g.links).length,
  }
}

export default function SeedPage() {
  const [scenarios, setScenarios] = useState<SeedScenario[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')

  const [search, setSearch] = useState('')
  const [trapFilter, setTrapFilter] = useState('')

  const [applyTarget, setApplyTarget] = useState<SeedScenario | null>(null)
  const [applying, setApplying] = useState(false)
  const [lastResult, setLastResult] = useState<{ scenario: string; result: ApplyResult } | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [applyError, setApplyError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const [sc, ws] = await Promise.all([api.getSeedScenarios(), api.getWorkspaces()])
        if (cancelled) return
        const wsList = asArray<Workspace>(ws)
        setScenarios(asArray<SeedScenario>(sc))
        setWorkspaces(wsList)
        if (wsList.length) setWorkspaceId(wsList[0].id)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load seed scenarios')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const trapOptions = useMemo(
    () => Array.from(new Set(scenarios.map((s) => s.trap_type ?? '').filter(Boolean))).sort(),
    [scenarios],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scenarios.filter((s) => {
      if (trapFilter && (s.trap_type ?? '') !== trapFilter) return false
      if (!q) return true
      const hay = [s.name, s.description, s.trap_type, s.difficulty, s.slug].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [scenarios, search, trapFilter])

  async function applyScenario() {
    if (!applyTarget || !workspaceId) return
    setApplying(true)
    setApplyError('')
    try {
      const result = (await api.applySeedScenario({ workspace_id: workspaceId, slug: applyTarget.slug })) as ApplyResult
      setLastResult({ scenario: applyTarget.name, result })
      setApplyTarget(null)
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : 'Failed to apply scenario')
    } finally {
      setApplying(false)
    }
  }

  if (loading) return <PageSpinner label="Loading seed scenarios…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Seed Scenarios</h1>
          <p className="mt-1 text-sm text-slate-500">
            Spin up a fresh case from a curated ownership-graph trap — circular holdings, trust layers, and substantial-control edge cases.
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
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      {lastResult && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <div>
            Applied <span className="font-semibold">{lastResult.scenario}</span> into a new case
            {lastResult.result.case?.name ? (
              <>
                {' '}
                <span className="font-semibold">“{lastResult.result.case.name}”</span>
              </>
            ) : null}{' '}
            with {asArray(lastResult.result.entities).length} entities and {asArray(lastResult.result.edges).length} edges.
          </div>
          {lastResult.result.case?.id && (
            <a
              href={`/dashboard/cases/${lastResult.result.case.id}/graph`}
              className="shrink-0 rounded-md border border-emerald-500/40 px-3 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/10"
            >
              Open graph
            </a>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Scenarios" value={scenarios.length} tone="indigo" />
        <Stat label="Trap types" value={trapOptions.length} />
        <Stat
          label="Circular traps"
          value={scenarios.filter((s) => (s.trap_type ?? '').toLowerCase().includes('circular')).length}
          tone="rose"
        />
        <Stat
          label="Trust traps"
          value={scenarios.filter((s) => (s.trap_type ?? '').toLowerCase().includes('trust')).length}
          tone="default"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-slate-100">Gallery</h2>
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search scenarios…"
              className="w-52 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={trapFilter}
              onChange={(e) => setTrapFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All traps</option>
              {trapOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardBody>
          {scenarios.length === 0 ? (
            <EmptyState title="No seed scenarios available" description="The backend has not registered any built-in scenarios." />
          ) : filtered.length === 0 ? (
            <EmptyState title="No matching scenarios" description="Adjust your search or trap-type filter." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((s) => {
                const counts = graphCounts(s.graph)
                return (
                  <div
                    key={s.id}
                    className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/40 p-4 transition-colors hover:border-indigo-500/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-lg text-indigo-300">
                        {trapIcon(s.trap_type)}
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {s.trap_type && <Badge tone={trapTone(s.trap_type)}>{s.trap_type}</Badge>}
                        {s.difficulty && <Badge tone={difficultyTone(s.difficulty)}>{s.difficulty}</Badge>}
                      </div>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-slate-100">{s.name}</h3>
                    {s.description && <p className="mt-1 flex-1 text-sm text-slate-500">{s.description}</p>}
                    <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                      <span className="font-mono">{s.slug}</span>
                      {(counts.entities > 0 || counts.edges > 0) && (
                        <span className="text-slate-600">
                          · {counts.entities} entities · {counts.edges} edges
                        </span>
                      )}
                    </div>
                    <Button
                      className="mt-4 w-full"
                      disabled={!workspaceId}
                      onClick={() => {
                        setApplyError('')
                        setApplyTarget(s)
                      }}
                    >
                      Apply to new case
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={Boolean(applyTarget)}
        onClose={() => (!applying ? setApplyTarget(null) : undefined)}
        title="Apply seed scenario"
        footer={
          <>
            <Button variant="secondary" onClick={() => setApplyTarget(null)} disabled={applying}>
              Cancel
            </Button>
            <Button onClick={applyScenario} disabled={applying || !workspaceId}>
              {applying ? 'Applying…' : 'Create case'}
            </Button>
          </>
        }
      >
        {applyTarget && (
          <div className="space-y-3 text-sm text-slate-300">
            <p>
              This creates a brand-new case in workspace{' '}
              <span className="font-semibold text-slate-100">
                {workspaces.find((w) => w.id === workspaceId)?.name ?? '—'}
              </span>{' '}
              seeded with the <span className="font-semibold text-slate-100">{applyTarget.name}</span> ownership graph.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {applyTarget.trap_type && <Badge tone={trapTone(applyTarget.trap_type)}>{applyTarget.trap_type}</Badge>}
              {applyTarget.difficulty && (
                <Badge tone={difficultyTone(applyTarget.difficulty)}>{applyTarget.difficulty}</Badge>
              )}
            </div>
            {applyTarget.description && <p className="text-slate-500">{applyTarget.description}</p>}
            {applyError && <p className="text-rose-300">{applyError}</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}
