'use client'

interface DashboardContentProps {
  clientCount: number
}

export function DashboardContent({
  clientCount,
}: DashboardContentProps): React.JSX.Element {
  return (
    <div className="grid gap-4">
      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-pro-line bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-pro-muted">
            Clientes Activos
          </span>
          <div className="mt-2 text-2xl font-bold">{clientCount}</div>
        </div>
        <div className="rounded-xl border border-pro-line bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-pro-muted">Pedidos</span>
          <div className="mt-2 text-2xl font-bold">—</div>
        </div>
        <div className="rounded-xl border border-pro-line bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-pro-muted">Servicios</span>
          <div className="mt-2 text-2xl font-bold">—</div>
        </div>
        <div className="rounded-xl border border-pro-line bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-pro-muted">Stock Bajo</span>
          <div className="mt-2 text-2xl font-bold">—</div>
        </div>
      </div>

      {/* Panels */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-pro-line bg-white p-4 shadow-sm">
          <h3 className="font-heading text-base font-bold">Pedidos Recientes</h3>
          <p className="mt-2 text-sm text-pro-muted">Sin pedidos recientes.</p>
        </div>
        <div className="rounded-xl border border-pro-line bg-white p-4 shadow-sm">
          <h3 className="font-heading text-base font-bold">Alertas de Stock</h3>
          <p className="mt-2 text-sm text-pro-muted">Sin alertas de stock bajo.</p>
        </div>
      </div>
    </div>
  )
}
