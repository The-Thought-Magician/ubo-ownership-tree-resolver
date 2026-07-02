'use client'
import type { ReactNode } from 'react'
import { useEffect } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, footer, className = '' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-lg rounded-xl border border-stone-800 bg-stone-900 shadow-2xl ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-stone-800 px-5 py-4">
            <h2 className="text-base font-semibold text-stone-100">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-stone-500 hover:bg-stone-800 hover:text-stone-200"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-stone-800 px-5 py-4">{footer}</div>}
      </div>
    </div>
  )
}

export default Modal
