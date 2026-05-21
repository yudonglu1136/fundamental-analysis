import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  latestPrice: number | null;
  latestPriceAt: string | null;
  latestPriceSource: string | null;
  manualMarketValue: number | null;
  logoUrl: string | null;
  logoSource: string | null;
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
  priceRefresh?: {
    refreshed: Array<{ symbol: string; price: number; currency: string }>;
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

type HoldingTheme = {
  color: string;
  logoBackground: string;
  logoTile: string;
  logoText: string;
};

type CompositionPieRow = {
  name: string;
  value: number;
  type: string;
  symbol: string;
  logoUrl: string | null;
  color: string;
  labelRank: number;
};

type PassiveIncomeMonth = {
  month: string;
  paid: number;
  declared: number;
  estimated: number;
  stock: number;
  bond: number;
  total: number;
  events: IncomeEvent[];
};

type TooltipPayloadItem = {
  name?: string;
  value?: number | string | null;
  color?: string;
  dataKey?: string;
  payload?: unknown;
};

const emptyHolding = {
  accountName: "Main",
  assetType: "stock",
  symbol: "",
  name: "",
  quantity: "",
  currency: "USD",
  market: "US",
  manualMarketValue: "",
  logoUrl: "",
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
const incomeStatusColors = {
  paid: "#9b6dff",
  declared: "#18c7ff",
  estimated: "#63a9ff",
};
const cashTheme: HoldingTheme = {
  color: "#8fa3b8",
  logoBackground: "linear-gradient(135deg, #1f2937 0%, #64748b 100%)",
  logoTile: "rgba(255, 255, 255, 0.94)",
  logoText: "#334155",
};

const holdingThemes: Record<string, HoldingTheme> = {
  DBMF: {
    color: "#94a3b8",
    logoBackground: "linear-gradient(135deg, #e5edf7 0%, #ffffff 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#64748b",
  },
  GOOG: {
    color: "#4285f4",
    logoBackground: "linear-gradient(135deg, #4285f4 0%, #34a853 52%, #fbbc05 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#174ea6",
  },
  IBKR: {
    color: "#d71920",
    logoBackground: "linear-gradient(135deg, #111827 0%, #d71920 100%)",
    logoTile: "rgba(255, 255, 255, 0.95)",
    logoText: "#d71920",
  },
  ISRG: {
    color: "#d1d5db",
    logoBackground: "linear-gradient(135deg, #111827 0%, #9ca3af 100%)",
    logoTile: "rgba(255, 255, 255, 0.98)",
    logoText: "#374151",
  },
  LEGN: {
    color: "#c084fc",
    logoBackground: "linear-gradient(135deg, #f5f3ff 0%, #c084fc 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#7e22ce",
  },
  LSEG: {
    color: "#00a3e0",
    logoBackground: "linear-gradient(135deg, #001f4f 0%, #00a3e0 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#005eb8",
  },
  MCK: {
    color: "#0072ce",
    logoBackground: "linear-gradient(135deg, #0072ce 0%, #f58220 100%)",
    logoTile: "rgba(255, 255, 255, 0.95)",
    logoText: "#0072ce",
  },
  MSFT: {
    color: "#7fba00",
    logoBackground: "linear-gradient(135deg, #f25022 0%, #7fba00 38%, #00a4ef 70%, #ffb900 100%)",
    logoTile: "rgba(255, 255, 255, 0.96)",
    logoText: "#2563eb",
  },
  NOW: {
    color: "#00a862",
    logoBackground: "linear-gradient(135deg, #032d42 0%, #00a862 100%)",
    logoTile: "rgba(255, 255, 255, 0.95)",
    logoText: "#047857",
  },
  PLTR: {
    color: "#111827",
    logoBackground: "linear-gradient(135deg, #050505 0%, #4b5563 100%)",
    logoTile: "rgba(255, 255, 255, 0.94)",
    logoText: "#111827",
  },
  QQQ: {
    color: "#1d4ed8",
    logoBackground: "linear-gradient(135deg, #0b1f52 0%, #1d4ed8 100%)",
    logoTile: "rgba(255, 255, 255, 0.94)",
    logoText: "#1d4ed8",
  },
};

function themeForSymbol(symbol: string | null | undefined): HoldingTheme {
  return holdingThemes[String(symbol ?? "").toUpperCase()] ?? {
    color: "#38bdf8",
    logoBackground: "linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)",
    logoTile: "rgba(255, 255, 255, 0.95)",
    logoText: "#0369a1",
  };
}

function money(value: number | null | undefined, currency = "USD", maximumFractionDigits?: number) {
  if (value == null || Number.isNaN(value)) return "N/A";
  const digits = maximumFractionDigits ?? (Math.abs(value) < 100 ? 2 : 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: digits }).format(value);
}

function compactMoneyLabel(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  if (Math.abs(numeric) >= 1000) {
    const digits = Math.abs(numeric) >= 10000 ? 0 : 1;
    return `$${(numeric / 1000).toFixed(digits)}K`;
  }
  return `$${Math.round(numeric).toLocaleString("en-US")}`;
}

function svgSafeId(prefix: string, value: string) {
  return `${prefix}-${value.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function pct(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${Number(value).toFixed(2)}%`;
}

function weightPct(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${Number(value).toFixed(1)}%`;
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

function incomeStatusBucket(event: IncomeEvent): "paid" | "declared" | "estimated" {
  const status = event.status.toLowerCase();
  const source = event.sourceType.toLowerCase();
  if (status.includes("estimate") || source.includes("estimate")) return "estimated";
  if (status === "paid") return "paid";
  return "declared";
}

function holdingValue(holding: Holding) {
  if (holding.manualMarketValue != null && Number.isFinite(Number(holding.manualMarketValue))) {
    return Number(holding.manualMarketValue);
  }
  if (holding.latestPrice != null && Number.isFinite(Number(holding.latestPrice))) {
    return Number(holding.latestPrice) * Number(holding.quantity ?? 0);
  }
  return null;
}

function logoFallbackText(symbol: string) {
  return symbol.replace(/[^A-Z0-9]/gi, "").slice(0, 4).toUpperCase() || "?";
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function monthName(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function monthLabel(month: string) {
  const parsed = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return month;
  return parsed.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function monthShortLabel(month: string) {
  const parsed = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return month;
  return parsed.toLocaleDateString("en-US", { month: "short" });
}

function isPassiveIncomeMonth(value: unknown): value is PassiveIncomeMonth {
  return Boolean(
    value &&
      typeof value === "object" &&
      "month" in value &&
      "paid" in value &&
      "declared" in value &&
      "estimated" in value,
  );
}

function GlassTooltip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-[180px] rounded-lg border border-white/15 bg-[linear-gradient(135deg,rgba(4,8,17,0.96)_0%,rgba(15,23,42,0.92)_52%,rgba(30,64,175,0.38)_100%)] px-4 py-3 text-white shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-xl">
      <p className="text-sm font-semibold text-white">{title}</p>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function GenericChartTooltip({
  active,
  payload,
  label,
  valueFormatter = (value: number) => money(value),
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  valueFormatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((item) => item.value != null && item.name !== "total");
  if (!rows.length) return null;
  return (
    <GlassTooltip title={String(label ?? "")}>
      {rows.map((item) => (
        <div key={`${item.name}-${item.dataKey}`} className="flex min-w-[180px] items-center justify-between gap-5 text-sm">
          <span className="inline-flex items-center gap-2 text-slate-100">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color ?? "#f8fafc" }} />
            {item.name ?? item.dataKey}
          </span>
          <span className="font-semibold text-white">{valueFormatter(Number(item.value))}</span>
        </div>
      ))}
    </GlassTooltip>
  );
}

function PassiveIncomeTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  const row = payload.map((item) => item.payload).find(isPassiveIncomeMonth);
  if (!row) return null;
  return (
    <GlassTooltip title={monthLabel(String(label ?? row.month))}>
      <div className="flex min-w-[210px] items-center justify-between gap-5 border-b border-white/10 pb-2 text-sm">
        <span className="text-slate-200">Total</span>
        <span className="font-semibold text-white">{money(row.total, "USD", 2)}</span>
      </div>
      <div className="flex min-w-[210px] items-center justify-between gap-5 text-sm">
        <span className="text-[#c4a8ff]">Paid</span>
        <span className="font-semibold text-white">{money(row.paid, "USD", 2)}</span>
      </div>
      <div className="flex min-w-[210px] items-center justify-between gap-5 text-sm">
        <span className="text-[#6ee7ff]">Declared</span>
        <span className="font-semibold text-white">{money(row.declared, "USD", 2)}</span>
      </div>
      <div className="flex min-w-[210px] items-center justify-between gap-5 text-sm">
        <span className="text-[#9cc9ff]">Estimated</span>
        <span className="font-semibold text-white">{money(row.estimated, "USD", 2)}</span>
      </div>
    </GlassTooltip>
  );
}

function CompositionTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as CompositionPieRow | undefined;
  const value = Number(payload[0]?.value ?? row?.value ?? 0);
  if (!row) return null;
  return (
    <GlassTooltip title={row.name}>
      <div className="flex min-w-[180px] items-center justify-between gap-5 text-sm">
        <span className="text-slate-200">Market value</span>
        <span className="font-semibold text-white">{money(value)}</span>
      </div>
      <div className="flex min-w-[180px] items-center justify-between gap-5 text-sm">
        <span className="text-slate-200">Type</span>
        <span className="font-semibold text-white">{row.type}</span>
      </div>
    </GlassTooltip>
  );
}

function BrightValueLabel({ x, y, width, value }: { x?: number | string; y?: number | string; width?: number | string; value?: number | string }) {
  const label = compactMoneyLabel(value);
  if (!label) return null;
  const centerX = Number(x ?? 0) + Number(width ?? 0) / 2;
  const topY = Number(y ?? 0) - 8;
  return (
    <text className="tf-bright-chart-label" x={centerX} y={topY} textAnchor="middle" fontSize={11} fontWeight={800}>
      {label}
    </text>
  );
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

function LogoBadge({ holding, size = "md" }: { holding: Pick<Holding, "symbol" | "logoUrl">; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "h-12 w-12 text-sm" : size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-xs";
  const theme = themeForSymbol(holding.symbol);
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border font-semibold shadow-[0_10px_24px_rgba(0,0,0,0.18)] ${sizeClass}`}
      style={{ background: theme.logoBackground, borderColor: `${theme.color}99`, color: theme.logoText }}
    >
      <span className="absolute inset-1 flex items-center justify-center rounded-md px-1 text-center leading-none" style={{ background: theme.logoTile }}>
        {logoFallbackText(holding.symbol)}
      </span>
      {holding.logoUrl ? (
        <img
          src={holding.logoUrl}
          alt={`${holding.symbol} logo`}
          className="relative h-[78%] w-[78%] rounded-md object-contain p-0.5"
          style={{ background: theme.logoTile }}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </span>
  );
}

const pieLabelRadian = Math.PI / 180;

function renderPieLogoLabel({
  cx,
  cy,
  midAngle,
  outerRadius,
  percent,
  payload,
}: {
  cx?: number | string;
  cy?: number | string;
  midAngle?: number;
  outerRadius?: number | string;
  percent?: number;
  payload?: CompositionPieRow;
}) {
  const row = payload;
  const share = Number(percent ?? 0);
  if (!row || row.type === "cash" || share < 0.045 || row.labelRank > 5) return null;

  const centerX = Number(cx ?? 0);
  const centerY = Number(cy ?? 0);
  const radius = Number(outerRadius ?? 0);
  const angle = Number(midAngle ?? 0);
  const lineStartX = centerX + (radius + 6) * Math.cos(-angle * pieLabelRadian);
  const lineStartY = centerY + (radius + 6) * Math.sin(-angle * pieLabelRadian);
  const labelX = centerX + (radius + 50) * Math.cos(-angle * pieLabelRadian);
  const labelY = centerY + (radius + 50) * Math.sin(-angle * pieLabelRadian);
  const labelWidth = 112;
  const labelHeight = 38;
  const rightSide = labelX >= centerX;
  const boxX = rightSide ? labelX : labelX - labelWidth;
  const boxY = labelY - labelHeight / 2;
  const lineEndX = rightSide ? boxX : boxX + labelWidth;
  const lineEndY = boxY + labelHeight / 2;
  const theme = themeForSymbol(row.symbol);

  return (
    <g>
      <line x1={lineStartX} y1={lineStartY} x2={lineEndX} y2={lineEndY} stroke={row.color} strokeWidth={1.5} />
      <g transform={`translate(${boxX}, ${boxY})`}>
        <rect width={labelWidth} height={labelHeight} rx={10} fill="#070b12" stroke={row.color} strokeOpacity={0.72} />
        <rect x={5} y={5} width={28} height={28} rx={7} fill={theme.logoTile} />
        {row.logoUrl ? (
          <image href={row.logoUrl} x={8} y={8} width={22} height={22} preserveAspectRatio="xMidYMid meet" />
        ) : (
          <text x={19} y={23} textAnchor="middle" fontSize={8} fontWeight={700} fill={theme.logoText}>
            {logoFallbackText(row.symbol)}
          </text>
        )}
        <text x={39} y={16} fontSize={10} fontWeight={800} fill="#ffffff" stroke="#020617" strokeWidth={0.45} paintOrder="stroke">
          {row.name}
        </text>
        <text x={39} y={30} fontSize={10} fontWeight={700} fill="#ffffff" stroke="#020617" strokeWidth={0.35} paintOrder="stroke">
          {weightPct(share * 100)}
        </text>
      </g>
    </g>
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

  const upcomingEvents = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return calendarEvents.filter((event) => event.eventDate >= today);
  }, [calendarEvents]);

  const bondHoldings = useMemo(() => snapshot?.holdings.filter((holding) => holding.assetType === "bond") ?? [], [snapshot?.holdings]);

  const composition = useMemo(() => {
    const latestNav = Number(snapshot?.summary.latestPortfolioValue ?? 0);
    const rows = (snapshot?.holdings ?? [])
      .map((holding) => {
        const marketValue = holdingValue(holding);
        return {
          ...holding,
          marketValue,
          navWeight: latestNav > 0 && marketValue != null ? (marketValue / latestNav) * 100 : null,
        };
      })
      .sort((left, right) => Number(right.marketValue ?? 0) - Number(left.marketValue ?? 0));
    const allocated = rows.reduce((sum, row) => sum + Number(row.marketValue ?? 0), 0);
    const residual = Math.max(latestNav - allocated, 0);
    const overAllocated = Math.max(allocated - latestNav, 0);
    const positionRows = rows.filter((row) => Number(row.marketValue ?? 0) > 0);
    const pieRows = [
      ...positionRows.map((row, index) => {
        const theme = themeForSymbol(row.symbol);
        return {
          name: row.symbol,
          value: Number(row.marketValue),
          type: row.assetType,
          symbol: row.symbol,
          logoUrl: row.logoUrl,
          color: theme.color,
          labelRank: index,
        };
      }),
      ...(residual > 0
        ? [
            {
              name: "Cash / Unallocated",
              value: residual,
              type: "cash",
              symbol: "CASH",
              logoUrl: null,
              color: cashTheme.color,
              labelRank: positionRows.length,
            },
          ]
        : []),
    ] satisfies CompositionPieRow[];
    return {
      rows,
      allocated,
      residual,
      overAllocated,
      navCoverage: latestNav > 0 ? (allocated / latestNav) * 100 : 0,
      pieRows,
      topRows: rows.filter((row) => Number(row.marketValue ?? 0) > 0).slice(0, 8),
    };
  }, [snapshot?.holdings, snapshot?.summary.latestPortfolioValue]);

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
        totalIncome: Math.max(row.dividends, row.scheduledIncome),
      })),
    [annualTotals],
  );

  const passiveIncomeMonths = useMemo(() => {
    const buckets = new Map<string, PassiveIncomeMonth>();
    const calendarYear = new Date().getFullYear();
    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const key = `${calendarYear}-${String(monthIndex + 1).padStart(2, "0")}`;
      buckets.set(key, { month: key, paid: 0, declared: 0, estimated: 0, stock: 0, bond: 0, total: 0, events: [] });
    }
    const explicitPaidMonths = new Set<string>();
    for (const event of snapshot?.incomeEvents ?? []) {
      if (yearFromDate(event.eventDate) !== String(calendarYear)) continue;
      const key = monthKey(event.eventDate);
      const bucket = buckets.get(key)!;
      const gross = incomeGross(event);
      const statusBucket = incomeStatusBucket(event);
      bucket[statusBucket] += gross;
      if (event.assetType === "stock") bucket.stock += gross;
      if (event.assetType === "bond") bucket.bond += gross;
      bucket.total += gross;
      bucket.events.push(event);
      if (statusBucket === "paid") explicitPaidMonths.add(key);
    }
    for (const row of snapshot?.history ?? []) {
      if (yearFromDate(row.date) !== String(calendarYear) || Number(row.dividends ?? 0) <= 0) continue;
      const key = monthKey(row.date);
      if (explicitPaidMonths.has(key)) continue;
      const bucket = buckets.get(key)!;
      const gross = Number(row.dividends ?? 0);
      bucket.paid += gross;
      bucket.stock += gross;
      bucket.total += gross;
    }
    return [...buckets.values()].sort((left, right) => left.month.localeCompare(right.month));
  }, [snapshot?.history, snapshot?.incomeEvents]);

  const dividendCalendarSummary = useMemo(() => {
    const annualIncome = passiveIncomeMonths.reduce((sum, month) => sum + month.total, 0);
    const paid = passiveIncomeMonths.reduce((sum, month) => sum + month.paid, 0);
    const declared = passiveIncomeMonths.reduce((sum, month) => sum + month.declared, 0);
    const estimated = passiveIncomeMonths.reduce((sum, month) => sum + month.estimated, 0);
    const yetToReceive = declared + estimated;
    return {
      annualIncome,
      monthlyAverage: annualIncome / 12,
      dailyAverage: annualIncome / 365,
      paid,
      declared,
      estimated,
      yetToReceive,
    };
  }, [passiveIncomeMonths]);

  function updateHolding(key: keyof typeof emptyHolding, value: string) {
    setHoldingForm((current) => ({ ...current, [key]: value }));
  }

  function updateIncome(key: keyof typeof emptyIncome, value: string) {
    setIncomeForm((current) => ({ ...current, [key]: value }));
  }

  async function saveHolding() {
    setSaving(true);
    try {
      const saved = await apiFetch<PortfolioSnapshot>("/api/portfolio/holdings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...holdingForm,
          quantity: Number(holdingForm.quantity || 0),
          manualMarketValue: holdingForm.manualMarketValue ? Number(holdingForm.manualMarketValue) : null,
          couponRate: holdingForm.couponRate ? Number(holdingForm.couponRate) : null,
        }),
      });
      setSnapshot(saved);
      if (holdingForm.assetType === "stock" && Number(holdingForm.quantity || 0) > 0) {
        const priced = await apiFetch<PortfolioSnapshot>("/api/portfolio/holding-prices/refresh", { method: "POST" });
        setSnapshot(priced);
      }
      setHoldingForm(emptyHolding);
      setMessage("Holding saved. Portfolio composition updated.");
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

  async function refreshPrices() {
    setSaving(true);
    try {
      const payload = await apiFetch<PortfolioSnapshot>("/api/portfolio/holding-prices/refresh", { method: "POST" });
      setSnapshot(payload);
      const refreshed = payload.priceRefresh?.refreshed.map((item) => `${item.symbol}: ${money(item.price, item.currency, 2)}`).join(", ") || "none";
      const errors = payload.priceRefresh?.errors.length ? ` Errors: ${payload.priceRefresh.errors.map((item) => `${item.symbol} ${item.message}`).join("; ")}` : "";
      setMessage(`Price refresh complete. ${refreshed}.${errors}`);
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
          <StatTile icon={<CalendarDays className="h-4 w-4" />} label="This Year Income" value={money(dividendCalendarSummary.annualIncome, "USD", 2)} note={`${new Date().getFullYear()} paid, declared, and estimated income`} />
          <StatTile icon={<CalendarDays className="h-4 w-4" />} label="Next Income" value={snapshot.summary.nextIncome ? money(snapshot.summary.nextIncome.grossAmount, snapshot.summary.nextIncome.currency) : "N/A"} note={snapshot.summary.nextIncome ? `${snapshot.summary.nextIncome.symbol} on ${snapshot.summary.nextIncome.eventDate}` : "No upcoming event"} />
        </div>

        <SectionCard title="Annual Totals" description="Imported portfolio rows are grouped by calendar year; calendar income is grouped by pay/event date.">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
            <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={annualChartRows}>
                  <defs>
                    <linearGradient id="annualDepositedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6ee7ff" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#0891b2" stopOpacity={0.52} />
                    </linearGradient>
                    <linearGradient id="annualWithdrawnGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fb7185" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#be123c" stopOpacity={0.48} />
                    </linearGradient>
                    <linearGradient id="annualIncomeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fde68a" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
                  <Tooltip cursor={{ fill: "rgba(58, 219, 234, 0.08)" }} content={<GenericChartTooltip />} />
                  <Legend />
                  <Bar dataKey="deposited" name="Deposited" fill="url(#annualDepositedGradient)" />
                  <Bar dataKey="withdrawn" name="Withdrawn" fill="url(#annualWithdrawnGradient)" />
                  <Bar dataKey="totalIncome" name="Income total" fill="url(#annualIncomeGradient)" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
              {annualDepositPie.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      {annualDepositPie.map((entry, index) => (
                        <radialGradient key={entry.name} id={svgSafeId("annual-deposit-pie", entry.name)} cx="35%" cy="30%" r="72%">
                          <stop offset="0%" stopColor={pieColors[index % pieColors.length]} stopOpacity={0.98} />
                          <stop offset="100%" stopColor={pieColors[index % pieColors.length]} stopOpacity={0.56} />
                        </radialGradient>
                      ))}
                    </defs>
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
                        <Cell key={entry.name} fill={`url(#${svgSafeId("annual-deposit-pie", entry.name)})`} stroke="rgba(255,255,255,0.75)" />
                      ))}
                    </Pie>
                    <Tooltip content={<GenericChartTooltip />} />
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
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartRows}>
                  <defs>
                    <linearGradient id="portfolioValueLineGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.72} />
                      <stop offset="100%" stopColor="#67e8f9" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
                  <Tooltip content={<GenericChartTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="portfolioValue" name="Portfolio value" stroke="url(#portfolioValueLineGradient)" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows}>
                  <defs>
                    <linearGradient id="portfolioReturnGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#86efac" stopOpacity={0.96} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.48} />
                    </linearGradient>
                    <linearGradient id="spyReturnGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#cbd5e1" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#64748b" stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(value) => `${Number(value).toFixed(0)}%`} />
                  <Tooltip cursor={{ fill: "rgba(58, 219, 234, 0.08)" }} content={<GenericChartTooltip valueFormatter={(value) => pct(value)} />} />
                  <Legend />
                  <Bar dataKey="totalProfitPct" name="Portfolio monthly return" fill="url(#portfolioReturnGradient)" barSize={8} />
                  <Bar dataKey="sp500MarketPerformancePct" name="S&P 500 monthly return" fill="url(#spyReturnGradient)" barSize={8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Portfolio Composition" description="Saved positions explain the imported NAV; they do not add to net worth. Residual value stays in Cash / Unallocated.">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">NAV Coverage</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {weightPct(composition.navCoverage)} allocated · {money(composition.residual)} unallocated
                  </p>
                </div>
                <button type="button" disabled={saving} onClick={() => void refreshPrices()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-ink disabled:opacity-40">
                  <RefreshCw className="h-4 w-4" />
                  Refresh Stock Prices
                </button>
              </div>
              <div className="mt-4 h-96">
                {composition.pieRows.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <defs>
                        {composition.pieRows.map((row) => (
                          <radialGradient key={row.name} id={svgSafeId("composition-pie", row.name)} cx="35%" cy="28%" r="76%">
                            <stop offset="0%" stopColor={row.color} stopOpacity={0.98} />
                            <stop offset="58%" stopColor={row.color} stopOpacity={0.82} />
                            <stop offset="100%" stopColor={row.color} stopOpacity={0.5} />
                          </radialGradient>
                        ))}
                      </defs>
                      <Pie
                        data={composition.pieRows}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={64}
                        outerRadius={110}
                        paddingAngle={2}
                        label={renderPieLogoLabel}
                        labelLine={false}
                      >
                        {composition.pieRows.map((row) => (
                          <Cell key={row.name} fill={`url(#${svgSafeId("composition-pie", row.name)})`} stroke="rgba(255,255,255,0.78)" />
                        ))}
                      </Pie>
                      <Tooltip content={<CompositionTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">No allocation rows yet.</div>
                )}
              </div>
              <div className="mt-4 border-t border-slate-200 pt-4">
                <p className="text-sm font-semibold text-ink">Largest Positions</p>
                <div className="mt-3 space-y-2">
                  {composition.topRows.map((holding) => {
                    const theme = themeForSymbol(holding.symbol);
                    return (
                      <div
                        key={holding.id}
                        className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                        style={{
                          borderColor: `${theme.color}55`,
                          background: `linear-gradient(90deg, ${theme.color}18 0%, rgba(15, 23, 42, 0.22) 100%)`,
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <LogoBadge holding={holding} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">{holding.symbol}</p>
                            <p className="truncate text-xs text-slate-500">{holding.name ?? holding.assetType}</p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-slate-800">{money(holding.marketValue, holding.currency)}</p>
                          <p className="text-xs text-slate-500">{weightPct(holding.navWeight)}</p>
                        </div>
                      </div>
                    );
                  })}
                  {composition.topRows.length === 0 ? <p className="text-sm text-slate-500">Add holdings to show logo-backed allocation rows.</p> : null}
                </div>
              </div>
              {composition.overAllocated > 0 ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Positions exceed imported NAV by {money(composition.overAllocated)}.
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="grid gap-3 lg:grid-cols-5">
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
                <Field label="Logo URL">
                  <input className={inputClass} value={holdingForm.logoUrl} onChange={(event) => updateHolding("logoUrl", event.target.value)} />
                </Field>
                <Field label="Quantity">
                  <input className={inputClass} type="number" step="0.0001" value={holdingForm.quantity} onChange={(event) => updateHolding("quantity", event.target.value)} />
                </Field>
                <Field label="Currency">
                  <input className={inputClass} value={holdingForm.currency} onChange={(event) => updateHolding("currency", event.target.value)} />
                </Field>
                <Field label="Manual Value">
                  <input className={inputClass} type="number" step="0.01" value={holdingForm.manualMarketValue} onChange={(event) => updateHolding("manualMarketValue", event.target.value)} />
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
                      <th className="px-3 py-2">Holding</th>
                      <th className="px-3 py-2">Quantity</th>
                      <th className="px-3 py-2">Price</th>
                      <th className="px-3 py-2">Value</th>
                      <th className="px-3 py-2">NAV %</th>
                      <th className="px-3 py-2">Income</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {composition.rows.map((holding) => (
                      <tr key={holding.id}>
                        <td className="px-3 py-2 font-semibold text-ink">{holding.assetType}</td>
                        <td className="px-3 py-2 text-slate-600">
                          <div className="flex min-w-[180px] items-center gap-3">
                            <LogoBadge holding={holding} size="sm" />
                            <div className="min-w-0">
                              <p className="font-semibold text-ink">{holding.symbol}</p>
                              <p className="truncate text-xs text-slate-500">{holding.name ?? "-"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{numberText(holding.quantity)}</td>
                        <td className="px-3 py-2 text-slate-600">{holding.latestPrice == null ? "-" : money(holding.latestPrice, holding.currency, 2)}</td>
                        <td className="px-3 py-2 text-slate-600">{money(holding.marketValue, holding.currency)}</td>
                        <td className="px-3 py-2 text-slate-600">{weightPct(holding.navWeight)}</td>
                        <td className="px-3 py-2 text-slate-600">{holding.couponRate == null ? "-" : `${holding.couponRate}%`}</td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => void deleteHolding(holding.id)} className="inline-flex items-center gap-1 text-rose-700">
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {composition.rows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-slate-500" colSpan={8}>No holdings saved yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Passive Income Calendar" description="Stocks are refreshed from public dividend endpoints; bonds and notes are entered manually.">
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

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(300px,0.48fr)_minmax(0,1fr)]">
          <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-5 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Annual Income</p>
                <p className="mt-3 text-3xl font-semibold tracking-normal">{money(dividendCalendarSummary.annualIncome, "USD", 2)}</p>
              </div>
              <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900">{new Date().getFullYear()}</div>
            </div>
            <div className="mt-8 rounded-lg border border-white/10 bg-white/10 p-4">
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-slate-300">Monthly</span>
                <span className="text-sm font-semibold text-white">{money(dividendCalendarSummary.monthlyAverage, "USD", 2)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-slate-300">Daily</span>
                <span className="text-sm font-semibold text-white">{money(dividendCalendarSummary.dailyAverage, "USD", 2)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-slate-300">Yet To Receive</span>
                <span className="text-sm font-semibold text-white">{money(dividendCalendarSummary.yetToReceive, "USD", 2)}</span>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md bg-white/10 px-3 py-2">
                <p className="text-slate-300">Paid</p>
                <p className="mt-1 font-semibold text-white">{money(dividendCalendarSummary.paid, "USD", 2)}</p>
              </div>
              <div className="rounded-md bg-white/10 px-3 py-2">
                <p className="text-slate-300">Declared</p>
                <p className="mt-1 font-semibold text-white">{money(dividendCalendarSummary.declared, "USD", 2)}</p>
              </div>
              <div className="rounded-md bg-white/10 px-3 py-2">
                <p className="text-slate-300">Estimated</p>
                <p className="mt-1 font-semibold text-white">{money(dividendCalendarSummary.estimated, "USD", 2)}</p>
              </div>
            </div>
          </div>

          <div className="h-96 rounded-lg border border-slate-200 bg-white p-4">
            {passiveIncomeMonths.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={passiveIncomeMonths} barCategoryGap="42%">
                  <defs>
                    <linearGradient id="incomePaidGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c4a8ff" stopOpacity={0.98} />
                      <stop offset="100%" stopColor={incomeStatusColors.paid} stopOpacity={0.56} />
                    </linearGradient>
                    <linearGradient id="incomeDeclaredGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#67e8f9" stopOpacity={0.98} />
                      <stop offset="100%" stopColor={incomeStatusColors.declared} stopOpacity={0.56} />
                    </linearGradient>
                    <linearGradient id="incomeEstimatedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#93c5fd" stopOpacity={0.96} />
                      <stop offset="100%" stopColor={incomeStatusColors.estimated} stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tickFormatter={(value) => monthShortLabel(String(value))} />
                  <YAxis tickFormatter={(value) => `$${Math.round(Number(value))}`} />
                  <Tooltip
                    cursor={{ fill: "rgba(96, 165, 250, 0.10)" }}
                    content={<PassiveIncomeTooltip />}
                  />
                  <Legend />
                  <Bar dataKey="paid" name="Paid" stackId="income" fill="url(#incomePaidGradient)" barSize={18} />
                  <Bar dataKey="declared" name="Declared" stackId="income" fill="url(#incomeDeclaredGradient)" barSize={18} />
                  <Bar dataKey="estimated" name="Estimated" stackId="income" fill="url(#incomeEstimatedGradient)" barSize={18} />
                  <Bar dataKey="total" fill="transparent" legendType="none" barSize={18} isAnimationActive={false}>
                    <LabelList dataKey="total" content={<BrightValueLabel />} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">No upcoming passive income scheduled.</div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Monthly Income Map</p>
                <p className="mt-1 text-sm text-slate-500">{new Date().getFullYear()} stock dividends and bond coupons by pay date, including zero months.</p>
              </div>
              <CalendarDays className="h-5 w-5 text-slate-400" />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {passiveIncomeMonths.slice(0, 12).map((month) => (
                <div key={month.month} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">{monthShortLabel(month.month)}</p>
                      <p className="mt-1 text-xs font-medium uppercase tracking-normal text-slate-500">{month.events.length} events</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-800">{money(month.total)}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                    <div className="rounded-md bg-white px-2 py-1.5">Paid {money(month.paid)}</div>
                    <div className="rounded-md bg-white px-2 py-1.5">Declared {money(month.declared)}</div>
                    <div className="rounded-md bg-white px-2 py-1.5">Estimated {money(month.estimated)}</div>
                  </div>
                </div>
              ))}
              {passiveIncomeMonths.length === 0 ? <p className="text-sm text-slate-500">Add bond coupon dates manually or refresh stock dividends after saving stock positions.</p> : null}
            </div>
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
              {upcomingEvents.slice(0, 12).map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-b-0">
                  <div>
                    <p className="font-semibold text-ink">{event.symbol}</p>
                    <p className="text-sm text-slate-500">{monthName(event.eventDate)} · {event.assetType} · {event.status}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{money(event.grossAmount, event.currency)}</p>
                </div>
              ))}
              {upcomingEvents.length === 0 ? <p className="text-sm text-slate-500">No upcoming income events saved yet.</p> : null}
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
