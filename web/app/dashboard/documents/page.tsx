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

const DOC_TYPES = [
  'registry_extract',
  'shareholder_register',
  'trust_deed',
  'id_document',
  'filing',
  'correspondence',
  'other',
]

const TYPE_TONE: Record<string, 'indigo' | 'sky' | 'green' | 'amber' | 'slate'> = {
  registry_extract: 'indigo',
  shareholder_register: 'sky',
  trust_deed: 'green',
  id_document: 'amber',
  filing: 'indigo',
  correspondence: 'slate',
  other: 'slate',
}

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

function fmtDate(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString()
}

function prettyType(t?: string | null): string {
  if (!t) return 'Other'
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

interface FormState {
  title: string
  url: string
  content: string
  doc_type: string
  entity_id: string
}

const EMPTY_FORM: FormState = {
  title: '',
  url: '',
  content: '',
  doc_type: 'registry_extract',
  entity_id: '',
}

export default function DocumentsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')

  const [documents, setDocuments] = useState<Document[]>([])

  const [bootLoading, setBootLoading] = useState(true)
  const [caseLoading, setCaseLoading] = useState(false)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Document | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [viewing, setViewing] = useState<Document | null>(null)

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

  const loadDocs = useCallback(async (cid: string) => {
    setCaseLoading(true)
    setError('')
    try {
      const docs = asArray<Document>(await api.getDocuments(cid))
      setDocuments(docs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load documents')
    } finally {
      setCaseLoading(false)
    }
  }, [])

  useEffect(() => {
    setSelected(new Set())
    if (!caseId) {
      setDocuments([])
      return
    }
    loadDocs(caseId)
  }, [caseId, loadDocs])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return documents.filter((d) => {
      if (typeFilter && (d.doc_type ?? 'other') !== typeFilter) return false
      if (!q) return true
      return (
        d.title.toLowerCase().includes(q) ||
        (d.url ?? '').toLowerCase().includes(q) ||
        (d.content ?? '').toLowerCase().includes(q)
      )
    })
  }, [documents, search, typeFilter])

  const typeCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of documents) {
      const t = d.doc_type ?? 'other'
      m.set(t, (m.get(t) ?? 0) + 1)
    }
    return m
  }, [documents])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(d: Document) {
    setEditing(d)
    setForm({
      title: d.title ?? '',
      url: d.url ?? '',
      content: d.content ?? '',
      doc_type: d.doc_type ?? 'other',
      entity_id: d.entity_id ?? '',
    })
    setFormError('')
    setModalOpen(true)
  }

  async function save() {
    if (!form.title.trim()) {
      setFormError('Title is required.')
      return
    }
    setSaving(true)
    setFormError('')
    const payload = {
      case_id: caseId,
      title: form.title.trim(),
      url: form.url.trim() || null,
      content: form.content.trim() || null,
      doc_type: form.doc_type,
      entity_id: form.entity_id.trim() || null,
    }
    try {
      if (editing) {
        await api.updateDocument(editing.id, payload)
      } else {
        await api.createDocument(payload)
      }
      setModalOpen(false)
      await loadDocs(caseId)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save document')
    } finally {
      setSaving(false)
    }
  }

  async function remove(d: Document) {
    if (!confirm(`Delete document "${d.title}"?`)) return
    try {
      await api.deleteDocument(d.id)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(d.id)
        return next
      })
      await loadDocs(caseId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete document')
    }
  }

  async function bulkDelete() {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} selected document(s)?`)) return
    setError('')
    try {
      await Promise.all([...selected].map((id) => api.deleteDocument(id)))
      setSelected(new Set())
      await loadDocs(caseId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete selected documents')
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((d) => selected.has(d.id))
  function toggleAll() {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev)
        filtered.forEach((d) => next.delete(d.id))
        return next
      }
      const next = new Set(prev)
      filtered.forEach((d) => next.add(d.id))
      return next
    })
  }

  if (bootLoading) return <PageSpinner label="Loading document library…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Documents</h1>
          <p className="mt-1 text-sm text-slate-500">
            Evidence library for a case: registry extracts, shareholder registers, trust deeds, and supporting filings.
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
          <select
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
        <EmptyState title="No case selected" description="Pick or create a case to manage its evidence documents." />
      ) : caseLoading ? (
        <PageSpinner label="Loading documents…" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Documents" value={documents.length} tone="indigo" />
            <Stat label="With links" value={documents.filter((d) => d.url).length} tone="indigo" />
            <Stat label="Trust deeds" value={typeCounts.get('trust_deed') ?? 0} tone="green" />
            <Stat label="Registry extracts" value={typeCounts.get('registry_extract') ?? 0} />
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <h2 className="text-base font-semibold text-slate-100">Library</h2>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title, url, content…"
                  className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All types</option>
                  {DOC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {prettyType(t)} ({typeCounts.get(t) ?? 0})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                {selected.size > 0 && (
                  <Button variant="danger" onClick={bulkDelete}>
                    Delete {selected.size}
                  </Button>
                )}
                <Button onClick={openCreate}>Add document</Button>
              </div>
            </CardHeader>
            <CardBody>
              {documents.length === 0 ? (
                <EmptyState
                  title="No documents yet"
                  description="Attach registry extracts, registers, and trust deeds as evidence for this case."
                  action={<Button onClick={openCreate}>Add the first document</Button>}
                />
              ) : filtered.length === 0 ? (
                <EmptyState title="No matching documents" description="Adjust your search or type filter." />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH className="w-10">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleAll}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                          aria-label="Select all"
                        />
                      </TH>
                      <TH>Title</TH>
                      <TH>Type</TH>
                      <TH>Link</TH>
                      <TH>Added</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {filtered.map((d) => (
                      <TR key={d.id}>
                        <TD>
                          <input
                            type="checkbox"
                            checked={selected.has(d.id)}
                            onChange={() => toggle(d.id)}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                            aria-label={`Select ${d.title}`}
                          />
                        </TD>
                        <TD>
                          <button
                            onClick={() => setViewing(d)}
                            className="text-left font-medium text-slate-200 hover:text-indigo-300"
                          >
                            {d.title}
                          </button>
                        </TD>
                        <TD>
                          <Badge tone={TYPE_TONE[d.doc_type ?? 'other'] ?? 'slate'}>{prettyType(d.doc_type)}</Badge>
                        </TD>
                        <TD>
                          {d.url ? (
                            <a
                              href={d.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-300 hover:underline"
                            >
                              Open
                            </a>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </TD>
                        <TD className="text-xs text-slate-500">{fmtDate(d.created_at)}</TD>
                        <TD className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => openEdit(d)}>
                              Edit
                            </Button>
                            <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={() => remove(d)}>
                              Delete
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

      {/* Create / edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Edit document' : 'Add document'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add document'}
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
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Companies House extract — Acme Holdings"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Type</label>
              <select
                value={form.doc_type}
                onChange={(e) => setForm((f) => ({ ...f, doc_type: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {prettyType(t)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Entity ID (optional)
              </label>
              <input
                value={form.entity_id}
                onChange={(e) => setForm((f) => ({ ...f, entity_id: e.target.value }))}
                placeholder="Link to a specific entity"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">URL</label>
            <input
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://…"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Content / notes
            </label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              rows={5}
              placeholder="Extracted text, key findings, or notes about this evidence."
              className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </Modal>

      {/* View modal */}
      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.title}
        className="max-w-2xl"
        footer={
          <Button variant="ghost" onClick={() => setViewing(null)}>
            Close
          </Button>
        }
      >
        {viewing && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TYPE_TONE[viewing.doc_type ?? 'other'] ?? 'slate'}>{prettyType(viewing.doc_type)}</Badge>
              <span className="text-xs text-slate-500">Added {fmtDate(viewing.created_at)}</span>
            </div>
            {viewing.url && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Link</div>
                <a
                  href={viewing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm text-indigo-300 hover:underline"
                >
                  {viewing.url}
                </a>
              </div>
            )}
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Content</div>
              {viewing.content ? (
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
                  {viewing.content}
                </pre>
              ) : (
                <p className="text-sm text-slate-600">No content stored for this document.</p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
