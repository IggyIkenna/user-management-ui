import { Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Users, UserPlus, Shield } from "lucide-react";
import { AppShell } from "@unified-trading/ui-kit";
import UsersPage from "./pages/UsersPage";
import OnboardUserPage from "./pages/OnboardUserPage";
import UserDetailPage from "./pages/UserDetailPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

const NAV_SECTIONS = [
  {
    id: "people",
    label: "People",
    items: [
      { id: "users", label: "Users", icon: <Users size={14} /> },
      { id: "onboard", label: "Onboard", icon: <UserPlus size={14} /> },
    ],
  },
];

export default function App() {
  return (
    <AppShell
      appName="User Management"
      appDescription="onboard, modify, off-board"
      icon={<Shield />}
      iconColor="#f59e0b"
      version="v0.1.0"
      nav={NAV_SECTIONS}
      defaultRoute="/users"
      navGroupLabel="Admin Platform"
      sidebarWidth="w-64"
      healthUrl={`${import.meta.env.VITE_API_URL ?? "http://localhost:8017"}/health`}
      extraProviders={(children) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )}
    >
      <Routes>
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/:id" element={<UserDetailPage />} />
        <Route path="/onboard" element={<OnboardUserPage />} />
        <Route path="*" element={<Navigate to="/users" replace />} />
      </Routes>
    </AppShell>
  );
}
