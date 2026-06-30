import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'UboOwnershipTreeResolver',
  description: 'Deterministic beneficial-ownership resolution: layered ownership trees, the FinCEN 25% and substantial-control tests, discrepancy detection, and auditable exports.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased">{children}</body>
    </html>
  )
}
