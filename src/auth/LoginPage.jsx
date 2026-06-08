import { useMemo, useState } from "react";
import { Chrome, Radar } from "lucide-react";
import { useAuth } from "./useAuth";

function safeRedirectPath(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/#guru";
  return value;
}

export function LoginPage() {
  const { configured, devBypassEnabled, isAuthenticated, loading, signInWithDevBypass, signInWithGoogle } = useAuth();
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const redirectPath = useMemo(() => safeRedirectPath(searchParams.get("redirectTo")), [searchParams]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) {
    window.location.replace(redirectPath);
    return null;
  }

  async function handleGoogleSignIn() {
    setError("");
    setSubmitting(true);
    try {
      if (!configured && devBypassEnabled) {
        signInWithDevBypass();
        window.location.replace(redirectPath);
        return;
      }

      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("redirectTo", redirectPath);
      await signInWithGoogle(callbackUrl.toString());
    } catch (nextError) {
      setError(nextError?.message || String(nextError));
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-mark">
          <Radar size={22} />
          <span>Guru Intelligence Terminal</span>
        </div>
        <h1>Sign in</h1>
        <p>Access is restricted to authenticated research users. Continue with the approved Google account.</p>

        {!configured && devBypassEnabled ? (
          <div className="auth-note">Local workspace access is enabled for this environment.</div>
        ) : !configured ? (
          <div className="auth-note warning">Authentication is not configured for this deployment.</div>
        ) : null}

        {error ? <div className="auth-note danger">{error}</div> : null}

        <button
          type="button"
          className="auth-button"
          disabled={(!configured && !devBypassEnabled) || submitting || loading}
          onClick={handleGoogleSignIn}
        >
          <Chrome size={18} />
          <span>{submitting ? "Redirecting" : configured ? "Continue with Google" : "Enter Workspace"}</span>
        </button>
      </section>
    </main>
  );
}
