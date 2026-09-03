'use client'

import { Sidebar } from '@/components/sidebar'
import { Topbar } from '@/components/topbar'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-screen overflow-hidden bg-[#f3f6f5]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <Topbar title="Panel de Gestión" subtitle="BEIM" />
        {children}
      </main>
    </div>
  )
}
