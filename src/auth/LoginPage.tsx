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
    <div className="flex min-h-screen items-center justify-center bg-[#05070b] px-4 py-10 text-white">
      <div className="tf-command-surface relative w-full max-w-md overflow-hidden p-6">
        <div className="tf-scan-line" />
        <div className="flex items-center gap-3">
          <span className="border border-cyan-300/30 bg-cyan-300/10 p-2 text-cyan-100">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div>
            <p className="tf-kicker">ThesisForge</p>
            <h1 className="text-2xl font-semibold text-white">Sign in</h1>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-400">
          Access is restricted to authenticated beta users. Continue with the Google account approved for this workspace.
        </p>

        {!configured && devBypassEnabled ? (
          <div className="mt-5 border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm leading-6 text-cyan-100/80">
            Local workspace access is enabled for this environment.
          </div>
        ) : !configured ? (
          <div className="mt-5 border border-amber-300/25 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
            Authentication is not configured for this deployment.
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 border border-red-300/25 bg-red-300/10 p-4 text-sm leading-6 text-red-100">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          disabled={(!configured && !devBypassEnabled) || submitting || loading}
          onClick={handleGoogleSignIn}
          className="mt-6 flex w-full items-center justify-center gap-2 border border-cyan-300/30 bg-cyan-300/15 px-4 py-3 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-300/25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-slate-500"
        >
          <Chrome className="h-4 w-4" />
          {submitting ? "Redirecting" : configured ? "Continue with Google" : "Enter Workspace"}
        </button>
      </div>
    </div>
  );
}
