"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type {
  AuthUser,
  Entitlement,
  EffectiveAccessResult,
} from "@/lib/api/types";
import { apiClient } from "@/lib/api/client";

const TOKEN_KEY = "session_token";
const USER_KEY = "auth_user";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasEntitlement: (entitlement: Entitlement) => boolean;
  isAdmin: () => boolean;
  isInternal: () => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(uid: string): Promise<AuthUser | null> {
  try {
    const res = await apiClient.get<{
      user: {
        firebase_uid: string;
        name: string;
        email: string;
        role: string;
      };
    }>(`/users/${uid}`);
    const u = res.data.user;
    let entitlements: AuthUser["entitlements"] = [];
    try {
      const ea = await apiClient.get<EffectiveAccessResult>(
        `/users/${uid}/effective-access`,
      );
      if (
        ea.data.effective_access.some(
          (e) => e.effective_role === "admin" || e.effective_role === "owner",
        )
      ) {
        entitlements = ["*"];
      } else {
        entitlements = ea.data.effective_access.map(
          (e) => e.app_id as Entitlement,
        );
      }
    } catch {
      entitlements = u.role === "admin" ? ["*"] : [];
    }
    return {
      id: u.firebase_uid,
      firebase_uid: u.firebase_uid,
      email: u.email,
      displayName: u.name,
      role: u.role as AuthUser["role"],
      entitlements,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedUser = localStorage.getItem(USER_KEY);
    if (savedToken && savedUser) {
      try {
        const parsed = JSON.parse(savedUser) as AuthUser;
        setToken(savedToken);
        setUser(parsed);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      try {
        const res = await apiClient.post<{ token: string; uid: string }>(
          "/auth/login",
          {
            email,
            password,
          },
        );
        const { token: newToken, uid } = res.data;
        localStorage.setItem(TOKEN_KEY, newToken);
        setToken(newToken);
        const profile = await fetchProfile(uid);
        if (profile) {
          localStorage.setItem(USER_KEY, JSON.stringify(profile));
          setUser(profile);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setToken(null);
  }, []);

  const hasEntitlement = useCallback(
    (entitlement: Entitlement): boolean => {
      if (!user) return false;
      if (user.role === "admin") return true;
      if (user.entitlements.includes("*")) return true;
      return user.entitlements.includes(entitlement);
    },
    [user],
  );

  const isAdmin = useCallback((): boolean => {
    return user?.role === "admin";
  }, [user]);

  const isInternal = useCallback((): boolean => {
    return user?.role === "internal" || user?.role === "admin";
  }, [user]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
      hasEntitlement,
      isAdmin,
      isInternal,
    }),
    [user, token, loading, login, logout, hasEntitlement, isAdmin, isInternal],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
