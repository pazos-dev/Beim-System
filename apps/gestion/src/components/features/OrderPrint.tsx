export interface OrderView {
  readonly clienteId: string;
  readonly estado: string;
  readonly id: string;
  readonly numero: string;
  readonly paymentStatus: string;
  readonly total: number;
}

interface OrderPrintProps {
  readonly order: OrderView;
}

const COPIES = ["Original", "Duplicado"] as const;

export function OrderPrint({ order }: OrderPrintProps) {
  return (
    <section aria-label="Vista previa de impresión" className="print-area flex flex-col gap-6" role="region">
      <style>{`@media print { body .no-print { display: none !important; } .print-area { display: block !important; } }`}</style>
      {COPIES.map((copy) => (
        <article aria-label={`Boleta ${copy}`} className="rounded-xl border border-line bg-surface p-5" key={copy}>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">{copy}</p>
          <h3 className="mt-1 text-xl font-semibold text-ink">Orden {order.numero}</h3>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-ink">
            <dt className="text-ink-muted">Cliente</dt>
            <dd>{order.clienteId}</dd>
            <dt className="text-ink-muted">Estado</dt>
            <dd>{order.estado}</dd>
            <dt className="text-ink-muted">Pago</dt>
            <dd>{order.paymentStatus}</dd>
            <dt className="text-ink-muted">Total</dt>
            <dd>{order.total}</dd>
          </dl>
        </article>
      ))}
    </section>
  );
}
