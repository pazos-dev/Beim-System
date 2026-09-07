import type { ReactNode } from "react";

interface ConfiguracionLayoutProps {
  readonly children: ReactNode;
}

export default function ConfiguracionLayout({ children }: ConfiguracionLayoutProps) {
  return <>{children}</>;
}
