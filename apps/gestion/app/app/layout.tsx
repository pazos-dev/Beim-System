import type { ReactNode } from "react";

import { AppShell } from "../../src/components/features/AppShell";

interface AppLayoutProps {
  readonly children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
