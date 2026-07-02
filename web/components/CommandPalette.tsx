'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface CommandRoute {
  label: string
  href: string
  section: string
}

interface CommandPaletteProps {
  routes: CommandRoute[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase().trim()
  if (!q) return true
  const t = target.toLowerCase()
  if (t.includes(q)) return true
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

export default function CommandPalette({ routes, open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const results = useMemo(
    () => routes.filter((r) => fuzzyMatch(query, `${r.section} ${r.label}`)),
    [routes, query]
  )

  useEffect(() => {
    setActiveIndex(0)
  }, [query, open])

  useEffect(() => {
    if (open) {
      setQuery('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
        return
      }
      if (!open) return
      if (e.key === 'Escape') {
        onOpenChange(false)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const chosen = results[activeIndex]
        if (chosen) {
          router.push(chosen.href)
          onOpenChange(false)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, results, activeIndex, onOpenChange, router])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-stone-950/70 pt-24" onClick={() => onOpenChange(false)}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-stone-700 bg-stone-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-stone-800 px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-stone-500">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a case, resolution, or compliance record..."
            className="w-full bg-transparent text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none"
          />
          <kbd className="rounded border border-stone-700 px-1.5 py-0.5 text-[10px] text-stone-500">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-stone-500">No matching route.</div>
          )}
          {results.map((r, idx) => (
            <button
              key={r.href}
              onClick={() => {
                router.push(r.href)
                onOpenChange(false)
              }}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors ${
                idx === activeIndex ? 'bg-indigo-500/15 text-indigo-300' : 'text-stone-300'
              }`}
            >
              <span>{r.label}</span>
              <span className="text-xs text-stone-500">{r.section}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
