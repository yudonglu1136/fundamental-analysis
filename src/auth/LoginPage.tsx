import { useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Chrome, LockKeyhole } from "lucide-react";
import { useAuth } from "./useAuth";

function safeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function LoginPage() {
  const { configured, devBypassEnabled, isAuthenticated, loading, signInWithDevBypass, signInWithGoogle } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const redirectPath = useMemo(() => safeRedirectPath(searchParams.get("redirectTo")), [searchParams]);

  if (!loading && isAuthenticated) {
    return <Navigate to={redirectPath} replace />;
  }

  async function handleGoogleSignIn() {
    setError(null);
    setSubmitting(true);
    try {
      if (!configured && devBypassEnabled) {
        signInWithDevBypass();
        navigate(redirectPath, { replace: true });
        return;
      }
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("redirectTo", redirectPath);
      await signInWithGoogle(callbackUrl.toString());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist bg-grid px-4 py-10 text-ink">
      <div className="w-full max-w-md border border-ink/15 bg-white p-6 shadow-panel">
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-ink p-2 text-white">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div>
            <p className="ontology-label">Fundamental Analysis</p>
            <h1 className="text-2xl font-semibold">Sign in</h1>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Access is restricted to authenticated beta users. Continue with the Google account approved for this workspace.
        </p>

        {!configured && devBypassEnabled ? (
          <div className="mt-5 border border-ink/15 bg-slate-50 p-4 text-sm leading-6 text-ink/70">
            Local workspace access is enabled for this environment.
          </div>
        ) : !configured ? (
          <div className="mt-5 border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            Authentication is not configured for this deployment.
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          disabled={(!configured && !devBypassEnabled) || submitting || loading}
          onClick={handleGoogleSignIn}
          className="mt-6 flex w-full items-center justify-center gap-2 bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <Chrome className="h-4 w-4" />
          {submitting ? "Redirecting" : configured ? "Continue with Google" : "Enter Workspace"}
        </button>
      </div>
    </div>
  );
}
