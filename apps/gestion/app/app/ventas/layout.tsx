import type { ReactNode } from "react";

interface VentasLayoutProps {
  readonly children: ReactNode;
}

export default function VentasLayout({ children }: VentasLayoutProps) {
  return <>{children}</>;
}
