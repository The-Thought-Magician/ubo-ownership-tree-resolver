'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'

const includedFeatures = [
  'Layered ownership graph editor (canvas + table)',
  'Deterministic effective indirect ownership math',
  'FinCEN 25% threshold resolver with near-threshold alerts',
  'Substantial-control test resolver + control worksheet',
  'Discrepancy detection against the filed set',
  'Versioned snapshots and before/after diffs',
  'Beneficial-owner roster and ownership-chain diagram exports',
  'Trust modeling, seeded trap scenarios, audit log',
  'Unlimited cases, entities, and resolutions',
]

export default function Pricing() {
  const [stripeEnabled, setStripeEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.getBillingPlan()
        if (!cancelled) setStripeEnabled(Boolean((res as any)?.stripeEnabled))
      } catch {
        if (!cancelled) setStripeEnabled(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="min-h-screen bg-stone-950 text-stone-100">
      <nav className="border-b border-stone-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-black text-white">U</span>
          <span className="text-lg font-bold tracking-tight">UboOwnershipTreeResolver</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/auth/sign-in" className="text-sm text-stone-300 hover:text-white">
            Sign In
          </Link>
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Get Started
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Simple, free pricing</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-stone-400">
          Every feature is included on the free plan. No seats limits, no per-case fees, no gated exports.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-8 md:grid-cols-2">
          <div className="rounded-2xl border-2 border-indigo-500/40 bg-stone-900 p-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-stone-100">Free</h2>
              <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
                Everything included
              </span>
            </div>
            <div className="mt-4">
              <span className="text-5xl font-black text-stone-100">$0</span>
              <span className="text-stone-500"> / month</span>
            </div>
            <p className="mt-3 text-sm text-stone-400">
              The full deterministic resolution platform, free for every analyst and workspace.
            </p>
            <ul className="mt-6 space-y-3">
              {includedFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-stone-300">
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/auth/sign-up"
              className="mt-8 block rounded-lg bg-indigo-600 px-6 py-3 text-center text-base font-semibold text-white hover:bg-indigo-500"
            >
              Start for free
            </Link>
          </div>

          <div className="rounded-2xl border border-stone-800 bg-stone-900/50 p-8">
            <h2 className="text-xl font-bold text-stone-100">Pro</h2>
            <div className="mt-4">
              <span className="text-5xl font-black text-stone-400">—</span>
            </div>
            <p className="mt-3 text-sm text-stone-400">
              {stripeEnabled
                ? 'Upgraded billing options for larger teams are available from your workspace settings.'
                : 'There is nothing behind a paywall today. Every capability ships on the free plan, so there is no upgrade to buy yet.'}
            </p>
            <ul className="mt-6 space-y-3 text-sm text-stone-400">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 text-stone-600">•</span>
                <span>Same deterministic engine as Free</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 text-stone-600">•</span>
                <span>Priority support and onboarding (coming soon)</span>
              </li>
            </ul>
            <Link
              href="/auth/sign-up"
              className="mt-8 block rounded-lg border border-stone-700 px-6 py-3 text-center text-base font-semibold text-stone-200 hover:bg-stone-800"
            >
              Get started free
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-800 px-6 py-10 text-center text-sm text-stone-600">
        <p className="font-semibold text-stone-400">UboOwnershipTreeResolver</p>
        <div className="mt-4 flex justify-center gap-6">
          <Link href="/" className="hover:text-stone-300">Home</Link>
          <Link href="/auth/sign-in" className="hover:text-stone-300">Sign In</Link>
          <Link href="/auth/sign-up" className="hover:text-stone-300">Get Started</Link>
        </div>
      </footer>
    </main>
  )
}
