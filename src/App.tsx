import { lazy, Suspense } from "react";
import { Navigate, Routes, Route } from "react-router-dom";
import { AuthCallbackPage } from "./auth/AuthCallbackPage";
import { LoginPage } from "./auth/LoginPage";
import { ProtectedRoute } from "./auth/ProtectedRoute";

const AppShell = lazy(() => import("./components/layout/AppShell").then((module) => ({ default: module.AppShell })));
const Home = lazy(() => import("./routes/Home").then((module) => ({ default: module.Home })));
const PortfolioDashboard = lazy(() => import("./routes/PortfolioDashboard").then((module) => ({ default: module.PortfolioDashboard })));
const StockDashboard = lazy(() => import("./routes/StockDashboard").then((module) => ({ default: module.StockDashboard })));

export default function App() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading research workspace...</div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<AppShell />}>
            <Route index element={<Home />} />
            <Route path="portfolio" element={<PortfolioDashboard />} />
            <Route path="stocks/:ticker" element={<StockDashboard />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
