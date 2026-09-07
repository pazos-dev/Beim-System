export interface CajaSesionView {
  readonly apertura: number;
  readonly estado: string;
  readonly fecha: string;
  readonly id: string;
}

export interface CajaMetodoView {
  readonly metodo: string;
  readonly total: number;
}

export interface CajaEstadoView {
  readonly abierta: boolean;
  readonly esperado: number;
  readonly gastosDia: { count: number; total: number };
  readonly porMetodo: readonly CajaMetodoView[];
  readonly sesion: CajaSesionView | null;
}

export interface CajaCierreView {
  readonly contado: number;
  readonly diferencia: number;
  readonly esperado: number;
  readonly resultado: string;
}

export function resultadoFor(diferencia: number): string {
  if (diferencia > 0) return "sobrante";
  if (diferencia < 0) return "faltante";
  return "exacto";
}

export function CajaPanel({ estado, ultimoCierre }: { estado: CajaEstadoView; ultimoCierre: CajaCierreView | null }) {
  return (
    <div className="flex flex-col gap-4">
      {estado.abierta && estado.sesion ? (
        <p className="rounded-md border border-line bg-surface px-4 py-3 text-ink" role="status">
          <strong>Caja abierta</strong> · {estado.sesion.fecha} · apertura {estado.sesion.apertura}
        </p>
      ) : (
        <p className="rounded-md border border-line bg-surface px-4 py-3 text-ink-muted" role="status">
          No hay una caja abierta.
        </p>
      )}

      <section aria-labelledby="caja-esperado-title" className="rounded-md border border-line bg-surface px-4 py-3">
        <h2 className="text-lg font-semibold text-ink" id="caja-esperado-title">
          Esperado contra contado
        </h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-ink-muted">Esperado</dt>
            <dd className="text-base font-semibold text-ink">{estado.esperado}</dd>
          </div>
          {ultimoCierre ? (
            <>
              <div>
                <dt className="text-ink-muted">Contado</dt>
                <dd className="text-base font-semibold text-ink">{ultimoCierre.contado}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Diferencia</dt>
                <dd className="text-base font-semibold text-ink">{ultimoCierre.diferencia}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Resultado</dt>
                <dd className="text-base font-semibold text-ink">{ultimoCierre.resultado}</dd>
              </div>
            </>
          ) : null}
        </dl>
      </section>

      <section aria-labelledby="caja-movimientos-title" className="rounded-md border border-line bg-surface px-4 py-3">
        <h2 className="text-lg font-semibold text-ink" id="caja-movimientos-title">
          Movimientos del día
        </h2>
        {estado.porMetodo.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Sin movimientos por método.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm text-ink">
            {estado.porMetodo.map((linea) => (
              <li className="flex items-center justify-between gap-2" key={linea.metodo}>
                <span>{linea.metodo}</span>
                <span className="font-semibold">{linea.total}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-ink-muted">
          Gastos del día: {estado.gastosDia.count} · total {estado.gastosDia.total}
        </p>
      </section>
    </div>
  );
}
