'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'

interface Workspace {
  id: string
  name: string
}
interface Case {
  id: string
  name: string
}
interface Entity {
  id: string
  name: string
  entity_type?: string
  is_natural_person?: boolean
}
interface Trust {
  id: string
  case_id: string
  entity_id: string
  trustees?: string[] | unknown
  beneficiaries?: string[] | unknown
  grantor?: string | null
  flow_rule?: string
  created_at?: string
}

const FLOW_RULES = [
  { value: 'beneficiaries', label: 'Flow to beneficiaries' },
  { value: 'trustees', label: 'Flow to trustees' },
  { value: 'grantor', label: 'Flow to grantor' },
  { value: 'split', label: 'Split evenly across parties' },
]

function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  if (v && typeof v === 'object') {
    for (const key of ['data', 'items', 'rows', 'results']) {
      const inner = (v as Record<string, unknown>)[key]
      if (Array.isArray(inner)) return inner as T[]
    }
  }
  return []
}

function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean)
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean)
    } catch {
      return v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
  }
  return []
}

function parseList(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

interface FormState {
  entity_id: string
  trustees: string
  beneficiaries: string
  grantor: string
  flow_rule: string
}

const EMPTY_FORM: FormState = {
  entity_id: '',
  trustees: '',
  beneficiaries: '',
  grantor: '',
  flow_rule: 'beneficiaries',
}

export default function TrustsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')

  const [entities, setEntities] = useState<Entity[]>([])
  const [trusts, setTrusts] = useState<Trust[]>([])

  const [bootLoading, setBootLoading] = useState(true)
  const [caseLoading, setCaseLoading] = useState(false)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Trust | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

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

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    ;(async () => {
      try {
        const cs = asArray<Case>(await api.getCases(workspaceId))
        if (cancelled) return
        setCases(cs)
        setCaseId((prev) => (cs.some((c) => c.id === prev) ? prev : cs[0]?.id ?? ''))
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load cases')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const loadCaseData = useCallback(async (cid: string) => {
    setCaseLoading(true)
    setError('')
    try {
      const [ents, trs] = await Promise.all([api.getEntities(cid), api.getTrusts(cid)])
      setEntities(asArray<Entity>(ents))
      setTrusts(asArray<Trust>(trs))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load case data')
    } finally {
      setCaseLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!caseId) {
      setEntities([])
      setTrusts([])
      return
    }
    loadCaseData(caseId)
  }, [caseId, loadCaseData])

  const entityName = useCallback(
    (id: string) => entities.find((e) => e.id === id)?.name ?? id,
    [entities],
  )

  // Entities not already modeled as a trust (entity_id is UNIQUE per trust).
  const availableEntities = useMemo(() => {
    const taken = new Set(trusts.map((t) => t.entity_id))
    return entities.filter((e) => editing?.entity_id === e.id || !taken.has(e.id))
  }, [entities, trusts, editing])

  const filteredTrusts = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return trusts
    return trusts.filter((t) => {
      const name = entityName(t.entity_id).toLowerCase()
      const grantor = (t.grantor ?? '').toString().toLowerCase()
      return name.includes(q) || grantor.includes(q)
    })
  }, [trusts, search, entityName])

  const totalTrustees = useMemo(
    () => trusts.reduce((sum, t) => sum + asStringList(t.trustees).length, 0),
    [trusts],
  )
  const totalBeneficiaries = useMemo(
    () => trusts.reduce((sum, t) => sum + asStringList(t.beneficiaries).length, 0),
    [trusts],
  )

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, entity_id: availableEntities[0]?.id ?? '' })
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(t: Trust) {
    setEditing(t)
    setForm({
      entity_id: t.entity_id,
      trustees: asStringList(t.trustees).join('\n'),
      beneficiaries: asStringList(t.beneficiaries).join('\n'),
      grantor: t.grantor ?? '',
      flow_rule: t.flow_rule ?? 'beneficiaries',
    })
    setFormError('')
    setModalOpen(true)
  }

  async function save() {
    if (!form.entity_id) {
      setFormError('Select the trust entity.')
      return
    }
    setSaving(true)
    setFormError('')
    const payload = {
      case_id: caseId,
      entity_id: form.entity_id,
      trustees: parseList(form.trustees),
      beneficiaries: parseList(form.beneficiaries),
      grantor: form.grantor.trim() || null,
      flow_rule: form.flow_rule,
    }
    try {
      if (editing) {
        await api.updateTrust(editing.id, payload)
      } else {
        await api.createTrust(payload)
      }
      setModalOpen(false)
      await loadCaseData(caseId)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save trust')
    } finally {
      setSaving(false)
    }
  }

  async function remove(t: Trust) {
    if (!confirm(`Delete trust model for "${entityName(t.entity_id)}"?`)) return
    try {
      await api.deleteTrust(t.id)
      await loadCaseData(caseId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete trust')
    }
  }

  // Demonstrates getTrustByEntity: load a single trust by its entity directly.
  async function inspectByEntity(entityId: string) {
    setError('')
    try {
      const t = (await api.getTrustByEntity(entityId)) as Trust
      if (t) openEdit(t)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No trust found for that entity')
    }
  }

  const flowLabel = (rule?: string) => FLOW_RULES.find((f) => f.value === rule)?.label ?? rule ?? '—'

  if (bootLoading) return <PageSpinner label="Loading trusts workspace…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-100">Trusts</h1>
          <p className="mt-1 text-sm text-stone-500">
            Model trustees, beneficiaries, the grantor, and how ownership flows through a trust entity.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {cases.length === 0 && <option value="">No cases</option>}
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      {!caseId ? (
        <EmptyState title="No case selected" description="Pick or create a case to model its trust entities." />
      ) : caseLoading ? (
        <PageSpinner label="Loading trusts…" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Trusts modeled" value={trusts.length} tone="indigo" />
            <Stat label="Trustees" value={totalTrustees} />
            <Stat label="Beneficiaries" value={totalBeneficiaries} tone="green" />
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 items-center gap-3">
                <h2 className="text-base font-semibold text-stone-100">Trust models</h2>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by entity or grantor…"
                  className="w-full max-w-xs rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <Button onClick={openCreate} disabled={availableEntities.length === 0}>
                New trust model
              </Button>
            </CardHeader>
            <CardBody>
              {entities.length === 0 ? (
                <EmptyState
                  title="No entities in this case"
                  description="Add entities in the graph editor first, then mark trust entities here."
                />
              ) : filteredTrusts.length === 0 ? (
                <EmptyState
                  title={search ? 'No matching trusts' : 'No trusts modeled yet'}
                  description={
                    search
                      ? 'Try a different search term.'
                      : 'Click “New trust model” to designate an entity as a trust and assign its parties.'
                  }
                />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Trust entity</TH>
                      <TH>Grantor</TH>
                      <TH>Trustees</TH>
                      <TH>Beneficiaries</TH>
                      <TH>Flow rule</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {filteredTrusts.map((t) => {
                      const trustees = asStringList(t.trustees)
                      const beneficiaries = asStringList(t.beneficiaries)
                      return (
                        <TR key={t.id}>
                          <TD className="font-medium text-stone-200">{entityName(t.entity_id)}</TD>
                          <TD>{t.grantor || <span className="text-stone-600">—</span>}</TD>
                          <TD>
                            <div className="flex flex-wrap gap-1">
                              {trustees.length === 0 ? (
                                <span className="text-stone-600">—</span>
                              ) : (
                                trustees.map((name, i) => (
                                  <Badge key={i} tone="sky">
                                    {name}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </TD>
                          <TD>
                            <div className="flex flex-wrap gap-1">
                              {beneficiaries.length === 0 ? (
                                <span className="text-stone-600">—</span>
                              ) : (
                                beneficiaries.map((name, i) => (
                                  <Badge key={i} tone="green">
                                    {name}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </TD>
                          <TD>
                            <Badge tone="indigo">{flowLabel(t.flow_rule)}</Badge>
                          </TD>
                          <TD className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="secondary"
                                className="px-3 py-1.5 text-xs"
                                onClick={() => inspectByEntity(t.entity_id)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="danger"
                                className="px-3 py-1.5 text-xs"
                                onClick={() => remove(t)}
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
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Edit trust model' : 'New trust model'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create trust'}
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
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
              Trust entity
            </label>
            <select
              value={form.entity_id}
              onChange={(e) => setForm((f) => ({ ...f, entity_id: e.target.value }))}
              disabled={Boolean(editing)}
              className="w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
            >
              <option value="">Select entity…</option>
              {availableEntities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.entity_type ? ` (${e.entity_type})` : ''}
                </option>
              ))}
            </select>
            {editing && <p className="mt-1 text-xs text-stone-600">Trust entity cannot be changed after creation.</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Grantor</label>
            <input
              value={form.grantor}
              onChange={(e) => setForm((f) => ({ ...f, grantor: e.target.value }))}
              placeholder="Person who settled the trust"
              className="w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                Trustees
              </label>
              <textarea
                value={form.trustees}
                onChange={(e) => setForm((f) => ({ ...f, trustees: e.target.value }))}
                rows={4}
                placeholder="One per line or comma-separated"
                className="w-full resize-y rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                Beneficiaries
              </label>
              <textarea
                value={form.beneficiaries}
                onChange={(e) => setForm((f) => ({ ...f, beneficiaries: e.target.value }))}
                rows={4}
                placeholder="One per line or comma-separated"
                className="w-full resize-y rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
              Ownership flow rule
            </label>
            <select
              value={form.flow_rule}
              onChange={(e) => setForm((f) => ({ ...f, flow_rule: e.target.value }))}
              className="w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {FLOW_RULES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-stone-600">
              Determines which parties receive the trust&apos;s effective ownership during resolution.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
