import type { ReactNode } from "react";

interface OrdenesLayoutProps {
  readonly children: ReactNode;
}

export default function OrdenesLayout({ children }: OrdenesLayoutProps) {
  return <>{children}</>;
}
