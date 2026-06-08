import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { setApiAccessToken } from "../apiClient";
import {
  devAuthAccessToken,
  devAuthUser,
  getCurrentSession,
  isAuthConfigured,
  isDevAuthBypassEnabled,
  mapSupabaseUser,
  signInWithGoogle,
  signOut,
  supabase
} from "./authClient";

const devSessionStorageKey = "guru-analysis-dev-auth";

export const AuthContext = createContext(null);

function currentRoute() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [devAuthenticated, setDevAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    setApiAccessToken(null);
    window.localStorage.removeItem(devSessionStorageKey);
    setDevAuthenticated(false);
    await signOut();
    setSession(null);
    const redirectTo = encodeURIComponent(currentRoute());
    window.history.replaceState(null, "", `/login?redirectTo=${redirectTo}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  useEffect(() => {
    let mounted = true;

    async function initializeSession() {
      if (!isAuthConfigured) {
        const hasDevSession = isDevAuthBypassEnabled && window.localStorage.getItem(devSessionStorageKey) === "1";
        if (!mounted) return;
        setDevAuthenticated(hasDevSession);
        setApiAccessToken(hasDevSession ? devAuthAccessToken : null);
        setLoading(false);
        return;
      }

      try {
        const currentSession = await getCurrentSession();
        if (!mounted) return;
        setSession(currentSession);
        setApiAccessToken(currentSession?.access_token || null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initializeSession();
    const subscription = supabase?.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setApiAccessToken(nextSession?.access_token || null);
    });

    return () => {
      mounted = false;
      subscription?.data?.subscription?.unsubscribe();
    };
  }, []);

  const signInWithDevBypass = useCallback(() => {
    if (!isDevAuthBypassEnabled) return;
    window.localStorage.setItem(devSessionStorageKey, "1");
    setDevAuthenticated(true);
    setApiAccessToken(devAuthAccessToken);
  }, []);

  const value = useMemo(
    () => ({
      configured: isAuthConfigured,
      devBypassEnabled: isDevAuthBypassEnabled,
      isAuthenticated: Boolean(session) || devAuthenticated,
      loading,
      session,
      user: devAuthenticated ? devAuthUser : mapSupabaseUser(session?.user || null),
      signInWithGoogle,
      signInWithDevBypass,
      logout
    }),
    [devAuthenticated, loading, logout, session, signInWithDevBypass]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
