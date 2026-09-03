import Link from 'next/link'

export default function NotFound(): React.JSX.Element {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <h1 className="font-heading text-6xl font-extrabold text-pro-ink">404</h1>
        <p className="mt-4 text-pro-muted">La página que buscás no existe.</p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-[46px] items-center rounded-[14px] border border-teal bg-teal px-8 text-sm font-bold text-white shadow-[0_10px_25px_rgba(12,159,146,.22)] transition-all hover:-translate-y-0.5 hover:shadow-lg"
        >
          Volver al catálogo
        </Link>
      </div>
    </div>
  )
}
