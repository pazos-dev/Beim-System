import type { ReactNode } from "react";

interface ClientesLayoutProps {
  readonly children: ReactNode;
}

export default function ClientesLayout({ children }: ClientesLayoutProps) {
  return <>{children}</>;
}
