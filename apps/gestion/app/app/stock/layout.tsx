import type { ReactNode } from "react";

interface StockLayoutProps {
  readonly children: ReactNode;
}

export default function StockLayout({ children }: StockLayoutProps) {
  return <>{children}</>;
}
