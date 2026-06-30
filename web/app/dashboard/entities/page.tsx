'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'

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
  case_id: string
  name: string
  entity_type?: string | null
  jurisdiction?: string | null
  registration_number?: string | null
  is_natural_person?: boolean
  is_target?: boolean
}

const ENTITY_TYPES = ['individual', 'company', 'trust', 'partnership', 'foundation', 'nominee', 'fund', 'other']

const blankForm = {
  case_id: '',
  name: '',
  entity_type: 'company',
  jurisdiction: '',
  registration_number: '',
  is_natural_person: false,
  is_target: false,
}

export default function EntityRegistryPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [cases, setCases] = useState<Case[]>([])
  const [entities, setEntities] = useState<Entity[]>([])

  const [loadingWs, setLoadingWs] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [search, setSearch] = useState('')
  const [caseFilter, setCaseFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState<'all' | 'person' | 'entity' | 'target'>('all')

  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Entity | null>(null)
  const [form, setForm] = useState({ ...blankForm })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ws = await api.getWorkspaces()
        if (cancelled) return
        const list: Workspace[] = Array.isArray(ws) ? ws : []
        setWorkspaces(list)
        if (list.length) setWorkspaceId(list[0].id)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load workspaces')
      } finally {
        if (!cancelled) setLoadingWs(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const load = useCallback(async () => {
    if (!workspaceId) return
    setLoadingData(true)
    setError(null)
    try {
      const cs = await api.getCases(workspaceId)
      const caseList: Case[] = Array.isArray(cs) ? cs : []
      setCases(caseList)
      const perCase = await Promise.all(
        caseList.map((c) => api.getEntities(c.id).then((r) => (Array.isArray(r) ? (r as Entity[]) : [])).catch(() => [] as Entity[])),
      )
      setEntities(perCase.flat())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load entities')
    } finally {
      setLoadingData(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  const caseName = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of cases) m.set(c.id, c.name)
    return m
  }, [cases])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entities.filter((e) => {
      if (caseFilter !== 'all' && e.case_id !== caseFilter) return false
      if (typeFilter !== 'all' && (e.entity_type || '') !== typeFilter) return false
      if (kindFilter === 'person' && !e.is_natural_person) return false
      if (kindFilter === 'entity' && e.is_natural_person) return false
      if (kindFilter === 'target' && !e.is_target) return false
      if (q) {
        const hay = `${e.name} ${e.jurisdiction || ''} ${e.registration_number || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [entities, search, caseFilter, typeFilter, kindFilter])

  const stats = useMemo(() => {
    const persons = entities.filter((e) => e.is_natural_person).length
    const targets = entities.filter((e) => e.is_target).length
    const jurisdictions = new Set(entities.map((e) => e.jurisdiction).filter(Boolean)).size
    return { total: entities.length, persons, targets, jurisdictions }
  }, [entities])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...blankForm, case_id: caseFilter !== 'all' ? caseFilter : cases[0]?.id || '' })
    setModal(true)
  }
  const openEdit = (e: Entity) => {
    setEditing(e)
    setForm({
      case_id: e.case_id,
      name: e.name,
      entity_type: e.entity_type || 'company',
      jurisdiction: e.jurisdiction || '',
      registration_number: e.registration_number || '',
      is_natural_person: !!e.is_natural_person,
      is_target: !!e.is_target,
    })
    setModal(true)
  }
  const save = async () => {
    if (!form.name.trim() || !form.case_id) return
    setBusy(true)
    setError(null)
    try {
      const body = {
        case_id: form.case_id,
        name: form.name.trim(),
        entity_type: form.entity_type,
        jurisdiction: form.jurisdiction || null,
        registration_number: form.registration_number || null,
        is_natural_person: form.is_natural_person,
        is_target: form.is_target,
      }
      if (editing) await api.updateEntity(editing.id, body)
      else await api.createEntity(body)
      setModal(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save entity')
    } finally {
      setBusy(false)
    }
  }
  const remove = async (id: string) => {
    if (!confirm('Delete this entity?')) return
    setBusy(true)
    try {
      await api.deleteEntity(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete entity')
    } finally {
      setBusy(false)
    }
  }

  if (loadingWs) return <PageSpinner label="Loading registry..." />

  const input =
    'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none'
  const labelCls = 'mb-1 block text-xs font-medium text-slate-400'

  if (workspaces.length === 0) {
    return (
      <EmptyState
        title="No workspace found"
        description="Create a workspace before managing the entity registry."
        action={<Link href="/dashboard/settings"><Button>Go to settings</Button></Link>}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Entity Registry</h1>
          <p className="text-sm text-slate-500">Every party tracked across cases in this workspace.</p>
        </div>
        <div className="flex items-center gap-2">
          {workspaces.length > 1 && (
            <select className={`${input} w-auto`} value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
          <Button onClick={openCreate} disabled={cases.length === 0}>+ New entity</Button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total entities" value={stats.total} tone="indigo" />
        <Stat label="Natural persons" value={stats.persons} tone="green" />
        <Stat label="Targets" value={stats.targets} tone="amber" />
        <Stat label="Jurisdictions" value={stats.jurisdictions} />
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <input className={`${input} max-w-xs`} placeholder="Search name, jurisdiction, reg. no." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className={`${input} w-auto`} value={caseFilter} onChange={(e) => setCaseFilter(e.target.value)}>
            <option value="all">All cases</option>
            {cases.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={`${input} w-auto`} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All types</option>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="flex gap-1">
            {(['all', 'person', 'entity', 'target'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKindFilter(k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  kindFilter === k ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-slate-500">{filtered.length} of {entities.length}</span>
        </CardBody>
      </Card>

      {loadingData ? (
        <Spinner className="py-12" label="Loading entities..." />
      ) : entities.length === 0 ? (
        <EmptyState
          title="No entities yet"
          description={cases.length === 0 ? 'Create a case first, then add entities to it.' : 'Add your first entity to start mapping ownership.'}
          action={cases.length > 0 ? <Button onClick={openCreate}>Add entity</Button> : <Link href="/dashboard/cases"><Button>Go to cases</Button></Link>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" description="No entities match the current filters." />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Case</TH>
                <TH>Type</TH>
                <TH>Jurisdiction</TH>
                <TH>Reg. No.</TH>
                <TH>Flags</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((e) => (
                <TR key={e.id}>
                  <TD>
                    <Link href={`/dashboard/entities/${e.id}`} className="font-medium text-slate-100 hover:text-indigo-300">{e.name}</Link>
                  </TD>
                  <TD className="text-slate-400">{caseName.get(e.case_id) || '—'}</TD>
                  <TD>{e.entity_type || '—'}</TD>
                  <TD>{e.jurisdiction || '—'}</TD>
                  <TD>{e.registration_number || '—'}</TD>
                  <TD>
                    <div className="flex gap-1">
                      {e.is_target && <Badge tone="amber">Target</Badge>}
                      {e.is_natural_person ? <Badge tone="green">Person</Badge> : <Badge tone="slate">Entity</Badge>}
                    </div>
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/dashboard/entities/${e.id}`}><Button variant="ghost" className="px-2 py-1">View</Button></Link>
                      <Button variant="ghost" className="px-2 py-1" onClick={() => openEdit(e)}>Edit</Button>
                      <Button variant="ghost" className="px-2 py-1 text-rose-400 hover:text-rose-300" onClick={() => remove(e.id)}>Delete</Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Edit entity' : 'New entity'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy || !form.name.trim() || !form.case_id}>{busy ? 'Saving...' : 'Save'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Case</label>
            <select className={input} value={form.case_id} onChange={(e) => setForm({ ...form, case_id: e.target.value })} disabled={!!editing}>
              <option value="">Select case...</option>
              {cases.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Name</label>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Holdings Ltd" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <select className={input} value={form.entity_type} onChange={(e) => setForm({ ...form, entity_type: e.target.value })}>
                {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Jurisdiction</label>
              <input className={input} value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} placeholder="GB" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Registration number</label>
            <input className={input} value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })} placeholder="optional" />
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={form.is_natural_person} onChange={(e) => setForm({ ...form, is_natural_person: e.target.checked })} className="accent-indigo-500" />
              Natural person
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={form.is_target} onChange={(e) => setForm({ ...form, is_target: e.target.checked })} className="accent-indigo-500" />
              Target entity
            </label>
          </div>
        </div>
      </Modal>
    </div>
  )
}
