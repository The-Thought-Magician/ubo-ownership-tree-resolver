'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Workspace {
  id: string
  name: string
}

interface Case {
  id: string
  name: string
  workspace_id: string
}

interface Entity {
  id: string
  name: string
  entity_type: string | null
  is_natural_person: boolean
}

interface ControlFinding {
  id: string
  case_id: string
  person_entity_id: string | null
  criterion: string
  basis: string | null
  rationale: string | null
  determination: string
  created_by: string | null
  created_at: string
}

const CRITERIA = [
  'Senior managing official',
  'Board appointment/removal rights',
  'Veto / blocking rights',
  'Voting control (>25%)',
  'Contractual control',
  'Other significant influence',
]

const DETERMINATIONS = ['control', 'no_control', 'indeterminate']

function determinationTone(d: string): 'green' | 'rose' | 'amber' | 'slate' {
  if (d === 'control') return 'green'
  if (d === 'no_control') return 'rose'
  if (d === 'indeterminate') return 'amber'
  return 'slate'
}

const emptyForm = {
  person_entity_id: '',
  criterion: CRITERIA[0],
  basis: '',
  rationale: '',
  determination: 'control',
}

export default function ControlFindingsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')

  const [entities, setEntities] = useState<Entity[]>([])
  const [findings, setFindings] = useState<ControlFinding[]>([])

  const [search, setSearch] = useState('')
  const [detFilter, setDetFilter] = useState<'all' | string>('all')

  const [bootLoading, setBootLoading] = useState(true)
  const [casesLoading, setCasesLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ControlFinding | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // bootstrap
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ws: Workspace[] = await api.getWorkspaces()
        if (cancelled) return
        setWorkspaces(ws ?? [])
        if (ws?.length) setWorkspaceId(ws[0].id)
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

  // cases when workspace changes
  useEffect(() => {
    let cancelled = false
    if (!workspaceId) return
    ;(async () => {
      setCasesLoading(true)
      setError('')
      try {
        const cs: Case[] = await api.getCases(workspaceId)
        if (cancelled) return
        setCases(cs ?? [])
        setCaseId((prev) => ((cs ?? []).some((c) => c.id === prev) ? prev : cs?.[0]?.id ?? ''))
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load cases')
      } finally {
        if (!cancelled) setCasesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const loadData = useCallback(async (cid: string) => {
    if (!cid) {
      setFindings([])
      setEntities([])
      return
    }
    setDataLoading(true)
    setError('')
    try {
      const [fs, es] = await Promise.all([api.getControlFindings(cid), api.getEntities(cid)])
      const sorted: ControlFinding[] = (fs ?? []).slice().sort((a: ControlFinding, b: ControlFinding) =>
        a.created_at < b.created_at ? 1 : -1,
      )
      setFindings(sorted)
      setEntities(es ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load findings')
      setFindings([])
    } finally {
      setDataLoading(false)
    }
  }, [])

  useEffect(() => {
    if (caseId) loadData(caseId)
  }, [caseId, loadData])

  const entityName = useCallback(
    (id: string | null) => (id ? entities.find((e) => e.id === id)?.name ?? 'Unknown entity' : 'Unassigned'),
    [entities],
  )

  const people = useMemo(() => entities.filter((e) => e.is_natural_person), [entities])

  const filtered = useMemo(() => {
    return findings.filter((f) => {
      if (detFilter !== 'all' && f.determination !== detFilter) return false
      if (search) {
        const hay = `${f.criterion} ${f.basis ?? ''} ${f.rationale ?? ''} ${entityName(f.person_entity_id)}`.toLowerCase()
        if (!hay.includes(search.toLowerCase())) return false
      }
      return true
    })
  }, [findings, detFilter, search, entityName])

  const counts = useMemo(
    () => ({
      total: findings.length,
      control: findings.filter((f) => f.determination === 'control').length,
      no_control: findings.filter((f) => f.determination === 'no_control').length,
      indeterminate: findings.filter((f) => f.determination === 'indeterminate').length,
    }),
    [findings],
  )

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm, person_entity_id: people[0]?.id ?? '' })
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(f: ControlFinding) {
    setEditing(f)
    setForm({
      person_entity_id: f.person_entity_id ?? '',
      criterion: f.criterion,
      basis: f.basis ?? '',
      rationale: f.rationale ?? '',
      determination: f.determination,
    })
    setFormError('')
    setModalOpen(true)
  }

  async function submit() {
    if (!form.criterion.trim()) {
      setFormError('Criterion is required.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const payload = {
        case_id: caseId,
        person_entity_id: form.person_entity_id || null,
        criterion: form.criterion.trim(),
        basis: form.basis.trim() || null,
        rationale: form.rationale.trim() || null,
        determination: form.determination,
      }
      if (editing) {
        await api.updateControlFinding(editing.id, payload)
      } else {
        await api.createControlFinding(payload)
      }
      setModalOpen(false)
      await loadData(caseId)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save finding')
    } finally {
      setSaving(false)
    }
  }

  async function remove(f: ControlFinding) {
    if (!confirm(`Delete control finding "${f.criterion}"? This cannot be undone.`)) return
    try {
      await api.deleteControlFinding(f.id)
      setFindings((prev) => prev.filter((x) => x.id !== f.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete finding')
    }
  }

  if (bootLoading) return <PageSpinner label="Loading workspaces..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-100">Control Findings</h1>
          <p className="mt-1 text-sm text-stone-400">
            Record substantial-control determinations against the FinCEN / KYB control criteria for each natural person.
          </p>
        </div>
        <Button onClick={openCreate} disabled={!caseId}>
          + New finding
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {!workspaces.length ? (
        <EmptyState title="No workspaces yet" description="Create a workspace and a case to begin recording control findings." />
      ) : (
        <>
          <Card>
            <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Workspace</label>
                <select
                  value={workspaceId}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                  className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Case</label>
                <select
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                  disabled={casesLoading || !cases.length}
                  className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                >
                  {casesLoading && <option>Loading...</option>}
                  {!casesLoading && !cases.length && <option value="">No cases</option>}
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </CardBody>
          </Card>

          {!cases.length && !casesLoading ? (
            <EmptyState title="No cases in this workspace" description="Create a case from the Cases page before recording control findings." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat label="Total findings" value={counts.total} />
                <Stat label="Control" value={counts.control} tone="green" />
                <Stat label="No control" value={counts.no_control} tone="rose" />
                <Stat label="Indeterminate" value={counts.indeterminate} tone="amber" />
              </div>

              <Card>
                <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search criterion, basis, person..."
                    className="w-full max-w-xs rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-indigo-500 focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {(['all', ...DETERMINATIONS] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDetFilter(d)}
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize transition-colors ${
                          detFilter === d
                            ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300'
                            : 'border-stone-700 bg-stone-800/50 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {d.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </CardHeader>

                {dataLoading ? (
                  <div className="py-12">
                    <Spinner label="Loading findings..." />
                  </div>
                ) : filtered.length === 0 ? (
                  <CardBody>
                    <EmptyState
                      title={findings.length ? 'No findings match your filters' : 'No control findings yet'}
                      description={
                        findings.length
                          ? 'Adjust the search or determination filter.'
                          : 'Record the first substantial-control determination for a person in this case.'
                      }
                      action={!findings.length ? <Button onClick={openCreate}>+ New finding</Button> : undefined}
                    />
                  </CardBody>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Person</TH>
                        <TH>Criterion</TH>
                        <TH>Basis</TH>
                        <TH>Determination</TH>
                        <TH>Created</TH>
                        <TH className="text-right">Actions</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {filtered.map((f) => (
                        <TR key={f.id}>
                          <TD className="font-medium text-stone-100">{entityName(f.person_entity_id)}</TD>
                          <TD>
                            <Link href={`/dashboard/control-findings/${f.id}`} className="text-indigo-300 hover:text-indigo-200">
                              {f.criterion}
                            </Link>
                          </TD>
                          <TD className="max-w-xs truncate text-stone-400">{f.basis || '—'}</TD>
                          <TD>
                            <Badge tone={determinationTone(f.determination)}>{f.determination.replace('_', ' ')}</Badge>
                          </TD>
                          <TD className="whitespace-nowrap text-stone-500">
                            {new Date(f.created_at).toLocaleDateString()}
                          </TD>
                          <TD className="text-right">
                            <div className="flex justify-end gap-2">
                              <Link href={`/dashboard/control-findings/${f.id}`}>
                                <Button variant="secondary" className="px-3 py-1.5 text-xs">
                                  Worksheet
                                </Button>
                              </Link>
                              <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => openEdit(f)}>
                                Edit
                              </Button>
                              <Button variant="ghost" className="px-3 py-1.5 text-xs text-rose-400 hover:text-rose-300" onClick={() => remove(f)}>
                                Delete
                              </Button>
                            </div>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </Card>
            </>
          )}
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit control finding' : 'New control finding'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save changes' : 'Create finding'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {formError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Person</label>
            <select
              value={form.person_entity_id}
              onChange={(e) => setForm({ ...form, person_entity_id: e.target.value })}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {people.length === 0 && (
              <p className="mt-1 text-xs text-amber-400">No natural-person entities in this case yet.</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Criterion</label>
            <input
              list="control-criteria"
              value={form.criterion}
              onChange={(e) => setForm({ ...form, criterion: e.target.value })}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
            />
            <datalist id="control-criteria">
              {CRITERIA.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Basis</label>
            <input
              value={form.basis}
              onChange={(e) => setForm({ ...form, basis: e.target.value })}
              placeholder="e.g. Shareholders' agreement §4.2"
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Rationale</label>
            <textarea
              value={form.rationale}
              onChange={(e) => setForm({ ...form, rationale: e.target.value })}
              rows={3}
              placeholder="Why this person does / does not exercise substantial control..."
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Determination</label>
            <div className="flex flex-wrap gap-2">
              {DETERMINATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setForm({ ...form, determination: d })}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                    form.determination === d
                      ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300'
                      : 'border-stone-700 bg-stone-800/50 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {d.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
