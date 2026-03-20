import { Routes, Route, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Users, UserPlus, Shield, KeyRound, HeartPulse } from "lucide-react";
import { AppShell } from "@unified-trading/ui-kit";
import UsersPage from "./pages/UsersPage";
import OnboardUserPage from "./pages/OnboardUserPage";
import UserDetailPage from "./pages/UserDetailPage";
import ModifyUserPage from "./pages/ModifyUserPage";
import OffboardUserPage from "./pages/OffboardUserPage";
import AccessTemplatesPage from "./pages/AccessTemplatesPage";
import FirebaseUsersPage from "./pages/FirebaseUsersPage";
import AdminHealthChecksPage from "./pages/AdminHealthChecksPage";

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
      { id: "templates", label: "Templates", icon: <Shield size={14} /> },
      { id: "firebase-users", label: "Firebase Users", icon: <KeyRound size={14} /> },
      { id: "health-checks", label: "Health Checks", icon: <HeartPulse size={14} /> },
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
      extraProviders={(children: ReactNode) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )}
    >
      <Routes>
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/:id" element={<UserDetailPage />} />
        <Route path="/users/:id/modify" element={<ModifyUserPage />} />
        <Route path="/users/:id/offboard" element={<OffboardUserPage />} />
        <Route path="/onboard" element={<OnboardUserPage />} />
        <Route path="/templates" element={<AccessTemplatesPage />} />
        <Route path="/firebase-users" element={<FirebaseUsersPage />} />
        <Route path="/health-checks" element={<AdminHealthChecksPage />} />
        <Route path="/admin/health-checks" element={<AdminHealthChecksPage />} />
        <Route path="*" element={<Navigate to="/users" replace />} />
      </Routes>
    </AppShell>
  );
}
