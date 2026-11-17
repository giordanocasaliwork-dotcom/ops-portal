import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ops Portal',
  description: 'Portale Operativo',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  )
}
