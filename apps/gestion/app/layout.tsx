import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/lib/providers'

export const metadata: Metadata = {
  title: 'BEIM — Panel de Gestión',
  description: 'Administración BEIM — Gestión de clientes, pedidos y servicios.',
}

export const runtime = 'nodejs'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <html lang="es">
      <body className="min-h-screen bg-[#f3f6f5] text-pro-ink font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
