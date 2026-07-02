'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Workspace {
  id: string
  name: string
  default_threshold?: number
}

interface Tag {
  id: string
  name: string
  color?: string
}

interface Case {
  id: string
  workspace_id: string
  name: string
  status?: string
  assignee_id?: string | null
  threshold?: number
  description?: string | null
  target_entity_id?: string | null
  tags?: Tag[]
  tag_ids?: string[]
  created_at?: string
  updated_at?: string
}

const WS_KEY = 'ubo.active_workspace'

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

function caseTagIds(c: Case): string[] {
  if (Array.isArray(c.tag_ids)) return c.tag_ids
  if (Array.isArray(c.tags)) return c.tags.map((t) => t.id)
  return []
}

export default function CasesPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWs, setActiveWs] = useState<string>('')
  const [cases, setCases] = useState<Case[]>([])
  const [tags, setTags] = useState<Tag[]>([])

  // filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')

  // create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newThreshold, setNewThreshold] = useState('25')
  const [newStatus, setNewStatus] = useState('draft')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)

  // row actions
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [tagBusy, setTagBusy] = useState(false)

  // Load workspaces.
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

  const reload = async (wsId: string) => {
    setError(null)
    const [cs, tg] = await Promise.all([api.getCases(wsId), api.getTags(wsId)])
    setCases(Array.isArray(cs) ? (cs as Case[]) : [])
    setTags(Array.isArray(tg) ? (tg as Tag[]) : [])
  }

  // Load cases + tags for active workspace.
  useEffect(() => {
    if (!activeWs) return
    let cancelled = false
    setLoading(true)
    if (typeof window !== 'undefined') window.localStorage.setItem(WS_KEY, activeWs)
    ;(async () => {
      try {
        await reload(activeWs)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load cases')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeWs])

  const wsDefaultThreshold = useMemo(
    () => workspaces.find((w) => w.id === activeWs)?.default_threshold ?? 25,
    [workspaces, activeWs],
  )

  const assignees = useMemo(() => {
    const set = new Set<string>()
    cases.forEach((c) => {
      if (c.assignee_id) set.add(c.assignee_id)
    })
    return Array.from(set)
  }, [cases])

  const filtered = useMemo(() => {
    return cases.filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
      if (statusFilter && (c.status ?? 'draft') !== statusFilter) return false
      if (assigneeFilter) {
        if (assigneeFilter === '__unassigned__') {
          if (c.assignee_id) return false
        } else if (c.assignee_id !== assigneeFilter) return false
      }
      if (tagFilter && !caseTagIds(c).includes(tagFilter)) return false
      return true
    })
  }, [cases, search, statusFilter, assigneeFilter, tagFilter])

  const openCreate = () => {
    setNewName('')
    setNewDesc('')
    setNewThreshold(String(wsDefaultThreshold))
    setNewStatus('draft')
    setCreateErr(null)
    setCreateOpen(true)
  }

  const submitCreate = async () => {
    if (!newName.trim()) {
      setCreateErr('Case name is required')
      return
    }
    setCreating(true)
    setCreateErr(null)
    try {
      const created = (await api.createCase({
        workspace_id: activeWs,
        name: newName.trim(),
        description: newDesc.trim() || null,
        threshold: Number(newThreshold) || wsDefaultThreshold,
        status: newStatus,
      })) as Case
      setCases((prev) => [created, ...prev])
      setCreateOpen(false)
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'Failed to create case')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (c: Case) => {
    if (!window.confirm(`Delete case "${c.name}"? This cannot be undone.`)) return
    setDeletingId(c.id)
    try {
      await api.deleteCase(c.id)
      setCases((prev) => prev.filter((x) => x.id !== c.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete case')
    } finally {
      setDeletingId(null)
    }
  }

  const toggleTag = async (c: Case, tagId: string) => {
    const has = caseTagIds(c).includes(tagId)
    setTagBusy(true)
    try {
      if (has) {
        await api.unassignTag({ case_id: c.id, tag_id: tagId })
      } else {
        await api.assignTag({ case_id: c.id, tag_id: tagId })
      }
      setCases((prev) =>
        prev.map((x) => {
          if (x.id !== c.id) return x
          const ids = new Set(caseTagIds(x))
          if (has) ids.delete(tagId)
          else ids.add(tagId)
          const tagObjs = tags.filter((t) => ids.has(t.id))
          return { ...x, tag_ids: Array.from(ids), tags: tagObjs }
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update tag')
    } finally {
      setTagBusy(false)
    }
  }

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('')
    setAssigneeFilter('')
    setTagFilter('')
  }

  const hasFilters = !!(search || statusFilter || assigneeFilter || tagFilter)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-100">Cases</h1>
          <p className="mt-1 text-sm text-stone-500">Beneficial-ownership investigations in this workspace.</p>
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
          <Button variant="primary" onClick={openCreate} disabled={!activeWs}>
            New case
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <PageSpinner label="Loading cases..." />
      ) : workspaces.length === 0 ? (
        <EmptyState
          title="No workspaces yet"
          description="Create a workspace in settings before adding cases."
          action={
            <Link href="/dashboard/settings">
              <Button>Go to settings</Button>
            </Link>
          }
        />
      ) : (
        <>
          <Card>
            <CardBody className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
              <div className="relative flex-1 min-w-[200px]">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search cases by name..."
                  className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">All assignees</option>
                <option value="__unassigned__">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
                disabled={tags.length === 0}
              >
                <option value="">All tags</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {hasFilters && (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear
                </Button>
              )}
              <span className="text-xs text-stone-500 lg:ml-auto">
                {filtered.length} of {cases.length}
              </span>
            </CardBody>
          </Card>

          {cases.length === 0 ? (
            <EmptyState
              title="No cases yet"
              description="Create your first beneficial-ownership case to start mapping entities and ownership edges."
              action={<Button onClick={openCreate}>Create case</Button>}
            />
          ) : filtered.length === 0 ? (
            <EmptyState title="No matches" description="No cases match the current filters." action={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>} />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Case</TH>
                  <TH>Status</TH>
                  <TH>Threshold</TH>
                  <TH>Assignee</TH>
                  <TH>Tags</TH>
                  <TH>Updated</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((c) => {
                  const ids = caseTagIds(c)
                  return (
                    <TR key={c.id}>
                      <TD>
                        <Link
                          href={`/dashboard/cases/${c.id}`}
                          className="font-medium text-stone-100 hover:text-indigo-300"
                        >
                          {c.name}
                        </Link>
                        {c.description && (
                          <div className="mt-0.5 max-w-xs truncate text-xs text-stone-500">{c.description}</div>
                        )}
                      </TD>
                      <TD>
                        <Badge tone={statusTone(c.status)}>{c.status ?? 'draft'}</Badge>
                      </TD>
                      <TD className="tabular-nums">{fmtPct(c.threshold)}</TD>
                      <TD className="text-stone-400">{c.assignee_id || <span className="text-stone-600">—</span>}</TD>
                      <TD>
                        <div className="flex flex-wrap items-center gap-1">
                          {tags.length === 0 ? (
                            <span className="text-xs text-stone-600">—</span>
                          ) : (
                            tags.map((t) => {
                              const on = ids.includes(t.id)
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  disabled={tagBusy}
                                  onClick={() => toggleTag(c, t.id)}
                                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                                    on
                                      ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300'
                                      : 'border-stone-700 bg-stone-800/40 text-stone-500 hover:text-stone-300'
                                  }`}
                                  title={on ? 'Remove tag' : 'Add tag'}
                                >
                                  {t.name}
                                </button>
                              )
                            })
                          )}
                        </div>
                      </TD>
                      <TD className="text-stone-500">{fmtDate(c.updated_at ?? c.created_at)}</TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/dashboard/cases/${c.id}`}>
                            <Button variant="ghost">Open</Button>
                          </Link>
                          <Button
                            variant="danger"
                            onClick={() => handleDelete(c)}
                            disabled={deletingId === c.id}
                          >
                            {deletingId === c.id ? 'Deleting...' : 'Delete'}
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => (creating ? null : setCreateOpen(false))}
        title="Create case"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitCreate} disabled={creating}>
              {creating ? <Spinner /> : 'Create case'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {createErr && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {createErr}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              placeholder="Acme Holdings UBO review"
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
              Description
            </label>
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={3}
              placeholder="Optional context for this investigation"
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                Threshold (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={newThreshold}
                onChange={(e) => setNewThreshold(e.target.value)}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Status</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-indigo-500 focus:outline-none"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
