export interface ModulePlaceholderProps {
  readonly title: string;
}

export function ModulePlaceholder({ title }: ModulePlaceholderProps) {
  return (
    <section aria-labelledby="module-placeholder-title" className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink" id="module-placeholder-title">
        {title}
      </h1>
      <p className="max-w-2xl rounded-lg border border-line bg-surface p-5 text-ink-muted">
        Módulo en construcción. La navegación está disponible; las operaciones de negocio se incorporarán en su slice correspondiente.
      </p>
    </section>
  );
}
