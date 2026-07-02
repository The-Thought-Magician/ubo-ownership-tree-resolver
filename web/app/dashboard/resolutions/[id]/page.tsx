'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

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

interface ResolvedOwner {
  id: string
  resolution_id: string
  person_entity_id: string
  person_name: string
  effective_ownership: number
  meets_ownership_threshold: boolean
  meets_substantial_control: boolean
  near_threshold: boolean
  created_at?: string
}

interface OwnershipPath {
  id: string
  resolved_owner_id: string
  resolution_id: string
  path_entity_ids?: unknown
  path_labels?: unknown
  path_percentage: number
}

type Filter = 'all' | 'qualifying' | 'control' | 'near'

function normalizeWarnings(w: unknown): string[] {
  if (!w) return []
  if (Array.isArray(w)) return w.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
  if (typeof w === 'object') {
    return Object.entries(w as Record<string, unknown>).map(
      ([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`,
    )
  }
  return [String(w)]
}

function pathLabels(p: OwnershipPath): string[] {
  if (Array.isArray(p.path_labels)) return p.path_labels.map((x) => String(x))
  if (Array.isArray(p.path_entity_ids)) return p.path_entity_ids.map((x) => String(x).slice(0, 8))
  return []
}

export default function ResolutionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [resolution, setResolution] = useState<Resolution | null>(null)
  const [owners, setOwners] = useState<ResolvedOwner[]>([])
  const [paths, setPaths] = useState<OwnershipPath[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [detail, ownerList, pathList] = await Promise.all([
          api.getResolution(id) as Promise<{ resolution: Resolution; owners?: ResolvedOwner[] }>,
          api.getOwners(id) as Promise<ResolvedOwner[]>,
          api.getPaths(id) as Promise<OwnershipPath[]>,
        ])
        if (cancelled) return
        setResolution(detail?.resolution ?? (detail as unknown as Resolution) ?? null)
        const roster = Array.isArray(ownerList)
          ? ownerList
          : Array.isArray(detail?.owners)
            ? detail.owners
            : []
        setOwners(roster)
        setPaths(Array.isArray(pathList) ? pathList : [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load resolution')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const warnings = useMemo(() => normalizeWarnings(resolution?.warnings), [resolution])

  const pathsByOwner = useMemo(() => {
    const m = new Map<string, OwnershipPath[]>()
    for (const p of paths) {
      const arr = m.get(p.resolved_owner_id) || []
      arr.push(p)
      m.set(p.resolved_owner_id, arr)
    }
    return m
  }, [paths])

  const counts = useMemo(() => {
    return {
      all: owners.length,
      qualifying: owners.filter((o) => o.meets_ownership_threshold).length,
      control: owners.filter((o) => o.meets_substantial_control).length,
      near: owners.filter((o) => o.near_threshold).length,
    }
  }, [owners])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = [...owners].sort((a, b) => (b.effective_ownership || 0) - (a.effective_ownership || 0))
    if (filter === 'qualifying') list = list.filter((o) => o.meets_ownership_threshold)
    else if (filter === 'control') list = list.filter((o) => o.meets_substantial_control)
    else if (filter === 'near') list = list.filter((o) => o.near_threshold)
    if (q) list = list.filter((o) => (o.person_name || '').toLowerCase().includes(q))
    return list
  }, [owners, filter, search])

  const maxOwnership = useMemo(
    () => Math.max(100, ...owners.map((o) => o.effective_ownership || 0)),
    [owners],
  )

  if (loading) return <PageSpinner label="Loading resolution..." />

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/resolutions" className="text-sm text-indigo-400 hover:underline">
          ← Back to resolutions
        </Link>
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      </div>
    )
  }

  if (!resolution) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/resolutions" className="text-sm text-indigo-400 hover:underline">
          ← Back to resolutions
        </Link>
        <EmptyState title="Resolution not found" description="It may have been deleted." />
      </div>
    )
  }

  const filters: { key: Filter; label: string; tone: 'indigo' | 'green' | 'amber' | 'rose' }[] = [
    { key: 'all', label: `All (${counts.all})`, tone: 'indigo' },
    { key: 'qualifying', label: `Qualifying (${counts.qualifying})`, tone: 'green' },
    { key: 'control', label: `Control (${counts.control})`, tone: 'amber' },
    { key: 'near', label: `Near threshold (${counts.near})`, tone: 'rose' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/resolutions" className="text-sm text-indigo-400 hover:underline">
          ← Back to resolutions
        </Link>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-mono text-xl font-semibold text-stone-100">
              Resolution {resolution.id.slice(0, 8)}
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Threshold {resolution.threshold}% ·{' '}
              {resolution.created_at ? new Date(resolution.created_at).toLocaleString() : 'unknown date'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={resolution.status === 'complete' ? 'green' : 'slate'}>
              {resolution.status || 'complete'}
            </Badge>
            <Link href={`/dashboard/cases/${resolution.case_id}`}>
              <Button variant="secondary" className="px-3 py-1 text-xs">
                Open case
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Resolved owners" value={counts.all} tone="indigo" />
        <Stat
          label="Meets threshold"
          value={resolution.qualifying_count ?? counts.qualifying}
          tone="green"
        />
        <Stat
          label="Substantial control"
          value={resolution.control_count ?? counts.control}
          tone="amber"
        />
        <Stat
          label="Near threshold"
          value={counts.near}
          tone={counts.near > 0 ? 'rose' : 'default'}
        />
      </div>

      {warnings.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="border-amber-500/20">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-300">
              <span aria-hidden>⚠</span> Resolution warnings ({warnings.length})
            </h2>
          </CardHeader>
          <CardBody>
            <ul className="space-y-2">
              {warnings.map((w, i) => (
                <li
                  key={i}
                  className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-200"
                >
                  {w}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-stone-200">Resolved beneficial owners</h2>
          <div className="flex flex-wrap items-center gap-2">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f.key
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                    : 'border-stone-700 text-stone-400 hover:border-stone-600 hover:text-stone-200'
                }`}
              >
                {f.label}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name"
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm text-stone-200 placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:w-48"
            />
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="px-5 py-10">
              <EmptyState
                title={owners.length === 0 ? 'No resolved owners' : 'No matches for this filter'}
                description={
                  owners.length === 0
                    ? 'This resolution did not produce any qualifying beneficial owners.'
                    : 'Adjust the filter or search to see owners.'
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Person</TH>
                  <TH>Effective ownership</TH>
                  <TH>Flags</TH>
                  <TH>Contributing paths</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((o) => {
                  const ownerPaths = pathsByOwner.get(o.id) || []
                  const pct = o.effective_ownership || 0
                  const barWidth = Math.min(100, (pct / maxOwnership) * 100)
                  return (
                    <TR key={o.id}>
                      <TD>
                        <div className="font-medium text-stone-100">{o.person_name}</div>
                        <div className="font-mono text-[10px] text-stone-600">
                          {o.person_entity_id.slice(0, 8)}
                        </div>
                      </TD>
                      <TD>
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-28 overflow-hidden rounded-full bg-stone-800">
                            <div
                              className={`h-full rounded-full ${
                                o.meets_ownership_threshold
                                  ? 'bg-emerald-500'
                                  : o.near_threshold
                                    ? 'bg-amber-500'
                                    : 'bg-stone-600'
                              }`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-stone-100">{pct.toFixed(2)}%</span>
                        </div>
                      </TD>
                      <TD>
                        <div className="flex flex-wrap gap-1">
                          {o.meets_ownership_threshold && <Badge tone="green">Threshold</Badge>}
                          {o.meets_substantial_control && <Badge tone="amber">Control</Badge>}
                          {o.near_threshold && <Badge tone="rose">Near</Badge>}
                          {!o.meets_ownership_threshold &&
                            !o.meets_substantial_control &&
                            !o.near_threshold && <span className="text-xs text-stone-600">—</span>}
                        </div>
                      </TD>
                      <TD>
                        {ownerPaths.length === 0 ? (
                          <span className="text-xs text-stone-600">No paths</span>
                        ) : (
                          <div className="space-y-1">
                            {ownerPaths.slice(0, 4).map((p) => {
                              const labels = pathLabels(p)
                              return (
                                <div
                                  key={p.id}
                                  className="flex items-center gap-2 text-xs text-stone-400"
                                >
                                  <span className="font-mono tabular-nums text-indigo-300">
                                    {(p.path_percentage || 0).toFixed(2)}%
                                  </span>
                                  <span className="truncate">
                                    {labels.length ? labels.join(' → ') : '—'}
                                  </span>
                                </div>
                              )
                            })}
                            {ownerPaths.length > 4 && (
                              <div className="text-[10px] text-stone-600">
                                +{ownerPaths.length - 4} more
                              </div>
                            )}
                          </div>
                        )}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-stone-200">Inputs hash</h2>
        </CardHeader>
        <CardBody>
          <code className="break-all font-mono text-xs text-stone-400">
            {resolution.inputs_hash || 'n/a'}
          </code>
          <p className="mt-2 text-xs text-stone-500">
            The inputs hash fingerprints the entity/edge graph at resolution time. Two resolutions
            with the same hash were computed from an identical ownership structure.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
