import type { ReactNode } from 'react'

interface StatProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'indigo' | 'amber' | 'rose' | 'green'
}

const accents: Record<NonNullable<StatProps['tone']>, string> = {
  default: 'text-stone-100',
  indigo: 'text-indigo-300',
  amber: 'text-amber-300',
  rose: 'text-rose-300',
  green: 'text-emerald-300',
}

export function Stat({ label, value, hint, tone = 'default' }: StatProps) {
  return (
    <div className="rounded-xl border border-stone-800 bg-stone-900 px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums ${accents[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-stone-500">{hint}</div>}
    </div>
  )
}

export default Stat
