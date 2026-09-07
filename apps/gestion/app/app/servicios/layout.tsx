import type { ReactNode } from "react";

interface ServiciosLayoutProps {
  readonly children: ReactNode;
}

export default function ServiciosLayout({ children }: ServiciosLayoutProps) {
  return <>{children}</>;
}
