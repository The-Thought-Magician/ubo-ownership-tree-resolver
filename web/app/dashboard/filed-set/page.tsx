'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
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

interface FiledOwner {
  id: string
  case_id: string
  person_name: string
  declared_ownership: number | null
  declared_control: boolean
  filing_reference: string | null
  created_at?: string
}

interface FormState {
  person_name: string
  declared_ownership: string
  declared_control: boolean
  filing_reference: string
}

const EMPTY_FORM: FormState = {
  person_name: '',
  declared_ownership: '',
  declared_control: false,
  filing_reference: '',
}

function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${Number(n).toFixed(2).replace(/\.00$/, '')}%`
}

export default function FiledSetPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState<string>('')
  const [owners, setOwners] = useState<FiledOwner[]>([])
  const [ownersLoading, setOwnersLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [controlFilter, setControlFilter] = useState<'all' | 'control' | 'none'>('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<FiledOwner | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Bootstrap: workspaces + cases
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

  const loadOwners = useCallback(async (cid: string) => {
    if (!cid) {
      setOwners([])
      return
    }
    try {
      setOwnersLoading(true)
      setError(null)
      const rows: FiledOwner[] = await api.getFiledOwners(cid)
      setOwners(rows || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load filed owners')
    } finally {
      setOwnersLoading(false)
    }
  }, [])

  useEffect(() => {
    if (caseId) void loadOwners(caseId)
  }, [caseId, loadOwners])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return owners.filter((o) => {
      if (controlFilter === 'control' && !o.declared_control) return false
      if (controlFilter === 'none' && o.declared_control) return false
      if (!q) return true
      return (
        o.person_name.toLowerCase().includes(q) ||
        (o.filing_reference || '').toLowerCase().includes(q)
      )
    })
  }, [owners, search, controlFilter])

  const stats = useMemo(() => {
    const total = owners.length
    const controlCount = owners.filter((o) => o.declared_control).length
    const overThreshold = owners.filter((o) => (o.declared_ownership ?? 0) >= 25).length
    const sumDeclared = owners.reduce((acc, o) => acc + (o.declared_ownership ?? 0), 0)
    return { total, controlCount, overThreshold, sumDeclared }
  }, [owners])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(o: FiledOwner) {
    setEditing(o)
    setForm({
      person_name: o.person_name,
      declared_ownership: o.declared_ownership === null || o.declared_ownership === undefined ? '' : String(o.declared_ownership),
      declared_control: !!o.declared_control,
      filing_reference: o.filing_reference || '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  async function submit() {
    if (!form.person_name.trim()) {
      setFormError('Person name is required.')
      return
    }
    if (!caseId) {
      setFormError('Select a case first.')
      return
    }
    const ownership = form.declared_ownership.trim() === '' ? 0 : Number(form.declared_ownership)
    if (Number.isNaN(ownership) || ownership < 0 || ownership > 100) {
      setFormError('Declared ownership must be between 0 and 100.')
      return
    }
    try {
      setSaving(true)
      setFormError(null)
      const body = {
        case_id: caseId,
        person_name: form.person_name.trim(),
        declared_ownership: ownership,
        declared_control: form.declared_control,
        filing_reference: form.filing_reference.trim() || null,
      }
      if (editing) {
        await api.updateFiledOwner(editing.id, body)
      } else {
        await api.createFiledOwner(body)
      }
      setModalOpen(false)
      await loadOwners(caseId)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save filed owner')
    } finally {
      setSaving(false)
    }
  }

  async function remove(o: FiledOwner) {
    if (!confirm(`Delete filed owner "${o.person_name}"? This cannot be undone.`)) return
    try {
      setBusyId(o.id)
      await api.deleteFiledOwner(o.id)
      await loadOwners(caseId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete filed owner')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleControl(o: FiledOwner) {
    try {
      setBusyId(o.id)
      await api.updateFiledOwner(o.id, {
        case_id: o.case_id,
        person_name: o.person_name,
        declared_ownership: o.declared_ownership ?? 0,
        declared_control: !o.declared_control,
        filing_reference: o.filing_reference,
      })
      await loadOwners(caseId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update filed owner')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <PageSpinner label="Loading filed set..." />

  const activeCase = cases.find((c) => c.id === caseId)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Filed Owner Set</h1>
          <p className="mt-1 text-sm text-slate-500">
            The previously filed or declared beneficial-owner set used as the baseline for discrepancy detection.
          </p>
        </div>
        <Button onClick={openCreate} disabled={!caseId}>
          + Add Filed Owner
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {workspaces.length === 0 ? (
        <EmptyState
          title="No workspace yet"
          description="Create a workspace and a case before declaring filed owners."
        />
      ) : cases.length === 0 ? (
        <EmptyState
          title="No cases available"
          description="Create a case from the Cases page, then record its filed owner set here."
        />
      ) : (
        <>
          <Card>
            <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Case</label>
              <select
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none sm:w-80"
              >
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {activeCase?.status && <Badge tone="slate">{activeCase.status}</Badge>}
            </CardBody>
          </Card>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Filed Owners" value={stats.total} />
            <Stat label="Declared Control" value={stats.controlCount} tone="indigo" />
            <Stat label="≥ 25% Ownership" value={stats.overThreshold} tone="amber" />
            <Stat label="Sum Declared" value={pct(stats.sumDeclared)} tone={stats.sumDeclared > 100 ? 'rose' : 'green'} />
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or filing reference..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none sm:w-64"
                />
                <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
                  {(['all', 'control', 'none'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setControlFilter(f)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                        controlFilter === f ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {f === 'none' ? 'No control' : f}
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-xs text-slate-500">
                {filtered.length} of {owners.length} shown
              </span>
            </CardHeader>
            <CardBody className="p-0">
              {ownersLoading ? (
                <div className="py-12">
                  <Spinner label="Loading filed owners..." />
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title={owners.length === 0 ? 'No filed owners declared' : 'No matches'}
                    description={
                      owners.length === 0
                        ? 'Add the owners as they were previously filed or declared with the registry.'
                        : 'Adjust your search or filter to see filed owners.'
                    }
                    action={
                      owners.length === 0 ? (
                        <Button onClick={openCreate}>+ Add Filed Owner</Button>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Person</TH>
                      <TH>Declared Ownership</TH>
                      <TH>Control</TH>
                      <TH>Filing Reference</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {filtered.map((o) => (
                      <TR key={o.id}>
                        <TD className="font-medium text-slate-100">{o.person_name}</TD>
                        <TD>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                              <div
                                className="h-full rounded-full bg-indigo-500"
                                style={{ width: `${Math.min(100, Math.max(0, o.declared_ownership ?? 0))}%` }}
                              />
                            </div>
                            <span className="tabular-nums text-slate-300">{pct(o.declared_ownership)}</span>
                          </div>
                        </TD>
                        <TD>
                          <button
                            onClick={() => toggleControl(o)}
                            disabled={busyId === o.id}
                            title="Toggle declared control"
                          >
                            {o.declared_control ? (
                              <Badge tone="indigo">Declared</Badge>
                            ) : (
                              <Badge tone="slate">None</Badge>
                            )}
                          </button>
                        </TD>
                        <TD className="text-slate-400">{o.filing_reference || '—'}</TD>
                        <TD className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => openEdit(o)}>
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              className="px-2 py-1 text-xs text-rose-400 hover:text-rose-300"
                              disabled={busyId === o.id}
                              onClick={() => remove(o)}
                            >
                              {busyId === o.id ? '...' : 'Delete'}
                            </Button>
                          </div>
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
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Edit Filed Owner' : 'Add Filed Owner'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Owner'}
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
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Person Name
            </label>
            <input
              value={form.person_name}
              onChange={(e) => setForm({ ...form, person_name: e.target.value })}
              placeholder="e.g. Jane Doe"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Declared Ownership (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={form.declared_ownership}
              onChange={(e) => setForm({ ...form, declared_ownership: e.target.value })}
              placeholder="0"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Filing Reference
            </label>
            <input
              value={form.filing_reference}
              onChange={(e) => setForm({ ...form, filing_reference: e.target.value })}
              placeholder="e.g. BOI-2024-00123"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.declared_control}
              onChange={(e) => setForm({ ...form, declared_control: e.target.checked })}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
            />
            Declared as exercising substantial control
          </label>
        </div>
      </Modal>
    </div>
  )
}
