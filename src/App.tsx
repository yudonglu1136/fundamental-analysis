import { Routes, Route } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Home } from "./routes/Home";
import { StockDashboard } from "./routes/StockDashboard";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="stocks/:ticker" element={<StockDashboard />} />
      </Route>
    </Routes>
  );
}
