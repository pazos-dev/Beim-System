// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: Infinity
      }
    }
  });
}

export function renderWithQueryClient(ui: ReactElement, options?: RenderOptions) {
  const client = createTestQueryClient();
  return render(ui, {
    ...options,
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  });
}

export { createTestQueryClient };
