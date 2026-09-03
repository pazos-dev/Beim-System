import Link from 'next/link'

export default function NotFound(): React.JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="font-heading text-4xl font-bold text-pro-ink">404</h1>
        <p className="mt-2 text-pro-muted">Página no encontrada</p>
        <Link
          href="/"
          className="mt-4 inline-block text-teal hover:text-teal-dark"
        >
          Volver al panel
        </Link>
      </div>
    </div>
  )
}
