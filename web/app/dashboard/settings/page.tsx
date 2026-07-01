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
  owner_id?: string
  default_threshold?: number | null
  created_at?: string
}

interface Member {
  id: string
  workspace_id: string
  user_id: string
  role: string
  created_at?: string
}

interface Tag {
  id: string
  workspace_id: string
  name: string
  color: string | null
  created_at?: string
}

interface Plan {
  id: string
  name: string
  price_cents: number
}

interface Subscription {
  id?: string
  user_id?: string
  plan_id: string
  status: string
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  current_period_end?: string | null
}

interface BillingInfo {
  subscription: Subscription | null
  plan: Plan | null
  stripeEnabled: boolean
}

type Tab = 'workspace' | 'members' | 'tags' | 'billing'

const TABS: { key: Tab; label: string }[] = [
  { key: 'workspace', label: 'Workspace' },
  { key: 'members', label: 'Members' },
  { key: 'tags', label: 'Tags' },
  { key: 'billing', label: 'Billing' },
]

const TAG_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#a855f7', '#64748b']

function roleTone(role: string): 'indigo' | 'sky' | 'slate' {
  if (role === 'owner') return 'indigo'
  if (role === 'admin') return 'sky'
  return 'slate'
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('workspace')

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState<string>('')

  // workspace form
  const [wsName, setWsName] = useState('')
  const [wsThreshold, setWsThreshold] = useState('')
  const [savingWs, setSavingWs] = useState(false)

  // first-workspace creation form (shown when the user has none yet)
  const [newWsName, setNewWsName] = useState('')
  const [creatingWs, setCreatingWs] = useState(false)

  // members
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberModalOpen, setMemberModalOpen] = useState(false)
  const [memberUserId, setMemberUserId] = useState('')
  const [memberRole, setMemberRole] = useState('member')
  const [savingMember, setSavingMember] = useState(false)
  const [memberFormError, setMemberFormError] = useState<string | null>(null)

  // tags
  const [tags, setTags] = useState<Tag[]>([])
  const [tagsLoading, setTagsLoading] = useState(false)
  const [tagName, setTagName] = useState('')
  const [tagColor, setTagColor] = useState(TAG_COLORS[0])
  const [savingTag, setSavingTag] = useState(false)
  const [tagFormError, setTagFormError] = useState<string | null>(null)

  // billing
  const [billing, setBilling] = useState<BillingInfo | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingBusy, setBillingBusy] = useState(false)

  const [busyId, setBusyId] = useState<string | null>(null)

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === workspaceId) || null,
    [workspaces, workspaceId],
  )

  // Bootstrap workspaces
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const ws: Workspace[] = await api.getWorkspaces()
        if (cancelled) return
        setWorkspaces(ws || [])
        if (ws && ws.length > 0) setWorkspaceId(ws[0].id)
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

  // Sync workspace form when active workspace changes
  useEffect(() => {
    if (activeWorkspace) {
      setWsName(activeWorkspace.name || '')
      setWsThreshold(
        activeWorkspace.default_threshold === null || activeWorkspace.default_threshold === undefined
          ? ''
          : String(activeWorkspace.default_threshold),
      )
    }
  }, [activeWorkspace])

  const loadMembers = useCallback(async (wid: string) => {
    if (!wid) return
    try {
      setMembersLoading(true)
      const rows: Member[] = await api.getMembers(wid)
      setMembers(rows || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load members')
    } finally {
      setMembersLoading(false)
    }
  }, [])

  const loadTags = useCallback(async (wid: string) => {
    if (!wid) return
    try {
      setTagsLoading(true)
      const rows: Tag[] = await api.getTags(wid)
      setTags(rows || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tags')
    } finally {
      setTagsLoading(false)
    }
  }, [])

  const loadBilling = useCallback(async () => {
    try {
      setBillingLoading(true)
      const info: BillingInfo = await api.getBillingPlan()
      setBilling(info || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load billing plan')
    } finally {
      setBillingLoading(false)
    }
  }, [])

  // Lazy-load per-tab data
  useEffect(() => {
    if (!workspaceId) return
    if (tab === 'members' && members.length === 0) void loadMembers(workspaceId)
    if (tab === 'tags' && tags.length === 0) void loadTags(workspaceId)
    if (tab === 'billing' && !billing) void loadBilling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, workspaceId])

  // Reload member/tag data when workspace switches
  useEffect(() => {
    if (!workspaceId) return
    setMembers([])
    setTags([])
    if (tab === 'members') void loadMembers(workspaceId)
    if (tab === 'tags') void loadTags(workspaceId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  function flash(msg: string) {
    setNotice(msg)
    setTimeout(() => setNotice(null), 3000)
  }

  async function createFirstWorkspace() {
    if (!newWsName.trim()) {
      setError('Workspace name is required.')
      return
    }
    try {
      setCreatingWs(true)
      setError(null)
      const created: Workspace = await api.createWorkspace({ name: newWsName.trim() })
      setWorkspaces((prev) => [...prev, created])
      setWorkspaceId(created.id)
      setNewWsName('')
      flash('Workspace created.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create workspace')
    } finally {
      setCreatingWs(false)
    }
  }

  async function saveWorkspace() {
    if (!workspaceId) return
    if (!wsName.trim()) {
      setError('Workspace name is required.')
      return
    }
    const threshold = wsThreshold.trim() === '' ? 25 : Number(wsThreshold)
    if (Number.isNaN(threshold) || threshold < 0 || threshold > 100) {
      setError('Default threshold must be between 0 and 100.')
      return
    }
    try {
      setSavingWs(true)
      setError(null)
      const updated: Workspace = await api.updateWorkspace(workspaceId, {
        name: wsName.trim(),
        default_threshold: threshold,
      })
      setWorkspaces((prev) => prev.map((w) => (w.id === workspaceId ? { ...w, ...updated } : w)))
      flash('Workspace settings saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save workspace')
    } finally {
      setSavingWs(false)
    }
  }

  function openAddMember() {
    setMemberUserId('')
    setMemberRole('member')
    setMemberFormError(null)
    setMemberModalOpen(true)
  }

  async function submitMember() {
    if (!memberUserId.trim()) {
      setMemberFormError('User ID is required.')
      return
    }
    try {
      setSavingMember(true)
      setMemberFormError(null)
      await api.addMember({
        workspace_id: workspaceId,
        user_id: memberUserId.trim(),
        role: memberRole,
      })
      setMemberModalOpen(false)
      await loadMembers(workspaceId)
      flash('Member added.')
    } catch (e) {
      setMemberFormError(e instanceof Error ? e.message : 'Failed to add member')
    } finally {
      setSavingMember(false)
    }
  }

  async function changeRole(m: Member, role: string) {
    if (role === m.role) return
    try {
      setBusyId(m.id)
      await api.updateMember(m.id, { role })
      await loadMembers(workspaceId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update member role')
    } finally {
      setBusyId(null)
    }
  }

  async function removeMemberRow(m: Member) {
    if (!confirm(`Remove member "${m.user_id}" from this workspace?`)) return
    try {
      setBusyId(m.id)
      await api.removeMember(m.id)
      await loadMembers(workspaceId)
      flash('Member removed.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove member')
    } finally {
      setBusyId(null)
    }
  }

  async function submitTag() {
    if (!tagName.trim()) {
      setTagFormError('Tag name is required.')
      return
    }
    try {
      setSavingTag(true)
      setTagFormError(null)
      await api.createTag({
        workspace_id: workspaceId,
        name: tagName.trim(),
        color: tagColor,
      })
      setTagName('')
      setTagColor(TAG_COLORS[0])
      await loadTags(workspaceId)
      flash('Tag created.')
    } catch (e) {
      setTagFormError(e instanceof Error ? e.message : 'Failed to create tag')
    } finally {
      setSavingTag(false)
    }
  }

  async function removeTag(t: Tag) {
    if (!confirm(`Delete tag "${t.name}"? It will be removed from all cases.`)) return
    try {
      setBusyId(t.id)
      await api.deleteTag(t.id)
      await loadTags(workspaceId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete tag')
    } finally {
      setBusyId(null)
    }
  }

  async function startCheckout() {
    try {
      setBillingBusy(true)
      setError(null)
      const res: { url?: string } = await api.createCheckout()
      if (res && res.url) {
        window.location.href = res.url
      } else {
        setError('Checkout is not available right now.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Billing is not configured (Stripe disabled).')
    } finally {
      setBillingBusy(false)
    }
  }

  async function openPortal() {
    try {
      setBillingBusy(true)
      setError(null)
      const res: { url?: string } = await api.createPortal()
      if (res && res.url) {
        window.location.href = res.url
      } else {
        setError('Billing portal is not available right now.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Billing is not configured (Stripe disabled).')
    } finally {
      setBillingBusy(false)
    }
  }

  if (loading) return <PageSpinner label="Loading settings..." />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your workspace, members, case tags, and subscription.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </div>
      )}

      {workspaces.length === 0 ? (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-slate-100">Create your first workspace</h2>
            <p className="mt-1 text-xs text-slate-500">
              A workspace holds your cases, entities, and resolved ownership trees.
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Workspace name
              </label>
              <input
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                placeholder="Acme Compliance"
                className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={createFirstWorkspace} disabled={creatingWs}>
                {creatingWs ? 'Creating...' : 'Create workspace'}
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <>
          <Card>
            <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Workspace</label>
              <select
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none sm:w-80"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              {activeWorkspace?.default_threshold != null && (
                <Badge tone="indigo">Default threshold {activeWorkspace.default_threshold}%</Badge>
              )}
            </CardBody>
          </Card>

          {/* Tabs */}
          <div className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  tab === t.key ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'workspace' && (
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-slate-100">Workspace details</h2>
                <p className="mt-1 text-xs text-slate-500">
                  The default threshold seeds new cases. Beneficial owners at or above this percentage qualify.
                </p>
              </CardHeader>
              <CardBody className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Workspace name
                  </label>
                  <input
                    value={wsName}
                    onChange={(e) => setWsName(e.target.value)}
                    className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Default ownership threshold (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={wsThreshold}
                    onChange={(e) => setWsThreshold(e.target.value)}
                    placeholder="25"
                    className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <dl className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-4 text-sm sm:max-w-md">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Owner</dt>
                    <dd className="mt-1 font-mono text-xs text-slate-300">{activeWorkspace?.owner_id || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Workspace ID</dt>
                    <dd className="mt-1 font-mono text-xs text-slate-300">{activeWorkspace?.id || '—'}</dd>
                  </div>
                </dl>
                <div className="flex justify-end">
                  <Button onClick={saveWorkspace} disabled={savingWs}>
                    {savingWs ? 'Saving...' : 'Save changes'}
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {tab === 'members' && (
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-100">Members</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    People who can view and edit cases in this workspace.
                  </p>
                </div>
                <Button onClick={openAddMember}>+ Add Member</Button>
              </CardHeader>
              <CardBody className="p-0">
                {membersLoading ? (
                  <div className="py-12">
                    <Spinner label="Loading members..." />
                  </div>
                ) : members.length === 0 ? (
                  <div className="p-5">
                    <EmptyState
                      title="No members"
                      description="Add teammates by their user ID to collaborate on cases."
                      action={<Button onClick={openAddMember}>+ Add Member</Button>}
                    />
                  </div>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>User</TH>
                        <TH>Role</TH>
                        <TH>Added</TH>
                        <TH className="text-right">Actions</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {members.map((m) => {
                        const isOwner = m.role === 'owner'
                        return (
                          <TR key={m.id}>
                            <TD className="font-mono text-xs text-slate-200">{m.user_id}</TD>
                            <TD>
                              {isOwner ? (
                                <Badge tone={roleTone(m.role)}>owner</Badge>
                              ) : (
                                <select
                                  value={m.role}
                                  disabled={busyId === m.id}
                                  onChange={(e) => changeRole(m, e.target.value)}
                                  className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                                >
                                  <option value="member">member</option>
                                  <option value="admin">admin</option>
                                </select>
                              )}
                            </TD>
                            <TD className="text-slate-400">
                              {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}
                            </TD>
                            <TD className="text-right">
                              {isOwner ? (
                                <span className="text-xs text-slate-600">—</span>
                              ) : (
                                <Button
                                  variant="ghost"
                                  className="px-2 py-1 text-xs text-rose-400 hover:text-rose-300"
                                  disabled={busyId === m.id}
                                  onClick={() => removeMemberRow(m)}
                                >
                                  {busyId === m.id ? '...' : 'Remove'}
                                </Button>
                              )}
                            </TD>
                          </TR>
                        )
                      })}
                    </TBody>
                  </Table>
                )}
              </CardBody>
            </Card>
          )}

          {tab === 'tags' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-slate-100">Create tag</h2>
                  <p className="mt-1 text-xs text-slate-500">Tags help organize and filter cases.</p>
                </CardHeader>
                <CardBody className="space-y-4">
                  {tagFormError && (
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                      {tagFormError}
                    </div>
                  )}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                        Name
                      </label>
                      <input
                        value={tagName}
                        onChange={(e) => setTagName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !savingTag) void submitTag()
                        }}
                        placeholder="e.g. High risk"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                        Color
                      </label>
                      <div className="flex gap-1.5">
                        {TAG_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setTagColor(c)}
                            className={`h-7 w-7 rounded-full border-2 transition-transform ${
                              tagColor === c ? 'scale-110 border-white' : 'border-transparent'
                            }`}
                            style={{ backgroundColor: c }}
                            aria-label={`Color ${c}`}
                          />
                        ))}
                      </div>
                    </div>
                    <Button onClick={submitTag} disabled={savingTag}>
                      {savingTag ? 'Adding...' : 'Add tag'}
                    </Button>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-slate-100">Tags</h2>
                  <span className="text-xs text-slate-500">{tags.length} total</span>
                </CardHeader>
                <CardBody>
                  {tagsLoading ? (
                    <div className="py-8">
                      <Spinner label="Loading tags..." />
                    </div>
                  ) : tags.length === 0 ? (
                    <EmptyState
                      title="No tags"
                      description="Create your first tag above to start organizing cases."
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {tags.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200"
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: t.color || '#64748b' }}
                          />
                          {t.name}
                          <button
                            onClick={() => removeTag(t)}
                            disabled={busyId === t.id}
                            className="ml-1 text-slate-500 hover:text-rose-400 disabled:opacity-50"
                            aria-label={`Delete tag ${t.name}`}
                          >
                            {busyId === t.id ? '...' : '×'}
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          )}

          {tab === 'billing' && (
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-slate-100">Subscription</h2>
                <p className="mt-1 text-xs text-slate-500">Your current plan and billing management.</p>
              </CardHeader>
              <CardBody className="space-y-6">
                {billingLoading ? (
                  <div className="py-8">
                    <Spinner label="Loading billing..." />
                  </div>
                ) : !billing ? (
                  <EmptyState title="Billing unavailable" description="Could not load your subscription." />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                      <Stat
                        label="Current Plan"
                        value={billing.plan?.name || billing.subscription?.plan_id || 'Free'}
                        tone={billing.subscription?.plan_id === 'pro' ? 'indigo' : 'default'}
                      />
                      <Stat
                        label="Status"
                        value={billing.subscription?.status || 'active'}
                        tone={billing.subscription?.status === 'active' ? 'green' : 'amber'}
                      />
                      <Stat
                        label="Price"
                        value={
                          billing.plan
                            ? billing.plan.price_cents === 0
                              ? 'Free'
                              : `$${(billing.plan.price_cents / 100).toFixed(0)}/mo`
                            : '—'
                        }
                      />
                      <Stat
                        label="Renews"
                        value={
                          billing.subscription?.current_period_end
                            ? new Date(billing.subscription.current_period_end).toLocaleDateString()
                            : '—'
                        }
                      />
                    </div>

                    {!billing.stripeEnabled && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                        Stripe is not configured for this deployment. Billing actions are unavailable, but plan
                        records are tracked locally.
                      </div>
                    )}

                    {/* Plan comparison */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div
                        className={`rounded-xl border p-5 ${
                          (billing.subscription?.plan_id || 'free') === 'free'
                            ? 'border-indigo-500/50 bg-indigo-500/5'
                            : 'border-slate-800 bg-slate-950'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-100">Free</h3>
                          {(billing.subscription?.plan_id || 'free') === 'free' && (
                            <Badge tone="indigo">Current</Badge>
                          )}
                        </div>
                        <p className="mt-2 text-2xl font-semibold text-slate-100">
                          $0<span className="text-sm font-normal text-slate-500">/mo</span>
                        </p>
                        <ul className="mt-4 space-y-1.5 text-sm text-slate-400">
                          <li>Single workspace</li>
                          <li>Core ownership resolution</li>
                          <li>Manual snapshots and diffs</li>
                        </ul>
                      </div>

                      <div
                        className={`rounded-xl border p-5 ${
                          billing.subscription?.plan_id === 'pro'
                            ? 'border-indigo-500/50 bg-indigo-500/5'
                            : 'border-slate-800 bg-slate-950'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-100">Pro</h3>
                          {billing.subscription?.plan_id === 'pro' && <Badge tone="indigo">Current</Badge>}
                        </div>
                        <p className="mt-2 text-2xl font-semibold text-slate-100">
                          $
                          {billing.plan && billing.plan.id === 'pro'
                            ? (billing.plan.price_cents / 100).toFixed(0)
                            : '49'}
                          <span className="text-sm font-normal text-slate-500">/mo</span>
                        </p>
                        <ul className="mt-4 space-y-1.5 text-sm text-slate-400">
                          <li>Unlimited workspaces and members</li>
                          <li>Discrepancy detection and exports</li>
                          <li>Full audit trail and trust modeling</li>
                        </ul>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 border-t border-slate-800 pt-4">
                      {billing.subscription?.plan_id !== 'pro' && (
                        <Button onClick={startCheckout} disabled={billingBusy || !billing.stripeEnabled}>
                          {billingBusy ? 'Redirecting...' : 'Upgrade to Pro'}
                        </Button>
                      )}
                      <Button variant="secondary" onClick={openPortal} disabled={billingBusy || !billing.stripeEnabled}>
                        {billingBusy ? 'Opening...' : 'Manage billing'}
                      </Button>
                    </div>
                  </>
                )}
              </CardBody>
            </Card>
          )}
        </>
      )}

      <Modal
        open={memberModalOpen}
        onClose={() => !savingMember && setMemberModalOpen(false)}
        title="Add Member"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMemberModalOpen(false)} disabled={savingMember}>
              Cancel
            </Button>
            <Button onClick={submitMember} disabled={savingMember}>
              {savingMember ? 'Adding...' : 'Add Member'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {memberFormError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {memberFormError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">User ID</label>
            <input
              value={memberUserId}
              onChange={(e) => setMemberUserId(e.target.value)}
              placeholder="e.g. user_2abc..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">The user must already have an account.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Role</label>
            <select
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  )
}
