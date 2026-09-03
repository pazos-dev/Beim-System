export default function Loading(): React.JSX.Element {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-pro-line border-t-teal" />
        <p className="text-sm text-pro-muted">Cargando…</p>
      </div>
    </div>
  )
}
