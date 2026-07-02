'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'

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

interface Edge {
  id: string
  case_id: string
  owner_entity_id: string
  owned_entity_id: string
  percentage: number
  edge_type?: string | null
  notes?: string | null
}

interface Warning {
  level: 'error' | 'warn'
  message: string
}

const ENTITY_TYPES = ['individual', 'company', 'trust', 'partnership', 'foundation', 'nominee', 'fund', 'other']
const EDGE_TYPES = ['equity', 'voting', 'beneficial', 'nominee', 'options']

const blankEntity = {
  name: '',
  entity_type: 'company',
  jurisdiction: '',
  registration_number: '',
  is_natural_person: false,
  is_target: false,
}

const blankEdge = {
  owner_entity_id: '',
  owned_entity_id: '',
  percentage: '' as string | number,
  edge_type: 'equity',
  notes: '',
}

export default function CaseGraphPage() {
  const params = useParams<{ id: string }>()
  const caseId = params.id

  const [entities, setEntities] = useState<Entity[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'canvas' | 'entities' | 'edges'>('canvas')

  const [entityModal, setEntityModal] = useState(false)
  const [editEntity, setEditEntity] = useState<Entity | null>(null)
  const [entityForm, setEntityForm] = useState({ ...blankEntity })

  const [edgeModal, setEdgeModal] = useState(false)
  const [editEdge, setEditEdge] = useState<Edge | null>(null)
  const [edgeForm, setEdgeForm] = useState({ ...blankEdge })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ents, eds] = await Promise.all([api.getEntities(caseId), api.getEdges(caseId)])
      setEntities(Array.isArray(ents) ? ents : [])
      setEdges(Array.isArray(eds) ? eds : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load graph')
    } finally {
      setLoading(false)
    }
  }, [caseId])

  useEffect(() => {
    void load()
  }, [load])

  const entityById = useMemo(() => {
    const m = new Map<string, Entity>()
    for (const e of entities) m.set(e.id, e)
    return m
  }, [entities])

  // Layered layout: target at bottom, owners stacked above by BFS depth from target.
  const layers = useMemo(() => {
    const target = entities.find((e) => e.is_target) || entities[0]
    const depth = new Map<string, number>()
    if (target) {
      depth.set(target.id, 0)
      // walk up the ownership chain (owners of nodes already placed)
      const incoming = new Map<string, string[]>() // owned -> owners
      for (const ed of edges) {
        const arr = incoming.get(ed.owned_entity_id) || []
        arr.push(ed.owner_entity_id)
        incoming.set(ed.owned_entity_id, arr)
      }
      const queue = [target.id]
      let guard = 0
      while (queue.length && guard < 10000) {
        guard++
        const cur = queue.shift() as string
        const d = depth.get(cur) ?? 0
        for (const owner of incoming.get(cur) || []) {
          const nd = d + 1
          if (!depth.has(owner) || nd > (depth.get(owner) as number)) {
            depth.set(owner, nd)
            queue.push(owner)
          }
        }
      }
    }
    // unplaced entities default to top layer
    const maxD = Math.max(0, ...Array.from(depth.values()))
    for (const e of entities) if (!depth.has(e.id)) depth.set(e.id, maxD + 1)
    const byLayer = new Map<number, Entity[]>()
    for (const e of entities) {
      const d = depth.get(e.id) ?? 0
      const arr = byLayer.get(d) || []
      arr.push(e)
      byLayer.set(d, arr)
    }
    const ordered = Array.from(byLayer.keys()).sort((a, b) => b - a) // top = highest depth
    return ordered.map((d) => ({ depth: d, nodes: (byLayer.get(d) || []).sort((a, b) => a.name.localeCompare(b.name)) }))
  }, [entities, edges])

  // Node coordinates for the SVG canvas.
  const COL_W = 200
  const ROW_H = 110
  const NODE_W = 168
  const NODE_H = 60
  const positions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>()
    layers.forEach((layer, rowIdx) => {
      const count = layer.nodes.length
      layer.nodes.forEach((n, colIdx) => {
        const x = colIdx * COL_W + (NODE_W / 2) + 24
        const y = rowIdx * ROW_H + 24
        pos.set(n.id, { x, y })
        void count
      })
    })
    return pos
  }, [layers])

  const canvasWidth = useMemo(() => {
    const maxCols = Math.max(1, ...layers.map((l) => l.nodes.length))
    return maxCols * COL_W + 48
  }, [layers])
  const canvasHeight = layers.length * ROW_H + 48

  // Validation warnings.
  const warnings = useMemo<Warning[]>(() => {
    const out: Warning[] = []
    // self edges
    for (const ed of edges) {
      if (ed.owner_entity_id === ed.owned_entity_id) {
        out.push({ level: 'error', message: `Self-ownership edge on ${entityById.get(ed.owner_entity_id)?.name ?? 'entity'}` })
      }
      if (ed.percentage < 0 || ed.percentage > 100) {
        out.push({ level: 'error', message: `Edge percentage out of range (${ed.percentage}%)` })
      }
      if (!entityById.has(ed.owner_entity_id) || !entityById.has(ed.owned_entity_id)) {
        out.push({ level: 'error', message: 'Edge references a missing entity' })
      }
    }
    // ownership totals > 100 per owned entity
    const totals = new Map<string, number>()
    for (const ed of edges) {
      totals.set(ed.owned_entity_id, (totals.get(ed.owned_entity_id) || 0) + (Number(ed.percentage) || 0))
    }
    for (const [owned, total] of totals) {
      if (total > 100.001) {
        out.push({ level: 'warn', message: `${entityById.get(owned)?.name ?? 'Entity'} has ${total.toFixed(2)}% total declared ownership (>100%)` })
      }
    }
    // cycle detection (directed owner -> owned)
    const adj = new Map<string, string[]>()
    for (const ed of edges) {
      const arr = adj.get(ed.owner_entity_id) || []
      arr.push(ed.owned_entity_id)
      adj.set(ed.owner_entity_id, arr)
    }
    const WHITE = 0, GRAY = 1, BLACK = 2
    const color = new Map<string, number>()
    let hasCycle = false
    const dfs = (u: string) => {
      color.set(u, GRAY)
      for (const v of adj.get(u) || []) {
        const c = color.get(v) ?? WHITE
        if (c === GRAY) { hasCycle = true; return }
        if (c === WHITE) dfs(v)
      }
      color.set(u, BLACK)
    }
    for (const e of entities) if ((color.get(e.id) ?? WHITE) === WHITE) dfs(e.id)
    if (hasCycle) out.push({ level: 'error', message: 'Circular ownership detected in the graph' })
    // no target
    if (entities.length > 0 && !entities.some((e) => e.is_target)) {
      out.push({ level: 'warn', message: 'No target entity is flagged on this case' })
    }
    // orphan natural persons with no outgoing edge
    for (const e of entities) {
      if (e.is_natural_person && !edges.some((ed) => ed.owner_entity_id === e.id)) {
        out.push({ level: 'warn', message: `${e.name} (natural person) has no ownership edge` })
      }
    }
    return out
  }, [edges, entities, entityById])

  const errorCount = warnings.filter((w) => w.level === 'error').length
  const warnCount = warnings.filter((w) => w.level === 'warn').length

  // Entity CRUD
  const openCreateEntity = () => {
    setEditEntity(null)
    setEntityForm({ ...blankEntity })
    setEntityModal(true)
  }
  const openEditEntity = (e: Entity) => {
    setEditEntity(e)
    setEntityForm({
      name: e.name,
      entity_type: e.entity_type || 'company',
      jurisdiction: e.jurisdiction || '',
      registration_number: e.registration_number || '',
      is_natural_person: !!e.is_natural_person,
      is_target: !!e.is_target,
    })
    setEntityModal(true)
  }
  const saveEntity = async () => {
    if (!entityForm.name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const body = {
        case_id: caseId,
        name: entityForm.name.trim(),
        entity_type: entityForm.entity_type,
        jurisdiction: entityForm.jurisdiction || null,
        registration_number: entityForm.registration_number || null,
        is_natural_person: entityForm.is_natural_person,
        is_target: entityForm.is_target,
      }
      if (editEntity) await api.updateEntity(editEntity.id, body)
      else await api.createEntity(body)
      setEntityModal(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save entity')
    } finally {
      setBusy(false)
    }
  }
  const removeEntity = async (id: string) => {
    if (!confirm('Delete this entity? Edges referencing it may also be removed.')) return
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

  // Edge CRUD
  const openCreateEdge = () => {
    setEditEdge(null)
    setEdgeForm({ ...blankEdge })
    setEdgeModal(true)
  }
  const openEditEdge = (ed: Edge) => {
    setEditEdge(ed)
    setEdgeForm({
      owner_entity_id: ed.owner_entity_id,
      owned_entity_id: ed.owned_entity_id,
      percentage: ed.percentage,
      edge_type: ed.edge_type || 'equity',
      notes: ed.notes || '',
    })
    setEdgeModal(true)
  }
  const saveEdge = async () => {
    const pct = Number(edgeForm.percentage)
    if (!edgeForm.owner_entity_id || !edgeForm.owned_entity_id) return
    if (edgeForm.owner_entity_id === edgeForm.owned_entity_id) {
      setError('Owner and owned entity must differ')
      return
    }
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      setError('Percentage must be between 0 and 100')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const body = {
        case_id: caseId,
        owner_entity_id: edgeForm.owner_entity_id,
        owned_entity_id: edgeForm.owned_entity_id,
        percentage: pct,
        edge_type: edgeForm.edge_type,
        notes: edgeForm.notes || null,
      }
      if (editEdge) await api.updateEdge(editEdge.id, body)
      else await api.createEdge(body)
      setEdgeModal(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save edge')
    } finally {
      setBusy(false)
    }
  }
  const removeEdge = async (id: string) => {
    if (!confirm('Delete this ownership edge?')) return
    setBusy(true)
    try {
      await api.deleteEdge(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete edge')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <PageSpinner label="Loading ownership graph..." />

  const input =
    'w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:border-indigo-500 focus:outline-none'
  const labelCls = 'mb-1 block text-xs font-medium text-stone-400'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/dashboard/cases/${caseId}`} className="text-xs text-indigo-400 hover:text-indigo-300">
            &larr; Back to case
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-100">Ownership Graph</h1>
          <p className="text-sm text-stone-500">Layered beneficial-ownership editor with live validation.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={openCreateEntity}>+ Entity</Button>
          <Button onClick={openCreateEdge} disabled={entities.length < 2}>+ Edge</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Entities" value={entities.length} tone="indigo" />
        <Stat label="Edges" value={edges.length} tone="default" />
        <Stat label="Errors" value={errorCount} tone={errorCount ? 'rose' : 'green'} />
        <Stat label="Warnings" value={warnCount} tone={warnCount ? 'amber' : 'green'} />
      </div>

      {/* Validation panel */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-200">Validation</h2>
          {warnings.length === 0 ? (
            <Badge tone="green">All checks pass</Badge>
          ) : (
            <div className="flex gap-2">
              {errorCount > 0 && <Badge tone="rose">{errorCount} error{errorCount > 1 ? 's' : ''}</Badge>}
              {warnCount > 0 && <Badge tone="amber">{warnCount} warning{warnCount > 1 ? 's' : ''}</Badge>}
            </div>
          )}
        </CardHeader>
        <CardBody>
          {warnings.length === 0 ? (
            <p className="text-sm text-stone-500">No structural issues found in the current graph.</p>
          ) : (
            <ul className="space-y-1.5">
              {warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className={w.level === 'error' ? 'text-rose-400' : 'text-amber-400'}>
                    {w.level === 'error' ? '✖' : '⚠'}
                  </span>
                  <span className="text-stone-300">{w.message}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-stone-800">
        {(['canvas', 'entities', 'edges'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t ? 'border-b-2 border-indigo-500 text-indigo-300' : 'text-stone-500 hover:text-stone-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'canvas' && (
        <Card>
          <CardBody>
            {entities.length === 0 ? (
              <EmptyState
                title="No entities yet"
                description="Add entities and ownership edges to render the layered tree."
                action={<Button onClick={openCreateEntity}>Add first entity</Button>}
              />
            ) : (
              <div className="overflow-x-auto">
                <svg
                  width={Math.max(canvasWidth, 320)}
                  height={canvasHeight}
                  className="min-w-full"
                  style={{ background: 'transparent' }}
                >
                  <defs>
                    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" />
                    </marker>
                  </defs>
                  {edges.map((ed) => {
                    const a = positions.get(ed.owner_entity_id)
                    const b = positions.get(ed.owned_entity_id)
                    if (!a || !b) return null
                    const x1 = a.x
                    const y1 = a.y + NODE_H / 2
                    const x2 = b.x
                    const y2 = b.y - NODE_H / 2
                    const midY = (y1 + y2) / 2
                    const bad = ed.owner_entity_id === ed.owned_entity_id || ed.percentage > 100
                    return (
                      <g key={ed.id}>
                        <path
                          d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                          fill="none"
                          stroke={bad ? '#f43f5e' : '#6366f1'}
                          strokeWidth={1.5}
                          markerEnd="url(#arrow)"
                          opacity={0.7}
                        />
                        <rect x={(x1 + x2) / 2 - 22} y={midY - 9} width={44} height={16} rx={4} fill="#1e293b" />
                        <text x={(x1 + x2) / 2} y={midY + 3} textAnchor="middle" fontSize="10" fill="#cbd5e1">
                          {ed.percentage}%
                        </text>
                      </g>
                    )
                  })}
                  {layers.map((layer) =>
                    layer.nodes.map((n) => {
                      const p = positions.get(n.id)
                      if (!p) return null
                      const fill = n.is_target ? '#3730a3' : n.is_natural_person ? '#0f766e' : '#1e293b'
                      const stroke = n.is_target ? '#818cf8' : n.is_natural_person ? '#2dd4bf' : '#334155'
                      return (
                        <g key={n.id} style={{ cursor: 'pointer' }} onClick={() => openEditEntity(n)}>
                          <rect
                            x={p.x - NODE_W / 2}
                            y={p.y - NODE_H / 2}
                            width={NODE_W}
                            height={NODE_H}
                            rx={10}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={1.5}
                          />
                          <text x={p.x} y={p.y - 6} textAnchor="middle" fontSize="12" fontWeight="600" fill="#f1f5f9">
                            {n.name.length > 22 ? `${n.name.slice(0, 21)}…` : n.name}
                          </text>
                          <text x={p.x} y={p.y + 12} textAnchor="middle" fontSize="10" fill="#94a3b8">
                            {(n.entity_type || 'entity')}{n.jurisdiction ? ` · ${n.jurisdiction}` : ''}
                          </text>
                        </g>
                      )
                    }),
                  )}
                </svg>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-stone-500">
                  <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-indigo-900 ring-1 ring-indigo-400" /> Target</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-teal-800 ring-1 ring-teal-400" /> Natural person</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-stone-800 ring-1 ring-stone-600" /> Legal entity</span>
                  <span>Click a node to edit. Layers are ordered owners (top) to target (bottom).</span>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {tab === 'entities' && (
        <Card>
          {entities.length === 0 ? (
            <CardBody>
              <EmptyState title="No entities" description="Add the first entity to this case." action={<Button onClick={openCreateEntity}>Add entity</Button>} />
            </CardBody>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Type</TH>
                  <TH>Jurisdiction</TH>
                  <TH>Reg. No.</TH>
                  <TH>Flags</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {entities.map((e) => (
                  <TR key={e.id}>
                    <TD className="font-medium text-stone-100">{e.name}</TD>
                    <TD>{e.entity_type || '—'}</TD>
                    <TD>{e.jurisdiction || '—'}</TD>
                    <TD>{e.registration_number || '—'}</TD>
                    <TD>
                      <div className="flex gap-1">
                        {e.is_target && <Badge tone="indigo">Target</Badge>}
                        {e.is_natural_person && <Badge tone="green">Person</Badge>}
                      </div>
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" className="px-2 py-1" onClick={() => openEditEntity(e)}>Edit</Button>
                        <Button variant="ghost" className="px-2 py-1 text-rose-400 hover:text-rose-300" onClick={() => removeEntity(e.id)}>Delete</Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'edges' && (
        <Card>
          {edges.length === 0 ? (
            <CardBody>
              <EmptyState
                title="No ownership edges"
                description="Connect two entities with an ownership percentage."
                action={<Button onClick={openCreateEdge} disabled={entities.length < 2}>Add edge</Button>}
              />
            </CardBody>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Owner</TH>
                  <TH>Owned</TH>
                  <TH className="text-right">%</TH>
                  <TH>Type</TH>
                  <TH>Notes</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {edges.map((ed) => {
                  const bad = ed.percentage > 100 || ed.owner_entity_id === ed.owned_entity_id
                  return (
                    <TR key={ed.id}>
                      <TD className="font-medium text-stone-100">{entityById.get(ed.owner_entity_id)?.name ?? '—'}</TD>
                      <TD>{entityById.get(ed.owned_entity_id)?.name ?? '—'}</TD>
                      <TD className={`text-right tabular-nums ${bad ? 'text-rose-300' : ''}`}>{ed.percentage}%</TD>
                      <TD>{ed.edge_type || 'equity'}</TD>
                      <TD className="max-w-[16rem] truncate text-stone-500">{ed.notes || '—'}</TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" className="px-2 py-1" onClick={() => openEditEdge(ed)}>Edit</Button>
                          <Button variant="ghost" className="px-2 py-1 text-rose-400 hover:text-rose-300" onClick={() => removeEdge(ed.id)}>Delete</Button>
                        </div>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {/* Entity Modal */}
      <Modal
        open={entityModal}
        onClose={() => setEntityModal(false)}
        title={editEntity ? 'Edit entity' : 'New entity'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEntityModal(false)}>Cancel</Button>
            <Button onClick={saveEntity} disabled={busy || !entityForm.name.trim()}>{busy ? 'Saving...' : 'Save'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Name</label>
            <input className={input} value={entityForm.name} onChange={(e) => setEntityForm({ ...entityForm, name: e.target.value })} placeholder="Acme Holdings Ltd" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <select className={input} value={entityForm.entity_type} onChange={(e) => setEntityForm({ ...entityForm, entity_type: e.target.value })}>
                {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Jurisdiction</label>
              <input className={input} value={entityForm.jurisdiction} onChange={(e) => setEntityForm({ ...entityForm, jurisdiction: e.target.value })} placeholder="GB" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Registration number</label>
            <input className={input} value={entityForm.registration_number} onChange={(e) => setEntityForm({ ...entityForm, registration_number: e.target.value })} placeholder="optional" />
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-stone-300">
              <input type="checkbox" checked={entityForm.is_natural_person} onChange={(e) => setEntityForm({ ...entityForm, is_natural_person: e.target.checked })} className="accent-indigo-500" />
              Natural person
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-300">
              <input type="checkbox" checked={entityForm.is_target} onChange={(e) => setEntityForm({ ...entityForm, is_target: e.target.checked })} className="accent-indigo-500" />
              Target entity
            </label>
          </div>
        </div>
      </Modal>

      {/* Edge Modal */}
      <Modal
        open={edgeModal}
        onClose={() => setEdgeModal(false)}
        title={editEdge ? 'Edit edge' : 'New ownership edge'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdgeModal(false)}>Cancel</Button>
            <Button onClick={saveEdge} disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Owner</label>
              <select className={input} value={edgeForm.owner_entity_id} onChange={(e) => setEdgeForm({ ...edgeForm, owner_entity_id: e.target.value })}>
                <option value="">Select...</option>
                {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Owned</label>
              <select className={input} value={edgeForm.owned_entity_id} onChange={(e) => setEdgeForm({ ...edgeForm, owned_entity_id: e.target.value })}>
                <option value="">Select...</option>
                {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Percentage</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                className={input}
                value={edgeForm.percentage}
                onChange={(e) => setEdgeForm({ ...edgeForm, percentage: e.target.value })}
                placeholder="0 - 100"
              />
            </div>
            <div>
              <label className={labelCls}>Edge type</label>
              <select className={input} value={edgeForm.edge_type} onChange={(e) => setEdgeForm({ ...edgeForm, edge_type: e.target.value })}>
                {EDGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea className={input} rows={2} value={edgeForm.notes} onChange={(e) => setEdgeForm({ ...edgeForm, notes: e.target.value })} placeholder="optional" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
