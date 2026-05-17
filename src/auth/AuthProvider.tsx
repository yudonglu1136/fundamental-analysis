import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useLocation, useNavigate } from "react-router-dom";
import { installAuthenticatedFetch, setApiAccessToken } from "../api/client";
import {
  devAuthAccessToken,
  devAuthUser,
  getCurrentSession,
  isDevAuthBypassEnabled,
  isAuthConfigured,
  mapSupabaseUser,
  signInWithGoogle,
  signOut,
  supabase,
  type AuthUser,
  type Entitlements,
} from "./authClient";

const devSessionStorageKey = "fundamental-analysis-dev-auth";

type AuthContextValue = {
  configured: boolean;
  devBypassEnabled: boolean;
  isAuthenticated: boolean;
  loading: boolean;
  session: Session | null;
  user: AuthUser | null;
  entitlements: Entitlements;
  signInWithGoogle: (redirectTo: string) => Promise<void>;
  signInWithDevBypass: () => void;
  logout: () => Promise<void>;
};

const defaultEntitlements: Entitlements = {
  plan: "unknown",
  roles: [],
  features: [],
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [devAuthenticated, setDevAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const logout = useCallback(async () => {
    setApiAccessToken(null);
    window.localStorage.removeItem(devSessionStorageKey);
    setDevAuthenticated(false);
    await signOut();
    setSession(null);
    const redirectTo = encodeURIComponent(`${location.pathname}${location.search}`);
    navigate(`/login?redirectTo=${redirectTo}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    installAuthenticatedFetch(() => {
      void logout();
    });
  }, [logout]);

  useEffect(() => {
    let mounted = true;
    async function initializeSession() {
      if (!isAuthConfigured) {
        const hasDevSession = isDevAuthBypassEnabled && window.localStorage.getItem(devSessionStorageKey) === "1";
        setDevAuthenticated(hasDevSession);
        setApiAccessToken(hasDevSession ? devAuthAccessToken : null);
        setLoading(false);
        return;
      }
      try {
        const currentSession = await getCurrentSession();
        if (!mounted) return;
        setSession(currentSession);
        setApiAccessToken(currentSession?.access_token ?? null);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    initializeSession();
    const subscription = supabase?.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setApiAccessToken(nextSession?.access_token ?? null);
    });
    return () => {
      mounted = false;
      subscription?.data.subscription.unsubscribe();
    };
  }, []);

  const signInWithDevBypass = useCallback(() => {
    if (!isDevAuthBypassEnabled) return;
    window.localStorage.setItem(devSessionStorageKey, "1");
    setDevAuthenticated(true);
    setApiAccessToken(devAuthAccessToken);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isAuthConfigured,
      devBypassEnabled: isDevAuthBypassEnabled,
      isAuthenticated: Boolean(session) || devAuthenticated,
      loading,
      session,
      user: devAuthenticated ? devAuthUser : mapSupabaseUser(session?.user ?? null),
      entitlements: defaultEntitlements,
      signInWithGoogle,
      signInWithDevBypass,
      logout,
    }),
    [devAuthenticated, loading, logout, session, signInWithDevBypass],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
