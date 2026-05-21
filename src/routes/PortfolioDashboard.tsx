import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarDays, Database, Download, Landmark, Plus, RefreshCw, ShieldCheck, Trash2, TrendingUp } from "lucide-react";
import { apiFetch } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { useAppShell } from "../components/layout/AppShell";
import { SectionCard } from "../components/shared/SectionCard";

type PortfolioHistoryRow = {
  date: string;
  label: string;
  portfolioValue: number | null;
  totalProfit: number | null;
  totalProfitPct: number | null;
  deposited: number | null;
  withdrawn: number | null;
  dividends: number | null;
  taxes: number | null;
  cashFunds: number | null;
  sp500MarketPerformancePct: number | null;
};

type Holding = {
  id: string;
  accountName: string;
  assetType: "stock" | "bond";
  symbol: string;
  name: string | null;
  quantity: number;
  currency: string;
  market: string | null;
  couponRate: number | null;
  maturityDate: string | null;
  notes: string | null;
};

type IncomeEvent = {
  id: string;
  holdingId: string | null;
  accountName: string;
  assetType: "stock" | "bond";
  symbol: string;
  eventDate: string;
  exDate: string | null;
  payDate: string | null;
  amountPerUnit: number | null;
  quantity: number | null;
  grossAmount: number | null;
  currency: string;
  status: string;
  sourceType: string;
  sourceUrl: string | null;
  notes: string | null;
};

type PortfolioSnapshot = {
  account: {
    email: string | null;
    accountKey: string;
    localDev: boolean;
    seededFromWorkbook: boolean;
    seedSource: string | null;
  };
  summary: {
    latestPortfolioValue: number | null;
    firstPortfolioValue: number | null;
    totalDeposited: number;
    totalWithdrawn: number;
    totalProfit: number;
    cashFunds: number | null;
    latestMonth: string | null;
    nextIncome: IncomeEvent | null;
  };
  history: PortfolioHistoryRow[];
  holdings: Holding[];
  incomeEvents: IncomeEvent[];
  refresh?: {
    refreshed: Array<{ symbol: string; events: number }>;
    errors: Array<{ symbol: string; message: string }>;
    source: string;
  };
};

type AnnualTotalsRow = {
  year: string;
  deposited: number;
  withdrawn: number;
  netContribution: number;
  dividends: number;
  totalProfit: number;
  endingValue: number | null;
  scheduledIncome: number;
  stockIncome: number;
  bondIncome: number;
};

const emptyHolding = {
  accountName: "Main",
  assetType: "stock",
  symbol: "",
  name: "",
  quantity: "",
  currency: "USD",
  market: "US",
  couponRate: "",
  maturityDate: "",
  notes: "",
};

const emptyIncome = {
  holdingId: "",
  symbol: "",
  accountName: "Main",
  assetType: "bond",
  eventDate: "",
  payDate: "",
  amountPerUnit: "",
  quantity: "",
  grossAmount: "",
  currency: "USD",
  notes: "",
};

const pieColors = ["#3adbea", "#55f5b0", "#ffcc66", "#7dd3fc", "#ff8f86", "#c4b5fd"];

function money(value: number | null | undefined, currency = "USD", maximumFractionDigits?: number) {
  if (value == null || Number.isNaN(value)) return "N/A";
  const digits = maximumFractionDigits ?? (Math.abs(value) < 100 ? 2 : 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: digits }).format(value);
}

function pct(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${Number(value).toFixed(2)}%`;
}

function numberText(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "N/A";
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function yearFromDate(date: string | null | undefined) {
  return date?.slice(0, 4) ?? "";
}

function incomeGross(event: IncomeEvent) {
  if (event.grossAmount != null && Number.isFinite(Number(event.grossAmount))) return Number(event.grossAmount);
  if (event.amountPerUnit != null && event.quantity != null) return Number(event.amountPerUnit) * Number(event.quantity);
  return 0;
}

function monthName(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatTile({
  icon,
  label,
  value,
  note,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  tone?: "neutral" | "positive" | "warning";
}) {
  const toneClass =
    tone === "positive"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-white text-ink";
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
        <span className="text-slate-500">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-normal">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{note}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="text-sm font-medium text-slate-600">
      {label}
      {children}
    </label>
  );
}

const inputClass = "mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-ink";

export function PortfolioDashboard() {
  const { user } = useAuth();
  const { setCurrentModule } = useAppShell();
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [holdingForm, setHoldingForm] = useState(emptyHolding);
  const [incomeForm, setIncomeForm] = useState(emptyIncome);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const payload = await apiFetch<PortfolioSnapshot>("/api/portfolio/snapshot");
      setSnapshot(payload);
      setLoadState("ready");
      setMessage(null);
    } catch (error) {
      setLoadState("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    setCurrentModule(undefined);
    void load();
    return () => setCurrentModule(undefined);
  }, [load, setCurrentModule]);

  const chartRows = useMemo(
    () =>
      (snapshot?.history ?? []).map((row) => ({
        ...row,
        flowIn: row.deposited ?? 0,
        flowOut: row.withdrawn ? -Math.abs(row.withdrawn) : 0,
        totalProfitPctDecimal: row.totalProfitPct == null ? null : row.totalProfitPct / 100,
        sp500PctDecimal: row.sp500MarketPerformancePct == null ? null : row.sp500MarketPerformancePct / 100,
      })),
    [snapshot?.history],
  );

  const calendarEvents = useMemo(
    () =>
      [...(snapshot?.incomeEvents ?? [])].sort(
        (left, right) => left.eventDate.localeCompare(right.eventDate) || left.symbol.localeCompare(right.symbol),
      ),
    [snapshot?.incomeEvents],
  );

  const bondHoldings = useMemo(() => snapshot?.holdings.filter((holding) => holding.assetType === "bond") ?? [], [snapshot?.holdings]);

  const annualTotals = useMemo(() => {
    const buckets = new Map<string, AnnualTotalsRow>();
    const ensureBucket = (year: string) => {
      if (!buckets.has(year)) {
        buckets.set(year, {
          year,
          deposited: 0,
          withdrawn: 0,
          netContribution: 0,
          dividends: 0,
          totalProfit: 0,
          endingValue: null,
          scheduledIncome: 0,
          stockIncome: 0,
          bondIncome: 0,
        });
      }
      return buckets.get(year)!;
    };

    for (const row of snapshot?.history ?? []) {
      const year = yearFromDate(row.date);
      if (!year) continue;
      const bucket = ensureBucket(year);
      bucket.deposited += Number(row.deposited ?? 0);
      bucket.withdrawn += Number(row.withdrawn ?? 0);
      bucket.netContribution = bucket.deposited - bucket.withdrawn;
      bucket.dividends += Number(row.dividends ?? 0);
      bucket.totalProfit += Number(row.totalProfit ?? 0);
      if (row.portfolioValue != null) bucket.endingValue = Number(row.portfolioValue);
    }

    for (const event of snapshot?.incomeEvents ?? []) {
      const year = yearFromDate(event.eventDate);
      if (!year) continue;
      const gross = incomeGross(event);
      const bucket = ensureBucket(year);
      bucket.scheduledIncome += gross;
      if (event.assetType === "stock") bucket.stockIncome += gross;
      if (event.assetType === "bond") bucket.bondIncome += gross;
    }

    return [...buckets.values()].sort((left, right) => left.year.localeCompare(right.year));
  }, [snapshot?.history, snapshot?.incomeEvents]);

  const annualDepositPie = useMemo(
    () => annualTotals.filter((row) => row.deposited > 0).map((row) => ({ name: row.year, value: row.deposited })),
    [annualTotals],
  );

  const annualChartRows = useMemo(
    () =>
      annualTotals.map((row) => ({
        ...row,
        totalIncome: row.dividends + row.scheduledIncome,
      })),
    [annualTotals],
  );

  const currentYearIncome = useMemo(() => {
    const currentYear = String(new Date().getFullYear());
    const row = annualTotals.find((item) => item.year === currentYear);
    return row ? row.dividends + row.scheduledIncome : 0;
  }, [annualTotals]);

  function updateHolding(key: keyof typeof emptyHolding, value: string) {
    setHoldingForm((current) => ({ ...current, [key]: value }));
  }

  function updateIncome(key: keyof typeof emptyIncome, value: string) {
    setIncomeForm((current) => ({ ...current, [key]: value }));
  }

  async function saveHolding() {
    setSaving(true);
    try {
      const payload = await apiFetch<PortfolioSnapshot>("/api/portfolio/holdings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...holdingForm,
          quantity: Number(holdingForm.quantity || 0),
          couponRate: holdingForm.couponRate ? Number(holdingForm.couponRate) : null,
        }),
      });
      setSnapshot(payload);
      setHoldingForm(emptyHolding);
      setMessage("Holding saved.");
    } finally {
      setSaving(false);
    }
  }

  async function saveIncomeEvent() {
    setSaving(true);
    try {
      const holding = bondHoldings.find((item) => item.id === incomeForm.holdingId);
      const payload = await apiFetch<PortfolioSnapshot>("/api/portfolio/income-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...incomeForm,
          symbol: incomeForm.symbol || holding?.symbol,
          accountName: holding?.accountName ?? incomeForm.accountName,
          holdingId: holding?.id ?? null,
          amountPerUnit: incomeForm.amountPerUnit ? Number(incomeForm.amountPerUnit) : null,
          quantity: incomeForm.quantity ? Number(incomeForm.quantity) : holding?.quantity ?? null,
          grossAmount: incomeForm.grossAmount ? Number(incomeForm.grossAmount) : null,
        }),
      });
      setSnapshot(payload);
      setIncomeForm(emptyIncome);
      setMessage("Income event saved.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteHolding(id: string) {
    const payload = await apiFetch<PortfolioSnapshot>(`/api/portfolio/holdings/${encodeURIComponent(id)}`, { method: "DELETE" });
    setSnapshot(payload);
  }

  async function deleteIncomeEvent(id: string) {
    const payload = await apiFetch<PortfolioSnapshot>(`/api/portfolio/income-events/${encodeURIComponent(id)}`, { method: "DELETE" });
    setSnapshot(payload);
  }

  async function refreshDividends() {
    setSaving(true);
    try {
      const payload = await apiFetch<PortfolioSnapshot>("/api/portfolio/stock-dividends/refresh", { method: "POST" });
      setSnapshot(payload);
      const refreshed = payload.refresh?.refreshed.map((item) => `${item.symbol}: ${item.events}`).join(", ") || "none";
      const errors = payload.refresh?.errors.length ? ` Errors: ${payload.refresh.errors.map((item) => `${item.symbol} ${item.message}`).join("; ")}` : "";
      setMessage(`Dividend refresh complete. ${refreshed}.${errors}`);
    } finally {
      setSaving(false);
    }
  }

  if (loadState === "loading") {
    return <div className="tf-object-panel p-8 text-sm text-slate-400">Loading private portfolio workspace...</div>;
  }

  if (loadState === "error" || !snapshot) {
    return (
      <div className="tf-object-panel p-8 text-sm text-slate-300">
        <p className="font-semibold text-white">Portfolio API is unavailable.</p>
        <p className="mt-2">{message}</p>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="tf-command-surface relative overflow-hidden p-4 sm:p-5">
        <div className="tf-scan-line" />
        <p className="tf-kicker">Private Portfolio Workspace</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-4xl">Net Worth, Positions, and Income Calendar</h1>
        <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-400">
          Account scope: {snapshot.account.email ?? user?.email ?? "private account"} · isolated account database
        </p>
      </div>

      <div className="tf-stock-module-canvas space-y-6 border border-white/10 bg-[#05070b]/70 p-3 shadow-[0_28px_90px_rgba(0,0,0,0.34)] sm:p-4 lg:p-6">
        {message ? <div className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 p-3 text-sm text-cyan-100">{message}</div> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatTile icon={<TrendingUp className="h-4 w-4" />} label="Latest Net Worth" value={money(snapshot.summary.latestPortfolioValue)} note={snapshot.summary.latestMonth ?? "Latest month"} tone="positive" />
          <StatTile icon={<Download className="h-4 w-4" />} label="Deposits" value={money(snapshot.summary.totalDeposited)} note="Cumulative imported deposits" />
          <StatTile icon={<Landmark className="h-4 w-4" />} label="Cash Funds" value={money(snapshot.summary.cashFunds)} note="Latest imported cash balance" tone="warning" />
          <StatTile icon={<CalendarDays className="h-4 w-4" />} label="This Year Income" value={money(currentYearIncome)} note={`${new Date().getFullYear()} scheduled cash income`} />
          <StatTile icon={<CalendarDays className="h-4 w-4" />} label="Next Income" value={snapshot.summary.nextIncome ? money(snapshot.summary.nextIncome.grossAmount, snapshot.summary.nextIncome.currency) : "N/A"} note={snapshot.summary.nextIncome ? `${snapshot.summary.nextIncome.symbol} on ${snapshot.summary.nextIncome.eventDate}` : "No upcoming event"} />
        </div>

        <SectionCard title="Annual Totals" description="Imported portfolio rows are grouped by calendar year; calendar income is grouped by pay/event date.">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
            <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={annualChartRows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
                  <Tooltip cursor={{ fill: "rgba(58, 219, 234, 0.07)" }} formatter={(value) => money(Number(value))} />
                  <Legend />
                  <Bar dataKey="deposited" name="Deposited" fill="#3adbea" />
                  <Bar dataKey="withdrawn" name="Withdrawn" fill="#ff6f86" />
                  <Bar dataKey="totalIncome" name="Income total" fill="#ffcc66" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
              {annualDepositPie.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={annualDepositPie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={104}
                      paddingAngle={3}
                      label={({ name, percent }) => `${name} ${(Number(percent) * 100).toFixed(0)}%`}
                    >
                      {annualDepositPie.map((entry, index) => (
                        <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => money(Number(value))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">No annual deposits yet.</div>
              )}
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
                <tr>
                  <th className="px-3 py-2">Year</th>
                  <th className="px-3 py-2">Deposited</th>
                  <th className="px-3 py-2">Withdrawn</th>
                  <th className="px-3 py-2">Net Flow</th>
                  <th className="px-3 py-2">Profit</th>
                  <th className="px-3 py-2">Imported Dividends</th>
                  <th className="px-3 py-2">Calendar Income</th>
                  <th className="px-3 py-2">Ending Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {annualTotals.map((row) => (
                  <tr key={row.year}>
                    <td className="px-3 py-2 font-semibold text-ink">{row.year}</td>
                    <td className="px-3 py-2 text-slate-600">{money(row.deposited)}</td>
                    <td className="px-3 py-2 text-slate-600">{money(row.withdrawn)}</td>
                    <td className="px-3 py-2 text-slate-600">{money(row.netContribution)}</td>
                    <td className="px-3 py-2 text-slate-600">{money(row.totalProfit)}</td>
                    <td className="px-3 py-2 text-slate-600">{money(row.dividends)}</td>
                    <td className="px-3 py-2 text-slate-600">{money(row.scheduledIncome)}</td>
                    <td className="px-3 py-2 text-slate-600">{money(row.endingValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Portfolio History" description="Monthly net worth history from the imported portfolio report.">
        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis yAxisId="left" tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} />
                <Tooltip formatter={(value, name) => (String(name).includes("%") ? `${(Number(value) * 100).toFixed(2)}%` : money(Number(value)))} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="portfolioValue" name="Portfolio value" stroke="#0891b2" strokeWidth={2.5} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="totalProfitPctDecimal" name="Monthly return %" stroke="#16a34a" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="sp500PctDecimal" name="S&P 500 %" stroke="#64748b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
                <Tooltip cursor={{ fill: "rgba(58, 219, 234, 0.07)" }} formatter={(value) => money(Number(value))} />
                <Legend />
                <Bar dataKey="flowIn" name="Deposited" fill="#0f766e" />
                <Bar dataKey="flowOut" name="Withdrawn" fill="#e11d48" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        </SectionCard>

        <SectionCard title="Current Holdings" description="US stock and bond positions are stored in the signed-in account database.">
        <div className="grid gap-3 lg:grid-cols-9">
          <Field label="Type">
            <select className={inputClass} value={holdingForm.assetType} onChange={(event) => updateHolding("assetType", event.target.value)}>
              <option value="stock">Stock</option>
              <option value="bond">Bond</option>
            </select>
          </Field>
          <Field label="Account">
            <input className={inputClass} value={holdingForm.accountName} onChange={(event) => updateHolding("accountName", event.target.value)} />
          </Field>
          <Field label="Symbol / CUSIP">
            <input className={inputClass} value={holdingForm.symbol} onChange={(event) => updateHolding("symbol", event.target.value)} />
          </Field>
          <Field label="Name">
            <input className={inputClass} value={holdingForm.name} onChange={(event) => updateHolding("name", event.target.value)} />
          </Field>
          <Field label="Quantity">
            <input className={inputClass} type="number" step="0.0001" value={holdingForm.quantity} onChange={(event) => updateHolding("quantity", event.target.value)} />
          </Field>
          <Field label="Currency">
            <input className={inputClass} value={holdingForm.currency} onChange={(event) => updateHolding("currency", event.target.value)} />
          </Field>
          <Field label="Coupon %">
            <input className={inputClass} type="number" step="0.0001" value={holdingForm.couponRate} onChange={(event) => updateHolding("couponRate", event.target.value)} />
          </Field>
          <Field label="Maturity">
            <input className={inputClass} type="date" value={holdingForm.maturityDate} onChange={(event) => updateHolding("maturityDate", event.target.value)} />
          </Field>
          <div className="flex items-end">
            <button type="button" disabled={saving || !holdingForm.symbol} onClick={() => void saveHolding()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              <Plus className="h-4 w-4" />
              Save
            </button>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Symbol</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Quantity</th>
                <th className="px-3 py-2">Coupon</th>
                <th className="px-3 py-2">Maturity</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {snapshot.holdings.map((holding) => (
                <tr key={holding.id}>
                  <td className="px-3 py-2 font-semibold text-ink">{holding.assetType}</td>
                  <td className="px-3 py-2 text-slate-600">{holding.accountName}</td>
                  <td className="px-3 py-2 text-slate-600">{holding.symbol}</td>
                  <td className="px-3 py-2 text-slate-600">{holding.name ?? "-"}</td>
                  <td className="px-3 py-2 text-slate-600">{numberText(holding.quantity)}</td>
                  <td className="px-3 py-2 text-slate-600">{holding.couponRate == null ? "-" : `${holding.couponRate}%`}</td>
                  <td className="px-3 py-2 text-slate-600">{holding.maturityDate ?? "-"}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => void deleteHolding(holding.id)} className="inline-flex items-center gap-1 text-rose-700">
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {snapshot.holdings.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-500" colSpan={8}>No holdings saved yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        </SectionCard>

        <SectionCard title="Income Calendar" description="Stocks are refreshed from public dividend endpoints; bonds and notes are entered manually.">
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={saving} onClick={() => void refreshDividends()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40">
            <RefreshCw className="h-4 w-4" />
            Refresh Stock Dividends
          </button>
          <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
            <ShieldCheck className="h-4 w-4" />
            Account-scoped database
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
            <Database className="h-4 w-4" />
            Seed: {snapshot.account.seedSource ?? "none"}
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-8">
          <Field label="Bond holding">
            <select
              className={inputClass}
              value={incomeForm.holdingId}
              onChange={(event) => {
                const holding = bondHoldings.find((item) => item.id === event.target.value);
                setIncomeForm((current) => ({
                  ...current,
                  holdingId: event.target.value,
                  symbol: holding?.symbol ?? current.symbol,
                  accountName: holding?.accountName ?? current.accountName,
                  quantity: holding?.quantity != null ? String(holding.quantity) : current.quantity,
                  currency: holding?.currency ?? current.currency,
                }));
              }}
            >
              <option value="">Manual symbol</option>
              {bondHoldings.map((holding) => (
                <option key={holding.id} value={holding.id}>{holding.symbol} · {holding.accountName}</option>
              ))}
            </select>
          </Field>
          <Field label="Symbol">
            <input className={inputClass} value={incomeForm.symbol} onChange={(event) => updateIncome("symbol", event.target.value)} />
          </Field>
          <Field label="Pay date">
            <input className={inputClass} type="date" value={incomeForm.eventDate} onChange={(event) => updateIncome("eventDate", event.target.value)} />
          </Field>
          <Field label="Amount / unit">
            <input className={inputClass} type="number" step="0.0001" value={incomeForm.amountPerUnit} onChange={(event) => updateIncome("amountPerUnit", event.target.value)} />
          </Field>
          <Field label="Quantity">
            <input className={inputClass} type="number" step="0.0001" value={incomeForm.quantity} onChange={(event) => updateIncome("quantity", event.target.value)} />
          </Field>
          <Field label="Gross amount">
            <input className={inputClass} type="number" step="0.01" value={incomeForm.grossAmount} onChange={(event) => updateIncome("grossAmount", event.target.value)} />
          </Field>
          <Field label="Currency">
            <input className={inputClass} value={incomeForm.currency} onChange={(event) => updateIncome("currency", event.target.value)} />
          </Field>
          <div className="flex items-end">
            <button type="button" disabled={saving || (!incomeForm.symbol && !incomeForm.holdingId) || !incomeForm.eventDate} onClick={() => void saveIncomeEvent()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-ink">Upcoming Cash Income</p>
            <div className="mt-4 space-y-3">
              {calendarEvents.slice(0, 8).map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-b-0">
                  <div>
                    <p className="font-semibold text-ink">{event.symbol}</p>
                    <p className="text-sm text-slate-500">{monthName(event.eventDate)} · {event.assetType} · {event.status}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{money(event.grossAmount, event.currency)}</p>
                </div>
              ))}
              {calendarEvents.length === 0 ? <p className="text-sm text-slate-500">No income events saved yet.</p> : null}
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Per Unit</th>
                  <th className="px-3 py-2">Quantity</th>
                  <th className="px-3 py-2">Gross</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {calendarEvents.map((event) => (
                  <tr key={event.id}>
                    <td className="px-3 py-2 font-semibold text-ink">{event.eventDate}</td>
                    <td className="px-3 py-2 text-slate-600">{event.symbol}</td>
                    <td className="px-3 py-2 text-slate-600">{event.assetType}</td>
                    <td className="px-3 py-2 text-slate-600">{money(event.amountPerUnit, event.currency, 4)}</td>
                    <td className="px-3 py-2 text-slate-600">{numberText(event.quantity)}</td>
                    <td className="px-3 py-2 text-slate-600">{money(event.grossAmount, event.currency)}</td>
                    <td className="px-3 py-2 text-slate-500">{event.sourceType}</td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => void deleteIncomeEvent(event.id)} className="inline-flex items-center gap-1 text-rose-700">
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {calendarEvents.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-slate-500" colSpan={8}>No income events saved yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        </SectionCard>
      </div>
    </section>
  );
}
