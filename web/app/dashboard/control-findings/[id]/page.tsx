'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'

interface ControlFinding {
  id: string
  case_id: string
  person_entity_id: string | null
  criterion: string
  basis: string | null
  rationale: string | null
  determination: string
  created_at: string
}

interface WorksheetItem {
  id: string
  finding_id: string
  label: string
  value: string | null
  evidence_document_id: string | null
  satisfied: boolean
  created_at: string
}

const DETERMINATIONS = ['control', 'no_control', 'indeterminate']

function determinationTone(d: string): 'green' | 'rose' | 'amber' | 'slate' {
  if (d === 'control') return 'green'
  if (d === 'no_control') return 'rose'
  if (d === 'indeterminate') return 'amber'
  return 'slate'
}

const SUGGESTED_TESTS = [
  'Holds senior managing official position',
  'Can appoint or remove a majority of the board',
  'Holds veto or blocking rights over key decisions',
  'Controls more than 25% of voting rights',
  'Exercises control through a contractual arrangement',
]

export default function WorksheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [finding, setFinding] = useState<ControlFinding | null>(null)
  const [items, setItems] = useState<WorksheetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // finding edit
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ criterion: '', basis: '', rationale: '', determination: 'control' })
  const [savingFinding, setSavingFinding] = useState(false)

  // new item
  const [newLabel, setNewLabel] = useState('')
  const [newValue, setNewValue] = useState('')
  const [addingItem, setAddingItem] = useState(false)
  const [itemError, setItemError] = useState('')

  // per-row busy
  const [busyItem, setBusyItem] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<WorksheetItem | null>(null)
  const [itemForm, setItemForm] = useState({ label: '', value: '' })
  const [savingItem, setSavingItem] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // GET /control-findings/:id returns { finding, items }
      const res = await api.getControlFinding(id)
      const f: ControlFinding = res?.finding ?? res
      setFinding(f)
      if (f) {
        setEditForm({
          criterion: f.criterion ?? '',
          basis: f.basis ?? '',
          rationale: f.rationale ?? '',
          determination: f.determination ?? 'control',
        })
      }
      // prefer the dedicated worksheet-items endpoint to stay fresh
      let list: WorksheetItem[] | undefined = res?.items
      if (!list) list = await api.getWorksheetItems(id)
      setItems(
        (list ?? []).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load worksheet')
    } finally {
      setLoading(false)
    }
  }, [id])

  const reloadItems = useCallback(async () => {
    try {
      const list: WorksheetItem[] = await api.getWorksheetItems(id)
      setItems((list ?? []).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh items')
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const stats = useMemo(() => {
    const satisfied = items.filter((i) => i.satisfied).length
    return {
      total: items.length,
      satisfied,
      unsatisfied: items.length - satisfied,
      ratio: items.length ? Math.round((satisfied / items.length) * 100) : 0,
    }
  }, [items])

  async function saveFinding() {
    if (!finding) return
    setSavingFinding(true)
    try {
      const updated = await api.updateControlFinding(finding.id, {
        criterion: editForm.criterion.trim(),
        basis: editForm.basis.trim() || null,
        rationale: editForm.rationale.trim() || null,
        determination: editForm.determination,
      })
      setFinding({ ...(finding as ControlFinding), ...(updated ?? {}) })
      setEditOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update finding')
    } finally {
      setSavingFinding(false)
    }
  }

  async function quickDetermination(d: string) {
    if (!finding || finding.determination === d) return
    try {
      const updated = await api.updateControlFinding(finding.id, { determination: d })
      setFinding({ ...(finding as ControlFinding), ...(updated ?? { determination: d }) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update determination')
    }
  }

  async function addItem(label?: string) {
    const lbl = (label ?? newLabel).trim()
    if (!lbl) {
      setItemError('Test label is required.')
      return
    }
    setAddingItem(true)
    setItemError('')
    try {
      await api.createWorksheetItem({
        finding_id: id,
        label: lbl,
        value: label ? null : newValue.trim() || null,
        satisfied: false,
      })
      if (!label) {
        setNewLabel('')
        setNewValue('')
      }
      await reloadItems()
    } catch (e) {
      setItemError(e instanceof Error ? e.message : 'Failed to add test')
    } finally {
      setAddingItem(false)
    }
  }

  async function toggleSatisfied(item: WorksheetItem) {
    setBusyItem(item.id)
    try {
      await api.updateWorksheetItem(item.id, { satisfied: !item.satisfied })
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, satisfied: !x.satisfied } : x)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update test')
    } finally {
      setBusyItem(null)
    }
  }

  function openItemEdit(item: WorksheetItem) {
    setEditingItem(item)
    setItemForm({ label: item.label, value: item.value ?? '' })
  }

  async function saveItem() {
    if (!editingItem) return
    setSavingItem(true)
    try {
      await api.updateWorksheetItem(editingItem.id, {
        label: itemForm.label.trim(),
        value: itemForm.value.trim() || null,
      })
      setItems((prev) =>
        prev.map((x) =>
          x.id === editingItem.id ? { ...x, label: itemForm.label.trim(), value: itemForm.value.trim() || null } : x,
        ),
      )
      setEditingItem(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save test')
    } finally {
      setSavingItem(false)
    }
  }

  async function deleteItem(item: WorksheetItem) {
    if (!confirm(`Delete worksheet test "${item.label}"?`)) return
    setBusyItem(item.id)
    try {
      await api.deleteWorksheetItem(item.id)
      setItems((prev) => prev.filter((x) => x.id !== item.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete test')
    } finally {
      setBusyItem(null)
    }
  }

  if (loading) return <PageSpinner label="Loading worksheet..." />

  if (!finding) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/control-findings" className="text-sm text-indigo-300 hover:text-indigo-200">
          ← Back to control findings
        </Link>
        <EmptyState title="Finding not found" description={error || 'This control finding may have been deleted.'} />
      </div>
    )
  }

  const suggestionsToShow = SUGGESTED_TESTS.filter(
    (s) => !items.some((i) => i.label.toLowerCase() === s.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/control-findings" className="text-sm text-indigo-300 hover:text-indigo-200">
          ← Back to control findings
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* finding header */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-slate-100">{finding.criterion}</h1>
                <Badge tone={determinationTone(finding.determination)}>{finding.determination.replace('_', ' ')}</Badge>
              </div>
              {finding.basis && <p className="mt-1 text-sm text-slate-400">Basis: {finding.basis}</p>}
              {finding.rationale && <p className="mt-2 max-w-2xl text-sm text-slate-400">{finding.rationale}</p>}
            </div>
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              Edit finding
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Determination:</span>
            {DETERMINATIONS.map((d) => (
              <button
                key={d}
                onClick={() => quickDetermination(d)}
                className={`rounded-lg border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  finding.determination === d
                    ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:text-slate-200'
                }`}
              >
                {d.replace('_', ' ')}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* worksheet progress */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Tests" value={stats.total} />
        <Stat label="Satisfied" value={stats.satisfied} tone="green" />
        <Stat label="Unsatisfied" value={stats.unsatisfied} tone="amber" />
        <Stat label="Completion" value={`${stats.ratio}%`} tone="indigo" />
      </div>

      {/* progress bar */}
      <Card>
        <CardBody>
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
            <span>Control-test completion</span>
            <span className="tabular-nums">
              {stats.satisfied}/{stats.total}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-400 transition-all"
              style={{ width: `${stats.ratio}%` }}
            />
          </div>
        </CardBody>
      </Card>

      {/* add test */}
      <Card>
        <CardHeader className="text-sm font-semibold text-slate-100">Add control test</CardHeader>
        <CardBody className="space-y-3">
          {itemError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {itemError}
            </div>
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
              placeholder="Test / criterion label"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
            />
            <input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
              placeholder="Observed value / note (optional)"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
            />
            <Button onClick={() => addItem()} disabled={addingItem}>
              {addingItem ? 'Adding...' : 'Add test'}
            </Button>
          </div>
          {suggestionsToShow.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-xs text-slate-500">Quick add:</span>
              {suggestionsToShow.map((s) => (
                <button
                  key={s}
                  onClick={() => addItem(s)}
                  disabled={addingItem}
                  className="rounded-full border border-slate-700 bg-slate-800/50 px-2.5 py-0.5 text-xs text-slate-400 hover:border-indigo-500/40 hover:text-indigo-300 disabled:opacity-50"
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* worksheet items */}
      <Card>
        <CardHeader className="text-sm font-semibold text-slate-100">Control-test worksheet</CardHeader>
        {items.length === 0 ? (
          <CardBody>
            <EmptyState
              title="No tests recorded"
              description="Add control tests above to document how this person does or does not exercise substantial control."
            />
          </CardBody>
        ) : (
          <ul className="divide-y divide-slate-800">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-4 px-5 py-4">
                <button
                  onClick={() => toggleSatisfied(item)}
                  disabled={busyItem === item.id}
                  aria-label={item.satisfied ? 'Mark unsatisfied' : 'Mark satisfied'}
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    item.satisfied
                      ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                      : 'border-slate-700 bg-slate-800/50 text-transparent hover:border-indigo-500/40'
                  }`}
                >
                  {busyItem === item.id ? (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-indigo-400" />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium ${item.satisfied ? 'text-slate-100' : 'text-slate-300'}`}>
                    {item.label}
                  </div>
                  {item.value && <div className="mt-0.5 text-sm text-slate-500">{item.value}</div>}
                </div>
                <Badge tone={item.satisfied ? 'green' : 'slate'}>{item.satisfied ? 'Satisfied' : 'Pending'}</Badge>
                <div className="flex gap-1">
                  <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => openItemEdit(item)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2.5 py-1 text-xs text-rose-400 hover:text-rose-300"
                    onClick={() => deleteItem(item)}
                    disabled={busyItem === item.id}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* edit finding modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit control finding"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={savingFinding}>
              Cancel
            </Button>
            <Button onClick={saveFinding} disabled={savingFinding}>
              {savingFinding ? 'Saving...' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Criterion</label>
            <input
              value={editForm.criterion}
              onChange={(e) => setEditForm({ ...editForm, criterion: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Basis</label>
            <input
              value={editForm.basis}
              onChange={(e) => setEditForm({ ...editForm, basis: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Rationale</label>
            <textarea
              value={editForm.rationale}
              onChange={(e) => setEditForm({ ...editForm, rationale: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Determination</label>
            <div className="flex flex-wrap gap-2">
              {DETERMINATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setEditForm({ ...editForm, determination: d })}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                    editForm.determination === d
                      ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300'
                      : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {d.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* edit item modal */}
      <Modal
        open={!!editingItem}
        onClose={() => setEditingItem(null)}
        title="Edit control test"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingItem(null)} disabled={savingItem}>
              Cancel
            </Button>
            <Button onClick={saveItem} disabled={savingItem}>
              {savingItem ? 'Saving...' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Label</label>
            <input
              value={itemForm.label}
              onChange={(e) => setItemForm({ ...itemForm, label: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Observed value / note
            </label>
            <textarea
              value={itemForm.value}
              onChange={(e) => setItemForm({ ...itemForm, value: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
