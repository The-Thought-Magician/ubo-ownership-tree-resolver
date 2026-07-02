import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-800 bg-stone-900/40 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-3xl text-stone-600">{icon}</div>}
      <h3 className="text-sm font-semibold text-stone-200">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-stone-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export default EmptyState
