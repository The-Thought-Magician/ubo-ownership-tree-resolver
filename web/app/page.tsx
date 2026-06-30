import Link from 'next/link'

const features = [
  {
    title: 'Layered ownership graph editor',
    body: 'Model companies, holding companies, trusts, intermediates, and natural persons. Draw directed ownership edges with percentages on a canvas + table view, with cross-holding and circular structures supported.',
  },
  {
    title: 'Effective indirect ownership',
    body: 'Deterministically multiply direct percentages through every path from each person to the target and sum across paths. Cycle-safe traversal with a full per-path breakdown and complete traceability.',
  },
  {
    title: '25% threshold resolver',
    body: 'Flag every natural person at or above the configurable 25% effective-ownership threshold, with near-threshold warnings and per-person path evidence.',
  },
  {
    title: 'Substantial-control test',
    body: 'Identify persons meeting substantial-control criteria, senior officer, appointment authority, important-decision authority, independent of any ownership percentage.',
  },
  {
    title: 'Control-test worksheet',
    body: 'Record the documented basis for each control finding: the criterion, supporting evidence, analyst rationale, and worksheet line items, producing an auditable record per finding.',
  },
  {
    title: 'Discrepancy detector',
    body: 'Compare the computed beneficial-owner set against the previously filed set, flagging additions, removals, percentage changes, and threshold crossings with severity.',
  },
  {
    title: 'Versioned snapshots and diffs',
    body: 'Freeze the case graph as an immutable snapshot, restore it later, and render before/after diffs of entities, edges, resolved owners, and percentage deltas.',
  },
  {
    title: 'Exportable rosters and diagrams',
    body: 'Generate a beneficial-owner roster (CSV/JSON) and an ownership-chain diagram (DOT/SVG/JSON) with percentages on edges and qualifying owners highlighted.',
  },
  {
    title: 'Trust modeling and seeded traps',
    body: 'Model trustees, beneficiaries, grantor, and flow rules. Seed sample cases with deliberate traps, circular ownership, trust-layer indirection, just-below-threshold splits, for demos and training.',
  },
]

const steps = [
  { n: '1', title: 'Build the graph', body: 'Add entities and draw ownership edges, or seed a sample case with built-in traps.' },
  { n: '2', title: 'Run the resolution', body: 'The engine multiplies percentages through every path and applies the FinCEN 25% and control tests.' },
  { n: '3', title: 'Review and export', body: 'Inspect the roster, path evidence, and discrepancies, then export an auditable roster and diagram.' },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-black text-white">U</span>
          <span className="text-lg font-bold tracking-tight">UboOwnershipTreeResolver</span>
        </span>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="/pricing" className="hidden text-sm text-slate-300 hover:text-white sm:inline">
            Pricing
          </Link>
          <Link href="/auth/sign-in" className="text-sm text-slate-300 hover:text-white">
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

      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
          Deterministic KYB beneficial-ownership resolution
        </span>
        <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-6xl">
          Resolve the <span className="text-indigo-400">ultimate beneficial owners</span> behind any entity
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          UboOwnershipTreeResolver builds the layered ownership tree behind a business and deterministically computes
          who clears the FinCEN 25% beneficial-ownership and substantial-control thresholds, so your BOI report names
          the correct natural persons. Every percentage is traceable to a chain of edges.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white hover:bg-indigo-500"
          >
            Start resolving for free
          </Link>
          <Link
            href="/auth/sign-in"
            className="rounded-lg border border-slate-700 px-6 py-3 text-base font-semibold text-slate-200 hover:bg-slate-800"
          >
            Sign In
          </Link>
        </div>
      </section>

      <section className="border-t border-slate-800 bg-slate-900/30 px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">The hardest step in BOI filing and KYB</h2>
          <p className="mx-auto mt-4 max-w-3xl text-center text-slate-400">
            A person may own 30% of HoldCo A and 40% of HoldCo B, where HoldCo A owns 50% of the target and HoldCo B
            owns 30%. Their effective ownership is 30%×50% + 40%×30% = 27%, clearing the 25% threshold even though no
            single direct edge does. Doing this by hand across dozens of entities with circular cross-holdings and
            trust layers is slow, and mistakes mean filing the wrong people. This tool does it deterministically, every
            time.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">Everything you need to name the right owners</h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="text-base font-semibold text-slate-100">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-800 bg-slate-900/30 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">How it works</h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-lg font-bold text-white">
                  {s.n}
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-100">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h2 className="text-3xl font-bold">Stop filing the wrong people</h2>
        <p className="mx-auto mt-4 max-w-2xl text-slate-400">
          Build the ownership tree once, resolve it deterministically, and export an auditable roster you can defend.
        </p>
        <div className="mt-8">
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white hover:bg-indigo-500"
          >
            Create your free account
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-800 px-6 py-10 text-center text-sm text-slate-600">
        <p className="font-semibold text-slate-400">UboOwnershipTreeResolver</p>
        <p className="mt-1">Deterministic beneficial-ownership resolution for KYB and BOI filing.</p>
        <div className="mt-4 flex justify-center gap-6">
          <Link href="/pricing" className="hover:text-slate-300">Pricing</Link>
          <Link href="/auth/sign-in" className="hover:text-slate-300">Sign In</Link>
          <Link href="/auth/sign-up" className="hover:text-slate-300">Get Started</Link>
        </div>
      </footer>
    </main>
  )
}
