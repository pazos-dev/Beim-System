import type { ReactNode } from "react";

import { AppShell } from "../../src/components/features/AppShell";
import { QueryProvider } from "../../src/components/QueryProvider";
import { SessionBootstrap } from "../../src/components/SessionBootstrap";

interface AppLayoutProps {
  readonly children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <QueryProvider>
      <SessionBootstrap />
      <AppShell>{children}</AppShell>
    </QueryProvider>
  );
}
