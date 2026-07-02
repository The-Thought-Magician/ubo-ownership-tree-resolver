'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth/client'
import CommandPalette, { CommandRoute } from './CommandPalette'

const PRIMARY_LINKS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Cases', href: '/dashboard/cases' },
  { label: 'Owners Roster', href: '/dashboard/owners' },
]

const ALL_ROUTES: CommandRoute[] = [
  { label: 'Dashboard', href: '/dashboard', section: 'Overview' },
  { label: 'Cases', href: '/dashboard/cases', section: 'Cases' },
  { label: 'Entities', href: '/dashboard/entities', section: 'Cases' },
  { label: 'Trusts', href: '/dashboard/trusts', section: 'Cases' },
  { label: 'Documents', href: '/dashboard/documents', section: 'Cases' },
  { label: 'Resolutions', href: '/dashboard/resolutions', section: 'Resolution' },
  { label: 'Owners Roster', href: '/dashboard/owners', section: 'Resolution' },
  { label: 'Paths Explorer', href: '/dashboard/paths', section: 'Resolution' },
  { label: 'Control Findings', href: '/dashboard/control-findings', section: 'Resolution' },
  { label: 'Filed Set', href: '/dashboard/filed-set', section: 'Compliance' },
  { label: 'Discrepancies', href: '/dashboard/discrepancies', section: 'Compliance' },
  { label: 'Audit Log', href: '/dashboard/audit-log', section: 'Compliance' },
  { label: 'Snapshots', href: '/dashboard/snapshots', section: 'Versions' },
  { label: 'Diffs', href: '/dashboard/diffs', section: 'Versions' },
  { label: 'Exports', href: '/dashboard/exports', section: 'Versions' },
  { label: 'Seed Scenarios', href: '/dashboard/seed', section: 'Tools' },
  { label: 'Settings', href: '/dashboard/settings', section: 'Tools' },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [userLabel, setUserLabel] = useState('Workspace')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await authClient.getSession()
      if (cancelled) return
      const user = (s as any)?.data?.user
      if (!user) {
        router.push('/auth/sign-in')
        return
      }
      setUserLabel(user.name || user.email || 'Workspace')
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  const signOut = async () => {
    await authClient.signOut()
    router.push('/')
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950">
        <div className="flex items-center gap-3 text-stone-400">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-700 border-t-indigo-500" />
          Loading...
        </div>
      </div>
    )
  }

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-black text-white">U</span>
        <span className="text-sm font-bold tracking-tight text-stone-100">UBO Resolver</span>
      </div>
      <div className="space-y-0.5 px-3">
        {PRIMARY_LINKS.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-indigo-500/15 font-medium text-indigo-300'
                  : 'text-stone-400 hover:bg-stone-800/60 hover:text-stone-100'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
      <div className="px-3 pt-3">
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex w-full items-center justify-between rounded-lg border border-stone-800 px-3 py-2 text-left text-sm text-stone-500 hover:border-stone-700 hover:text-stone-300"
        >
          <span>Search records...</span>
          <kbd className="rounded border border-stone-700 px-1.5 py-0.5 text-[10px]">⌘K</kbd>
        </button>
      </div>
      <div className="flex-1" />
      <div className="px-3 pb-5 text-[10px] uppercase tracking-wider text-stone-600">
        All modules reachable via ⌘K
      </div>
    </nav>
  )

  return (
    <div className="flex min-h-screen bg-stone-950">
      <CommandPalette routes={ALL_ROUTES} open={paletteOpen} onOpenChange={setPaletteOpen} />

      <aside className="hidden w-56 shrink-0 border-r border-stone-800 bg-stone-900/60 lg:block">
        {sidebar}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-stone-950/70" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-56 border-r border-stone-800 bg-stone-900">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-stone-800 bg-stone-900/40 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded-md p-1.5 text-stone-400 hover:bg-stone-800 hover:text-white lg:hidden"
              aria-label="Open navigation"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <span className="text-sm font-medium text-stone-300">{userLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-lg border border-stone-700 px-3 py-1.5 text-sm text-stone-400 hover:bg-stone-800 hover:text-white sm:flex"
            >
              <span>Search</span>
              <kbd className="rounded border border-stone-600 px-1.5 py-0.5 text-[10px]">⌘K</kbd>
            </button>
            <button
              onClick={signOut}
              className="rounded-lg border border-stone-700 px-3 py-1.5 text-sm text-stone-300 transition-colors hover:bg-stone-800 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
