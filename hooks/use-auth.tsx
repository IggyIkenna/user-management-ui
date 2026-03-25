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
import {
  signInWithEmailAndPassword,
  signOut,
  onIdTokenChanged,
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import type { AuthUser, Entitlement, EffectiveAccessResult } from "@/lib/api/types";
import { apiClient } from "@/lib/api/client";

const TOKEN_KEY = "session_token";
const USER_KEY = "auth_user";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
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
        entitlements = ea.data.effective_access.map((e) => e.app_id as Entitlement);
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
    const unsubscribe = onIdTokenChanged(firebaseAuth, async (firebaseUser) => {
      if (firebaseUser) {
        const freshToken = await firebaseUser.getIdToken();
        localStorage.setItem(TOKEN_KEY, freshToken);
        setToken(freshToken);

        const savedUser = localStorage.getItem(USER_KEY);
        if (savedUser) {
          try {
            setUser(JSON.parse(savedUser) as AuthUser);
          } catch {
            const profile = await fetchProfile(firebaseUser.uid);
            if (profile) {
              localStorage.setItem(USER_KEY, JSON.stringify(profile));
              setUser(profile);
            }
          }
        } else {
          const profile = await fetchProfile(firebaseUser.uid);
          if (profile) {
            localStorage.setItem(USER_KEY, JSON.stringify(profile));
            setUser(profile);
          }
        }
      } else {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
      const freshToken = await cred.user.getIdToken();
      localStorage.setItem(TOKEN_KEY, freshToken);
      setToken(freshToken);
      const profile = await fetchProfile(cred.user.uid);
      if (profile) {
        localStorage.setItem(USER_KEY, JSON.stringify(profile));
        setUser(profile);
        return { success: true };
      }
      return { success: false, error: "Failed to load user profile. Please try again." };
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || "";
      const FIREBASE_ERRORS: Record<string, string> = {
        "auth/invalid-credential": "Invalid email or password.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/user-disabled": "This account has been disabled. Contact an administrator.",
        "auth/user-not-found": "No account found with this email.",
        "auth/wrong-password": "Incorrect password.",
        "auth/too-many-requests": "Too many failed attempts. Please wait a moment and try again.",
        "auth/network-request-failed": "Network error. Check your connection and try again.",
      };
      return { success: false, error: FIREBASE_ERRORS[code] || `Login failed (${code || "unknown error"}).` };
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(firebaseAuth);
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
    () => ({ user, token, loading, login, logout, hasEntitlement, isAdmin, isInternal }),
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
