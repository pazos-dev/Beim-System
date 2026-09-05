import type { ReactNode } from "react";

import { AppShell } from "../../src/components/features/AppShell";
import { QueryProvider } from "../../src/components/QueryProvider";

interface AppLayoutProps {
  readonly children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <QueryProvider>
      <AppShell>{children}</AppShell>
    </QueryProvider>
  );
}
