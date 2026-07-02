'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Case {
  id: string
  workspace_id: string
  name: string
  status?: string
  assignee_id?: string | null
  threshold?: number
  description?: string | null
  target_entity_id?: string | null
  created_at?: string
  updated_at?: string
}

interface Entity {
  id: string
  name: string
  entity_type?: string
  jurisdiction?: string | null
  is_natural_person?: boolean
  is_target?: boolean
}

interface Edge {
  id: string
  owner_entity_id: string
  owned_entity_id: string
  percentage?: number
  edge_type?: string
}

interface Resolution {
  id: string
  threshold?: number
  qualifying_count?: number
  control_count?: number
  status?: string
  created_at?: string
}

interface Discrepancy {
  id: string
  kind?: string
  person_name?: string
  severity?: string
  computed_value?: number
  filed_value?: number
  detail?: string | null
}

const STATUSES = ['draft', 'active', 'in_review', 'resolved', 'archived']

function statusTone(status?: string): 'slate' | 'indigo' | 'amber' | 'green' | 'sky' {
  switch (status) {
    case 'draft':
      return 'slate'
    case 'in_review':
      return 'amber'
    case 'resolved':
      return 'green'
    case 'active':
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
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  const [kase, setKase] = useState<Case | null>(null)
  const [entities, setEntities] = useState<Entity[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [resolutions, setResolutions] = useState<Resolution[]>([])
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([])

  // edit form
  const [editName, setEditName] = useState('')
  const [editStatus, setEditStatus] = useState('draft')
  const [editAssignee, setEditAssignee] = useState('')
  const [editThreshold, setEditThreshold] = useState('25')
  const [editTarget, setEditTarget] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const syncForm = (c: Case) => {
    setEditName(c.name ?? '')
    setEditStatus(c.status ?? 'draft')
    setEditAssignee(c.assignee_id ?? '')
    setEditThreshold(String(c.threshold ?? 25))
    setEditTarget(c.target_entity_id ?? '')
    setEditDesc(c.description ?? '')
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setNotFound(false)
    ;(async () => {
      try {
        const c = (await api.getCase(id)) as Case
        if (cancelled) return
        if (!c || !c.id) {
          setNotFound(true)
          setLoading(false)
          return
        }
        setKase(c)
        syncForm(c)
        const [ents, eds, res, disc] = await Promise.all([
          api.getEntities(id).catch(() => []),
          api.getEdges(id).catch(() => []),
          api.getResolutions(id).catch(() => []),
          api.getDiscrepancies(id).catch(() => []),
        ])
        if (cancelled) return
        setEntities(Array.isArray(ents) ? (ents as Entity[]) : [])
        setEdges(Array.isArray(eds) ? (eds as Edge[]) : [])
        setResolutions(Array.isArray(res) ? (res as Resolution[]) : [])
        setDiscrepancies(Array.isArray(disc) ? (disc as Discrepancy[]) : [])
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Failed to load case'
          if (/404|not found/i.test(msg)) setNotFound(true)
          else setError(msg)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const save = async () => {
    if (!editName.trim()) {
      setSaveMsg('Name is required')
      return
    }
    setSaving(true)
    setSaveMsg(null)
    try {
      const updated = (await api.updateCase(id, {
        name: editName.trim(),
        status: editStatus,
        assignee_id: editAssignee.trim() || null,
        threshold: Number(editThreshold) || 0,
        target_entity_id: editTarget || null,
        description: editDesc.trim() || null,
      })) as Case
      setKase(updated)
      syncForm(updated)
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(null), 2000)
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const latestResolution = resolutions[0]
  const targetEntity = entities.find((e) => e.id === (kase?.target_entity_id ?? ''))

  const subtools = [
    { label: 'Ownership Graph', href: `/dashboard/cases/${id}/graph`, desc: 'Edit entities and ownership edges' },
    { label: 'Resolutions', href: '/dashboard/resolutions', desc: 'Run and review resolution passes' },
    { label: 'Owners Roster', href: '/dashboard/owners', desc: 'Resolved beneficial owners' },
    { label: 'Paths Explorer', href: '/dashboard/paths', desc: 'Trace ownership chains' },
    { label: 'Control Findings', href: '/dashboard/control-findings', desc: 'Substantial-control tests' },
    { label: 'Filed Set', href: '/dashboard/filed-set', desc: 'Declared owners on file' },
    { label: 'Discrepancies', href: '/dashboard/discrepancies', desc: 'Computed vs filed mismatches' },
    { label: 'Snapshots', href: '/dashboard/snapshots', desc: 'Versioned graph snapshots' },
    { label: 'Documents', href: '/dashboard/documents', desc: 'Evidence library' },
    { label: 'Exports', href: '/dashboard/exports', desc: 'Roster and diagram exports' },
  ]

  if (loading) return <PageSpinner label="Loading case..." />

  if (notFound) {
    return (
      <EmptyState
        title="Case not found"
        description="This case does not exist or you do not have access to it."
        action={
          <Link href="/dashboard/cases">
            <Button>Back to cases</Button>
          </Link>
        }
      />
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
        <Link href="/dashboard/cases">
          <Button variant="secondary">Back to cases</Button>
        </Link>
      </div>
    )
  }

  if (!kase) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <Link href="/dashboard/cases" className="hover:text-indigo-300">
            Cases
          </Link>
          <span>/</span>
          <span className="text-stone-300">{kase.name}</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-stone-100">{kase.name}</h1>
            <Badge tone={statusTone(kase.status)}>{kase.status ?? 'draft'}</Badge>
          </div>
          <div className="flex gap-2">
            <Link href={`/dashboard/cases/${id}/graph`}>
              <Button variant="secondary">Open graph</Button>
            </Link>
          </div>
        </div>
        {kase.description && <p className="max-w-3xl text-sm text-stone-400">{kase.description}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Entities" value={entities.length} hint={`${entities.filter((e) => e.is_natural_person).length} natural persons`} tone="indigo" />
        <Stat label="Ownership edges" value={edges.length} tone="default" />
        <Stat
          label="Qualifying owners"
          value={latestResolution?.qualifying_count ?? '—'}
          hint={latestResolution ? `at ${fmtPct(latestResolution.threshold)}` : 'No resolution yet'}
          tone="green"
        />
        <Stat label="Discrepancies" value={discrepancies.length} tone={discrepancies.length ? 'rose' : 'default'} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Edit panel */}
        <Card className="xl:col-span-1">
          <CardHeader>
            <h2 className="text-sm font-semibold text-stone-200">Case settings</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                  Threshold (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={editThreshold}
                  onChange={(e) => setEditThreshold(e.target.value)}
                  className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Assignee</label>
              <input
                value={editAssignee}
                onChange={(e) => setEditAssignee(e.target.value)}
                placeholder="User id (optional)"
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                Target entity
              </label>
              <select
                value={editTarget}
                onChange={(e) => setEditTarget(e.target.value)}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">None selected</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.is_target ? ' (target)' : ''}
                  </option>
                ))}
              </select>
              {entities.length === 0 && (
                <p className="mt-1 text-xs text-stone-600">
                  Add entities in the{' '}
                  <Link href={`/dashboard/cases/${id}/graph`} className="text-indigo-400 hover:text-indigo-300">
                    graph editor
                  </Link>{' '}
                  first.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                Description
              </label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs ${saveMsg === 'Saved' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {saveMsg}
              </span>
              <Button variant="primary" onClick={save} disabled={saving}>
                {saving ? <Spinner /> : 'Save changes'}
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Right column */}
        <div className="space-y-6 xl:col-span-2">
          {/* Target / meta */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-stone-200">Summary</h2>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-stone-500">Target entity</dt>
                  <dd className="mt-0.5 text-stone-200">{targetEntity?.name ?? <span className="text-stone-600">Not set</span>}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-stone-500">Threshold</dt>
                  <dd className="mt-0.5 tabular-nums text-stone-200">{fmtPct(kase.threshold)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-stone-500">Assignee</dt>
                  <dd className="mt-0.5 text-stone-200">{kase.assignee_id || <span className="text-stone-600">Unassigned</span>}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-stone-500">Created</dt>
                  <dd className="mt-0.5 text-stone-200">{fmtDate(kase.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-stone-500">Updated</dt>
                  <dd className="mt-0.5 text-stone-200">{fmtDate(kase.updated_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-stone-500">Last resolution</dt>
                  <dd className="mt-0.5 text-stone-200">{latestResolution ? fmtDate(latestResolution.created_at) : <span className="text-stone-600">None</span>}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {/* Recent resolutions */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-200">Recent resolutions</h2>
              <Link href="/dashboard/resolutions" className="text-xs font-medium text-indigo-400 hover:text-indigo-300">
                Manage
              </Link>
            </CardHeader>
            <CardBody className="p-0">
              {resolutions.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-stone-500">
                  No resolutions run yet for this case.
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Run</TH>
                      <TH>Threshold</TH>
                      <TH>Qualifying</TH>
                      <TH>Control</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {resolutions.slice(0, 5).map((r) => (
                      <TR key={r.id}>
                        <TD>
                          <Link href={`/dashboard/resolutions/${r.id}`} className="text-stone-200 hover:text-indigo-300">
                            {fmtDate(r.created_at)}
                          </Link>
                        </TD>
                        <TD className="tabular-nums">{fmtPct(r.threshold)}</TD>
                        <TD className="tabular-nums">{r.qualifying_count ?? 0}</TD>
                        <TD className="tabular-nums">{r.control_count ?? 0}</TD>
                        <TD>
                          <Badge tone={r.status === 'complete' || r.status === 'completed' ? 'green' : 'sky'}>
                            {r.status ?? 'done'}
                          </Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>

          {/* Discrepancies */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-200">Discrepancies</h2>
              <Link href="/dashboard/discrepancies" className="text-xs font-medium text-indigo-400 hover:text-indigo-300">
                Detect
              </Link>
            </CardHeader>
            <CardBody className="p-0">
              {discrepancies.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-stone-500">
                  No discrepancies recorded between computed and filed ownership.
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Person</TH>
                      <TH>Kind</TH>
                      <TH>Severity</TH>
                      <TH>Computed</TH>
                      <TH>Filed</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {discrepancies.map((d) => (
                      <TR key={d.id}>
                        <TD className="font-medium text-stone-100">{d.person_name ?? '—'}</TD>
                        <TD className="text-stone-400">{d.kind ?? '—'}</TD>
                        <TD>
                          <Badge tone={severityTone(d.severity)}>{d.severity ?? 'info'}</Badge>
                        </TD>
                        <TD className="tabular-nums">{fmtPct(d.computed_value)}</TD>
                        <TD className="tabular-nums">{fmtPct(d.filed_value)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Sub-tools */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-stone-200">Tools</h2>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subtools.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="group rounded-lg border border-stone-800 bg-stone-950/40 px-4 py-3 transition-colors hover:border-indigo-500/40 hover:bg-stone-900"
              >
                <div className="text-sm font-medium text-stone-200 group-hover:text-indigo-300">{t.label}</div>
                <div className="mt-0.5 text-xs text-stone-500">{t.desc}</div>
              </Link>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
