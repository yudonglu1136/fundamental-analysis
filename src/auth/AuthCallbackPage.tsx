import { useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { exchangeAuthCodeForSession } from "./authClient";
import { useAuth } from "./useAuth";
import { ThesisForgeLogo } from "../components/layout/ThesisForgeLogo";

function safeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function AuthCallbackPage() {
  const { isAuthenticated, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const redirectPath = useMemo(() => safeRedirectPath(searchParams.get("redirectTo")), [searchParams]);
  const code = searchParams.get("code");

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
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    }
    completeSignIn();
    return () => {
      cancelled = true;
    };
  }, [code, redirectPath]);

  if (!loading && isAuthenticated) {
    return <Navigate to={redirectPath} replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist bg-grid px-4 py-10 text-ink">
      <div className="tf-command-surface w-full max-w-md p-6 text-white">
        <ThesisForgeLogo showWordmark />
        <h1 className="mt-5 text-2xl font-semibold">Completing sign in</h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          {error ? "Authentication could not be completed." : "Securing your workspace session..."}
        </p>
        {error ? (
          <div className="mt-5 border border-red-300/25 bg-red-300/10 p-4 text-sm leading-6 text-red-100">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
