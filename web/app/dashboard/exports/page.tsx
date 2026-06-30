'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'

interface Workspace {
  id: string
  name: string
}
interface Case {
  id: string
  name: string
  status?: string
}
interface Resolution {
  id: string
  threshold?: number
  qualifying_count?: number
  control_count?: number
  status?: string
  created_at?: string
}
interface ExportRow {
  id: string
  case_id: string
  resolution_id?: string | null
  export_type: string
  format: string
  content?: string | null
  created_at?: string
}

type RosterFormat = 'json' | 'csv'
type DiagramFormat = 'dot' | 'svg' | 'json'

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
  return d.toLocaleString()
}

function typeTone(t: string): 'indigo' | 'sky' | 'slate' {
  if (t.includes('roster')) return 'indigo'
  if (t.includes('diagram')) return 'sky'
  return 'slate'
}

function contentMime(format: string): string {
  switch (format) {
    case 'csv':
      return 'text/csv'
    case 'svg':
      return 'image/svg+xml'
    case 'dot':
      return 'text/vnd.graphviz'
    default:
      return 'application/json'
  }
}

function download(filename: string, content: string, format: string) {
  const blob = new Blob([content], { type: contentMime(format) })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function ExportsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [cases, setCases] = useState<Case[]>([])
  const [caseId, setCaseId] = useState('')

  const [resolutions, setResolutions] = useState<Resolution[]>([])
  const [exports, setExports] = useState<ExportRow[]>([])

  const [rosterResolutionId, setRosterResolutionId] = useState('')
  const [rosterFormat, setRosterFormat] = useState<RosterFormat>('json')
  const [diagramFormat, setDiagramFormat] = useState<DiagramFormat>('dot')

  const [selected, setSelected] = useState<ExportRow | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [bootLoading, setBootLoading] = useState(true)
  const [caseLoading, setCaseLoading] = useState(false)
  const [genRoster, setGenRoster] = useState(false)
  const [genDiagram, setGenDiagram] = useState(false)
  const [error, setError] = useState('')

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
      const [res, exp] = await Promise.all([api.getResolutions(cid), api.getExports(cid)])
      const resList = asArray<Resolution>(res)
      setResolutions(resList)
      setExports(asArray<ExportRow>(exp))
      setRosterResolutionId((prev) => (resList.some((r) => r.id === prev) ? prev : resList[0]?.id ?? ''))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load case data')
    } finally {
      setCaseLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!caseId) {
      setResolutions([])
      setExports([])
      setSelected(null)
      return
    }
    setSelected(null)
    loadCaseData(caseId)
  }, [caseId, loadCaseData])

  async function refreshExports() {
    if (!caseId) return
    try {
      setExports(asArray<ExportRow>(await api.getExports(caseId)))
    } catch {
      /* non-fatal */
    }
  }

  async function generateRoster() {
    if (!caseId || !rosterResolutionId) return
    setGenRoster(true)
    setError('')
    try {
      const created = (await api.exportRoster({
        case_id: caseId,
        resolution_id: rosterResolutionId,
        format: rosterFormat,
      })) as ExportRow
      setSelected(created)
      await refreshExports()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate roster export')
    } finally {
      setGenRoster(false)
    }
  }

  async function generateDiagram() {
    if (!caseId) return
    setGenDiagram(true)
    setError('')
    try {
      const created = (await api.exportDiagram({ case_id: caseId, format: diagramFormat })) as ExportRow
      setSelected(created)
      await refreshExports()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate diagram export')
    } finally {
      setGenDiagram(false)
    }
  }

  async function openExport(id: string) {
    setLoadingDetail(true)
    setError('')
    try {
      const exp = (await api.getExport(id)) as ExportRow
      setSelected(exp)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load export')
    } finally {
      setLoadingDetail(false)
    }
  }

  const counts = useMemo(() => {
    const roster = exports.filter((e) => e.export_type?.includes('roster')).length
    const diagram = exports.filter((e) => e.export_type?.includes('diagram')).length
    return { total: exports.length, roster, diagram }
  }, [exports])

  const selectedIsSvg = selected?.format === 'svg'

  if (bootLoading) return <PageSpinner label="Loading exports workspace…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Exports</h1>
          <p className="mt-1 text-sm text-slate-500">
            Generate beneficial-ownership rosters and ownership-chain diagrams, then download them for filing.
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
        <EmptyState
          title="No case selected"
          description="Create a case and run a resolution before generating exports."
        />
      ) : caseLoading ? (
        <PageSpinner label="Loading case data…" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Total exports" value={counts.total} tone="indigo" />
            <Stat label="Rosters" value={counts.roster} />
            <Stat label="Diagrams" value={counts.diagram} tone="default" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Roster generator */}
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-slate-100">Generate BO roster</h2>
              </CardHeader>
              <CardBody className="space-y-4">
                {resolutions.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No resolutions in this case yet. Run a resolution first to build a beneficial-owner roster.
                  </p>
                ) : (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                        Resolution
                      </label>
                      <select
                        value={rosterResolutionId}
                        onChange={(e) => setRosterResolutionId(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {resolutions.map((r) => (
                          <option key={r.id} value={r.id}>
                            @{r.threshold ?? '?'}% · {r.qualifying_count ?? 0} qualifying · {fmtDate(r.created_at)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                        Format
                      </label>
                      <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
                        {(['json', 'csv'] as RosterFormat[]).map((f) => (
                          <button
                            key={f}
                            onClick={() => setRosterFormat(f)}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium uppercase transition-colors ${
                              rosterFormat === f ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button onClick={generateRoster} disabled={genRoster || !rosterResolutionId}>
                      {genRoster ? 'Generating…' : 'Generate roster'}
                    </Button>
                  </>
                )}
              </CardBody>
            </Card>

            {/* Diagram generator */}
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-slate-100">Generate ownership-chain diagram</h2>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-sm text-slate-500">
                  Renders the current case graph as a layered ownership-chain diagram you can drop into a report.
                </p>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Format</label>
                  <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
                    {(['dot', 'svg', 'json'] as DiagramFormat[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setDiagramFormat(f)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium uppercase transition-colors ${
                          diagramFormat === f ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <Button onClick={generateDiagram} disabled={genDiagram}>
                  {genDiagram ? 'Generating…' : 'Generate diagram'}
                </Button>
              </CardBody>
            </Card>
          </div>

          {/* Selected export preview */}
          {loadingDetail ? (
            <Card>
              <CardBody>
                <Spinner label="Loading export…" />
              </CardBody>
            </Card>
          ) : selected ? (
            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-100">Export preview</h2>
                  <Badge tone={typeTone(selected.export_type)}>{selected.export_type}</Badge>
                  <Badge tone="slate">{selected.format?.toUpperCase()}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{fmtDate(selected.created_at)}</span>
                  <Button
                    variant="secondary"
                    className="px-3 py-1.5 text-xs"
                    disabled={!selected.content}
                    onClick={() =>
                      selected.content &&
                      download(`${selected.export_type}-${selected.id.slice(0, 8)}.${selected.format}`, selected.content, selected.format)
                    }
                  >
                    Download
                  </Button>
                </div>
              </CardHeader>
              <CardBody>
                {!selected.content ? (
                  <EmptyState title="No content" description="This export record has no stored content." />
                ) : selectedIsSvg ? (
                  <div
                    className="overflow-auto rounded-lg border border-slate-800 bg-white p-3"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: selected.content }}
                  />
                ) : (
                  <pre className="max-h-[28rem] overflow-auto rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-slate-300">
                    {selected.content}
                  </pre>
                )}
              </CardBody>
            </Card>
          ) : null}

          {/* Past exports */}
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-slate-100">Past exports</h2>
            </CardHeader>
            <CardBody>
              {exports.length === 0 ? (
                <EmptyState
                  title="No exports yet"
                  description="Generate a roster or diagram above and it will appear here."
                />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Type</TH>
                      <TH>Format</TH>
                      <TH>Resolution</TH>
                      <TH>Created</TH>
                      <TH className="text-right">Action</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {exports.map((e) => (
                      <TR key={e.id}>
                        <TD>
                          <Badge tone={typeTone(e.export_type)}>{e.export_type}</Badge>
                        </TD>
                        <TD className="uppercase text-slate-400">{e.format}</TD>
                        <TD className="font-mono text-xs text-slate-400">
                          {e.resolution_id ? `${e.resolution_id.slice(0, 8)}…` : '—'}
                        </TD>
                        <TD className="text-xs text-slate-500">{fmtDate(e.created_at)}</TD>
                        <TD className="text-right">
                          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => openExport(e.id)}>
                            View
                          </Button>
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
    </div>
  )
}
