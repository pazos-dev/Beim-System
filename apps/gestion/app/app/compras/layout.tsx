import type { ReactNode } from "react";

interface ComprasLayoutProps {
  readonly children: ReactNode;
}

export default function ComprasLayout({ children }: ComprasLayoutProps) {
  return <>{children}</>;
}
