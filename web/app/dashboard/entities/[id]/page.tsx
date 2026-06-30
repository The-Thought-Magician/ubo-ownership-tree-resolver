'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

interface Entity {
  id: string
  case_id: string
  name: string
  entity_type?: string | null
  jurisdiction?: string | null
  registration_number?: string | null
  formation_date?: string | null
  is_natural_person?: boolean
  is_target?: boolean
}
interface Document {
  id: string
  case_id: string
  entity_id?: string | null
  title: string
  url?: string | null
  content?: string | null
  doc_type?: string | null
  created_at?: string
}
interface Note {
  id: string
  case_id: string
  entity_id?: string | null
  body: string
  created_by?: string
  created_at?: string
}

const ENTITY_TYPES = ['individual', 'company', 'trust', 'partnership', 'foundation', 'nominee', 'fund', 'other']
const DOC_TYPES = ['registry', 'shareholding', 'declaration', 'passport', 'trust_deed', 'contract', 'other']

function fmtDate(v?: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString()
}

export default function EntityDetailPage() {
  const params = useParams<{ id: string }>()
  const entityId = params.id

  const [entity, setEntity] = useState<Entity | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // edit entity
  const [editModal, setEditModal] = useState(false)
  const [form, setForm] = useState({
    name: '',
    entity_type: 'company',
    jurisdiction: '',
    registration_number: '',
    is_natural_person: false,
    is_target: false,
  })

  // document
  const [docModal, setDocModal] = useState(false)
  const [docForm, setDocForm] = useState({ title: '', doc_type: 'registry', url: '', content: '' })

  // note
  const [noteBody, setNoteBody] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const ent = (await api.getEntity(entityId)) as Entity
      setEntity(ent)
      setForm({
        name: ent.name,
        entity_type: ent.entity_type || 'company',
        jurisdiction: ent.jurisdiction || '',
        registration_number: ent.registration_number || '',
        is_natural_person: !!ent.is_natural_person,
        is_target: !!ent.is_target,
      })
      const caseId = ent.case_id
      const [docs, nts] = await Promise.all([
        api.getDocuments(caseId).then((r) => (Array.isArray(r) ? (r as Document[]) : [])).catch(() => [] as Document[]),
        api.getNotes(caseId).then((r) => (Array.isArray(r) ? (r as Note[]) : [])).catch(() => [] as Note[]),
      ])
      setDocuments(docs.filter((d) => d.entity_id === entityId))
      setNotes(nts.filter((n) => n.entity_id === entityId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load entity')
    } finally {
      setLoading(false)
    }
  }, [entityId])

  useEffect(() => {
    void load()
  }, [load])

  const saveEntity = async () => {
    if (!entity || !form.name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.updateEntity(entity.id, {
        name: form.name.trim(),
        entity_type: form.entity_type,
        jurisdiction: form.jurisdiction || null,
        registration_number: form.registration_number || null,
        is_natural_person: form.is_natural_person,
        is_target: form.is_target,
      })
      setEditModal(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save entity')
    } finally {
      setBusy(false)
    }
  }

  const saveDoc = async () => {
    if (!entity || !docForm.title.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.createDocument({
        case_id: entity.case_id,
        entity_id: entity.id,
        title: docForm.title.trim(),
        doc_type: docForm.doc_type,
        url: docForm.url || null,
        content: docForm.content || null,
      })
      setDocModal(false)
      setDocForm({ title: '', doc_type: 'registry', url: '', content: '' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add document')
    } finally {
      setBusy(false)
    }
  }

  const addNote = async () => {
    if (!entity || !noteBody.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.createNote({ case_id: entity.case_id, entity_id: entity.id, body: noteBody.trim() })
      setNoteBody('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add note')
    } finally {
      setBusy(false)
    }
  }

  const removeNote = async (id: string) => {
    if (!confirm('Delete this note?')) return
    setBusy(true)
    try {
      await api.deleteNote(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete note')
    } finally {
      setBusy(false)
    }
  }

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [notes],
  )

  if (loading) return <PageSpinner label="Loading entity..." />

  const input =
    'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none'
  const labelCls = 'mb-1 block text-xs font-medium text-slate-400'

  if (!entity) {
    return (
      <EmptyState
        title="Entity not found"
        description={error || 'This entity does not exist or you do not have access.'}
        action={<Link href="/dashboard/entities"><Button>Back to registry</Button></Link>}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/entities" className="text-xs text-indigo-400 hover:text-indigo-300">&larr; Entity registry</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
              {entity.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-100">{entity.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge tone="slate">{entity.entity_type || 'entity'}</Badge>
                {entity.is_target && <Badge tone="amber">Target</Badge>}
                {entity.is_natural_person ? <Badge tone="green">Natural person</Badge> : <Badge tone="indigo">Legal entity</Badge>}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href={`/dashboard/cases/${entity.case_id}/graph`}><Button variant="secondary">Open in graph</Button></Link>
            <Button onClick={() => setEditModal(true)}>Edit</Button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-slate-200">Details</h2></CardHeader>
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Jurisdiction</dt>
              <dd className="mt-0.5 text-sm text-slate-200">{entity.jurisdiction || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Registration No.</dt>
              <dd className="mt-0.5 text-sm text-slate-200">{entity.registration_number || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Formation date</dt>
              <dd className="mt-0.5 text-sm text-slate-200">{fmtDate(entity.formation_date)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Type</dt>
              <dd className="mt-0.5 text-sm text-slate-200">{entity.entity_type || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Case</dt>
              <dd className="mt-0.5 text-sm">
                <Link href={`/dashboard/cases/${entity.case_id}`} className="text-indigo-400 hover:text-indigo-300">View case</Link>
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Documents */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Documents <span className="text-slate-500">({documents.length})</span></h2>
            <Button variant="secondary" className="px-3 py-1.5" onClick={() => setDocModal(true)}>+ Add</Button>
          </CardHeader>
          <CardBody>
            {documents.length === 0 ? (
              <p className="text-sm text-slate-500">No documents attached to this entity yet.</p>
            ) : (
              <ul className="space-y-3">
                {documents.map((d) => (
                  <li key={d.id} className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-slate-100">{d.title}</span>
                          {d.doc_type && <Badge tone="sky">{d.doc_type}</Badge>}
                        </div>
                        {d.content && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{d.content}</p>}
                        {d.url && (
                          <a href={d.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-indigo-400 hover:text-indigo-300">
                            {d.url}
                          </a>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-slate-600">{fmtDate(d.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-slate-200">Notes <span className="text-slate-500">({notes.length})</span></h2></CardHeader>
          <CardBody className="space-y-4">
            <div className="flex gap-2">
              <textarea
                className={input}
                rows={2}
                placeholder="Add an investigation note..."
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
              />
              <Button onClick={addNote} disabled={busy || !noteBody.trim()} className="self-start">Add</Button>
            </div>
            {sortedNotes.length === 0 ? (
              <p className="text-sm text-slate-500">No notes recorded for this entity.</p>
            ) : (
              <ul className="space-y-3">
                {sortedNotes.map((n) => (
                  <li key={n.id} className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="whitespace-pre-wrap text-sm text-slate-200">{n.body}</p>
                      <button
                        onClick={() => removeNote(n.id)}
                        className="shrink-0 text-xs text-slate-500 hover:text-rose-400"
                        aria-label="Delete note"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-slate-600">{fmtDate(n.created_at)}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Edit entity modal */}
      <Modal
        open={editModal}
        onClose={() => setEditModal(false)}
        title="Edit entity"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditModal(false)}>Cancel</Button>
            <Button onClick={saveEntity} disabled={busy || !form.name.trim()}>{busy ? 'Saving...' : 'Save'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Name</label>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
              <input className={input} value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Registration number</label>
            <input className={input} value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })} />
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

      {/* Add document modal */}
      <Modal
        open={docModal}
        onClose={() => setDocModal(false)}
        title="Add document"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDocModal(false)}>Cancel</Button>
            <Button onClick={saveDoc} disabled={busy || !docForm.title.trim()}>{busy ? 'Saving...' : 'Add document'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Title</label>
            <input className={input} value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} placeholder="Companies House extract" />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <select className={input} value={docForm.doc_type} onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })}>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>URL</label>
            <input className={input} value={docForm.url} onChange={(e) => setDocForm({ ...docForm, url: e.target.value })} placeholder="https://... (optional)" />
          </div>
          <div>
            <label className={labelCls}>Content / summary</label>
            <textarea className={input} rows={3} value={docForm.content} onChange={(e) => setDocForm({ ...docForm, content: e.target.value })} placeholder="optional notes or extracted text" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
