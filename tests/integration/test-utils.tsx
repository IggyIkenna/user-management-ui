import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactElement, ReactNode } from "react";

export function renderWithProviders(
  ui: ReactNode,
  initialRoute: string,
  routePath: string,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path={routePath} element={ui as ReactElement} />
          <Route
            path="*"
            element={<div data-testid="fallback-route">fallback</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
