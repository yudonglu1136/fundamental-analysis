import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";

export function ProtectedRoute() {
  const { loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mist text-ink">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-panel">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Loading session</p>
          <p className="mt-2 text-lg font-semibold">Checking your Google sign-in.</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const redirectTo = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?redirectTo=${redirectTo}`} replace />;
  }

  return <Outlet />;
}
