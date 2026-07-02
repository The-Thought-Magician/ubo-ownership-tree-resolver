import Link from 'next/link'

const features = [
  {
    title: 'Layered ownership graph editor',
    body: 'Model companies, holding companies, trusts, intermediates, and natural persons. Record directed ownership edges with percentages on a canvas and table view. Cross-holdings and circular structures are supported, not treated as edge cases.',
  },
  {
    title: 'Effective indirect ownership',
    body: 'Direct percentages are multiplied through every path from each natural person to the target entity and summed across paths. Traversal is cycle-safe. Every contribution is traceable to its originating edge.',
  },
  {
    title: '25% threshold resolver',
    body: 'Every natural person at or above the configurable 25% effective-ownership threshold is flagged, with near-threshold warnings and full per-person path evidence for the file.',
  },
  {
    title: 'Substantial-control test',
    body: 'Persons meeting substantial-control criteria, senior officer, authority to appoint or remove, important-decision authority, are identified independent of ownership percentage, as FinCEN requires.',
  },
  {
    title: 'Control-test worksheet',
    body: 'Each control finding carries a documented basis: the applicable criterion, supporting evidence, analyst rationale, and worksheet line items. The record is built to withstand review.',
  },
  {
    title: 'Discrepancy detector',
    body: 'The computed beneficial-owner set is compared against the previously filed set. Additions, removals, percentage changes, and threshold crossings are flagged with severity.',
  },
  {
    title: 'Versioned snapshots and diffs',
    body: 'The case graph is frozen as an immutable snapshot and restorable at any time. Before/after diffs render changes to entities, edges, resolved owners, and percentages.',
  },
  {
    title: 'Exportable rosters and diagrams',
    body: 'A beneficial-owner roster (CSV/JSON) and an ownership-chain diagram (DOT/SVG/JSON) are generated on demand, with percentages on edges and qualifying owners marked.',
  },
  {
    title: 'Trust modeling and seeded scenarios',
    body: 'Trustees, beneficiaries, grantor, and flow rules are modeled explicitly. Seeded cases with deliberate traps, circular ownership, trust-layer indirection, near-threshold splits, are provided for training and file review.',
  },
]

const steps = [
  { n: '1', title: 'Construct the graph', body: 'Enter entities and ownership edges for the case, or load a seeded scenario to test the resolution logic.' },
  { n: '2', title: 'Run the resolution', body: 'Percentages are multiplied through every path and the FinCEN 25% and substantial-control tests are applied deterministically.' },
  { n: '3', title: 'Review and file', body: 'Examine the roster, path evidence, and discrepancies, then export a documented, defensible record for the file.' },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-stone-950 text-stone-100">
      <nav className="border-b border-stone-800 px-6 py-4 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-black text-white">U</span>
          <span className="text-lg font-bold tracking-tight">UboOwnershipTreeResolver</span>
        </span>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="/pricing" className="hidden text-sm text-stone-300 hover:text-white sm:inline">
            Pricing
          </Link>
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

      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
          Deterministic KYB beneficial-ownership resolution
        </span>
        <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-6xl">
          Name the correct <span className="text-indigo-400">ultimate beneficial owners</span>, every time
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-stone-400">
          UboOwnershipTreeResolver builds the layered ownership tree behind a target entity and computes, without
          probabilistic guessing, which natural persons clear the FinCEN 25% beneficial-ownership threshold and which
          meet the substantial-control test. Every percentage in the resolution is traceable to a documented chain of
          ownership edges, so your BOI report and your onboarding file both stand up to scrutiny.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white hover:bg-indigo-500"
          >
            Begin a resolution
          </Link>
          <Link
            href="/auth/sign-in"
            className="rounded-lg border border-stone-700 px-6 py-3 text-base font-semibold text-stone-200 hover:bg-stone-800"
          >
            Sign In
          </Link>
        </div>
      </section>

      <section className="border-t border-stone-800 bg-stone-900/30 px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Where BOI filings and KYB onboarding go wrong</h2>
          <p className="mx-auto mt-4 max-w-3xl text-center text-stone-400">
            A natural person may hold 30% of HoldCo A and 40% of HoldCo B, where HoldCo A holds 50% of the target and
            HoldCo B holds 30%. Their effective ownership is 30%×50% + 40%×30% = 27%, clearing the 25% threshold even
            though no single direct edge does. Resolving this by hand across dozens of entities, with circular
            cross-holdings and trust layers in play, is slow, and errors carry consequence: filing the wrong persons
            triggers a corrected-report obligation and potential penalties, and misclassifying a customer at onboarding
            creates downstream compliance exposure. This platform performs the computation deterministically, with a
            documented basis for every finding.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">The record you need to defend your filing</h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-stone-800 bg-stone-900 p-6">
              <h3 className="text-base font-semibold text-stone-100">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-stone-800 bg-stone-900/30 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">The resolution workflow</h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-lg font-bold text-white">
                  {s.n}
                </div>
                <h3 className="mt-4 text-base font-semibold text-stone-100">{s.title}</h3>
                <p className="mt-2 text-sm text-stone-400">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h2 className="text-3xl font-bold">File with a documented basis, not a best guess</h2>
        <p className="mx-auto mt-4 max-w-2xl text-stone-400">
          Construct the ownership tree once, resolve it deterministically, and export a roster and diagram you can
          stand behind in a review, an audit, or a regulator's inquiry.
        </p>
        <div className="mt-8">
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white hover:bg-indigo-500"
          >
            Create your workspace
          </Link>
        </div>
      </section>

      <footer className="border-t border-stone-800 px-6 py-10 text-center text-sm text-stone-600">
        <p className="font-semibold text-stone-400">UboOwnershipTreeResolver</p>
        <p className="mt-1">Deterministic beneficial-ownership resolution for KYB and BOI filing.</p>
        <div className="mt-4 flex justify-center gap-6">
          <Link href="/pricing" className="hover:text-stone-300">Pricing</Link>
          <Link href="/auth/sign-in" className="hover:text-stone-300">Sign In</Link>
          <Link href="/auth/sign-up" className="hover:text-stone-300">Get Started</Link>
        </div>
      </footer>
    </main>
  )
}
