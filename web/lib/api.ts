// Same-origin relative calls to /api/proxy/... — the proxy route injects X-User-Id.
// Each method maps 1:1 to a backend endpoint under /api/v1/...

type Json = Record<string, unknown>

async function req(path: string, init?: RequestInit) {
  const res = await fetch(`/api/proxy/${path}`, init)
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`
    throw new Error(typeof msg === 'string' ? msg : 'Request failed')
  }
  return data
}

const get = (path: string) => req(path)
const post = (path: string, body?: unknown) =>
  req(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
const put = (path: string, body?: unknown) =>
  req(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
const del = (path: string) => req(path, { method: 'DELETE' })

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

const api = {
  // workspaces
  getWorkspaces: () => get('workspaces'),
  getWorkspace: (id: string) => get(`workspaces/${id}`),
  createWorkspace: (body: Json) => post('workspaces', body),
  updateWorkspace: (id: string, body: Json) => put(`workspaces/${id}`, body),
  deleteWorkspace: (id: string) => del(`workspaces/${id}`),

  // members
  getMembers: (workspaceId: string) => get(`members${qs({ workspace_id: workspaceId })}`),
  addMember: (body: Json) => post('members', body),
  updateMember: (id: string, body: Json) => put(`members/${id}`, body),
  removeMember: (id: string) => del(`members/${id}`),

  // cases
  getCases: (workspaceId: string, query?: Record<string, string | undefined>) =>
    get(`cases${qs({ workspace_id: workspaceId, ...(query ?? {}) })}`),
  getCase: (id: string) => get(`cases/${id}`),
  createCase: (body: Json) => post('cases', body),
  updateCase: (id: string, body: Json) => put(`cases/${id}`, body),
  deleteCase: (id: string) => del(`cases/${id}`),

  // entities
  getEntities: (caseId: string) => get(`entities${qs({ case_id: caseId })}`),
  getEntity: (id: string) => get(`entities/${id}`),
  createEntity: (body: Json) => post('entities', body),
  updateEntity: (id: string, body: Json) => put(`entities/${id}`, body),
  deleteEntity: (id: string) => del(`entities/${id}`),

  // edges
  getEdges: (caseId: string) => get(`edges${qs({ case_id: caseId })}`),
  createEdge: (body: Json) => post('edges', body),
  updateEdge: (id: string, body: Json) => put(`edges/${id}`, body),
  deleteEdge: (id: string) => del(`edges/${id}`),

  // control relationships
  getControlRelationships: (caseId: string) => get(`control-relationships${qs({ case_id: caseId })}`),
  createControlRelationship: (body: Json) => post('control-relationships', body),
  updateControlRelationship: (id: string, body: Json) => put(`control-relationships/${id}`, body),
  deleteControlRelationship: (id: string) => del(`control-relationships/${id}`),

  // resolutions
  getResolutions: (caseId: string) => get(`resolutions${qs({ case_id: caseId })}`),
  getResolution: (id: string) => get(`resolutions/${id}`),
  runResolution: (body: Json) => post('resolutions', body),
  deleteResolution: (id: string) => del(`resolutions/${id}`),

  // owners
  getOwners: (resolutionId: string) => get(`owners${qs({ resolution_id: resolutionId })}`),
  getOwner: (id: string) => get(`owners/${id}`),

  // paths
  getPaths: (resolutionId: string) => get(`paths${qs({ resolution_id: resolutionId })}`),
  getOwnerPaths: (ownerId: string) => get(`paths/owner/${ownerId}`),

  // control findings
  getControlFindings: (caseId: string) => get(`control-findings${qs({ case_id: caseId })}`),
  getControlFinding: (id: string) => get(`control-findings/${id}`),
  createControlFinding: (body: Json) => post('control-findings', body),
  updateControlFinding: (id: string, body: Json) => put(`control-findings/${id}`, body),
  deleteControlFinding: (id: string) => del(`control-findings/${id}`),

  // worksheet items
  getWorksheetItems: (findingId: string) => get(`worksheet-items${qs({ finding_id: findingId })}`),
  createWorksheetItem: (body: Json) => post('worksheet-items', body),
  updateWorksheetItem: (id: string, body: Json) => put(`worksheet-items/${id}`, body),
  deleteWorksheetItem: (id: string) => del(`worksheet-items/${id}`),

  // snapshots
  getSnapshots: (caseId: string) => get(`snapshots${qs({ case_id: caseId })}`),
  getSnapshot: (id: string) => get(`snapshots/${id}`),
  createSnapshot: (body: Json) => post('snapshots', body),
  restoreSnapshot: (id: string) => post(`snapshots/${id}/restore`),
  deleteSnapshot: (id: string) => del(`snapshots/${id}`),

  // diffs
  getDiffs: (caseId: string) => get(`diffs${qs({ case_id: caseId })}`),
  getDiff: (id: string) => get(`diffs/${id}`),
  diffSnapshots: (body: Json) => post('diffs/snapshots', body),
  diffResolutions: (body: Json) => post('diffs/resolutions', body),

  // filed owners
  getFiledOwners: (caseId: string) => get(`filed-owners${qs({ case_id: caseId })}`),
  createFiledOwner: (body: Json) => post('filed-owners', body),
  updateFiledOwner: (id: string, body: Json) => put(`filed-owners/${id}`, body),
  deleteFiledOwner: (id: string) => del(`filed-owners/${id}`),

  // discrepancies
  getDiscrepancies: (caseId: string) => get(`discrepancies${qs({ case_id: caseId })}`),
  detectDiscrepancies: (body: Json) => post('discrepancies/detect', body),

  // trusts
  getTrusts: (caseId: string) => get(`trusts${qs({ case_id: caseId })}`),
  getTrustByEntity: (entityId: string) => get(`trusts/entity/${entityId}`),
  createTrust: (body: Json) => post('trusts', body),
  updateTrust: (id: string, body: Json) => put(`trusts/${id}`, body),
  deleteTrust: (id: string) => del(`trusts/${id}`),

  // documents
  getDocuments: (caseId: string) => get(`documents${qs({ case_id: caseId })}`),
  createDocument: (body: Json) => post('documents', body),
  updateDocument: (id: string, body: Json) => put(`documents/${id}`, body),
  deleteDocument: (id: string) => del(`documents/${id}`),

  // notes
  getNotes: (caseId: string) => get(`notes${qs({ case_id: caseId })}`),
  createNote: (body: Json) => post('notes', body),
  deleteNote: (id: string) => del(`notes/${id}`),

  // audit log
  getAuditLog: (workspaceId: string) => get(`audit-log${qs({ workspace_id: workspaceId })}`),

  // exports
  getExports: (caseId: string) => get(`exports${qs({ case_id: caseId })}`),
  getExport: (id: string) => get(`exports/${id}`),
  exportRoster: (body: Json) => post('exports/roster', body),
  exportDiagram: (body: Json) => post('exports/diagram', body),

  // tags
  getTags: (workspaceId: string) => get(`tags${qs({ workspace_id: workspaceId })}`),
  createTag: (body: Json) => post('tags', body),
  deleteTag: (id: string) => del(`tags/${id}`),
  assignTag: (body: Json) => post('tags/assign', body),
  unassignTag: (body: Json) => post('tags/unassign', body),

  // seed
  getSeedScenarios: () => get('seed/scenarios'),
  applySeedScenario: (body: Json) => post('seed/apply', body),

  // dashboard
  getDashboard: (workspaceId: string) => get(`dashboard${qs({ workspace_id: workspaceId })}`),

  // billing
  getBillingPlan: () => get('billing/plan'),
  createCheckout: () => post('billing/checkout'),
  createPortal: () => post('billing/portal'),
}

export default api
