import type { Metadata } from 'next'
import { Work_Sans } from 'next/font/google'
import './globals.css'

const workSans = Work_Sans({
  subsets: ['latin'],
  variable: '--font-work-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'UboOwnershipTreeResolver',
  description: 'Deterministic beneficial-ownership resolution: layered ownership trees, the FinCEN 25% and substantial-control tests, discrepancy detection, and auditable exports.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={workSans.variable}>
      <body className="bg-stone-950 text-stone-100 min-h-screen antialiased font-sans">{children}</body>
    </html>
  )
}
