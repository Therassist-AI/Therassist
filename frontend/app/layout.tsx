import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Therassist - Guided Check-in Tool',
  description: 'An opt-in guided check-in tool for emotional support',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
