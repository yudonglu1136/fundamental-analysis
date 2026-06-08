import { useEffect, useMemo, useState } from "react";
import { Loader2, Radar } from "lucide-react";
import { exchangeAuthCodeForSession } from "./authClient";
import { useAuth } from "./useAuth";

function safeRedirectPath(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/#guru";
  return value;
}

export function AuthCallbackPage() {
  const { isAuthenticated, loading } = useAuth();
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const redirectPath = useMemo(() => safeRedirectPath(searchParams.get("redirectTo")), [searchParams]);
  const code = searchParams.get("code");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function completeSignIn() {
      if (!code) {
        setError("Missing authentication code.");
        return;
      }

      try {
        await exchangeAuthCodeForSession(code);
        if (!cancelled) window.location.replace(redirectPath);
      } catch (nextError) {
        if (!cancelled) setError(nextError?.message || String(nextError));
      }
    }

    completeSignIn();
    return () => {
      cancelled = true;
    };
  }, [code, redirectPath]);

  if (!loading && isAuthenticated) {
    window.location.replace(redirectPath);
    return null;
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-mark">
          <Radar size={22} />
          <span>Guru Intelligence Terminal</span>
        </div>
        <h1>Completing sign in</h1>
        <p>{error ? "Authentication could not be completed." : "Securing your workspace session..."}</p>
        {error ? <div className="auth-note danger">{error}</div> : <Loader2 className="spin auth-loader" size={22} />}
      </section>
    </main>
  );
}
