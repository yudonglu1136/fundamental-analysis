import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowUpRight, Crosshair, Layers3, Radar, Search, Sparkles, Waypoints } from "lucide-react";
import { stockMetadataList, type StockMetadata } from "../stocks/metadata";

type CoverageCollection = {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  tickers: string[];
  accent: string;
};

type EnrichedStockMetadata = StockMetadata & {
  collection: CoverageCollection | undefined;
};

const coverageCollections: CoverageCollection[] = [
  {
    id: "ai-infra",
    label: "AI Infrastructure",
    shortLabel: "AI Infra",
    description: "Compute, memory, networking, foundry, equipment, energy and AI capex beneficiaries.",
    tickers: ["NVDA", "ASML", "MU", "TSM", "ANET", "MRVL", "QCOM"],
    accent: "#3adbea",
  },
  {
    id: "software-ai",
    label: "Software & AI Workflows",
    shortLabel: "Software",
    description: "Enterprise platforms, observability, ontology, cloud, search, ads and workflow AI.",
    tickers: ["MSFT", "AMZN", "GOOGL", "META", "NOW", "PLTR", "DDOG", "TEM", "TRI"],
    accent: "#2b8cff",
  },
  {
    id: "healthcare",
    label: "Healthcare & Biopharma",
    shortLabel: "Healthcare",
    description: "Biopharma, medtech, cell therapy, obesity, oncology and healthcare distribution.",
    tickers: ["LLY", "AZN", "ISRG", "MCK", "BMY", "GILD", "LEGN", "AUTL", "UNH"],
    accent: "#59ea8a",
  },
  {
    id: "financial-infra",
    label: "Payments, Banks & Insurance",
    shortLabel: "Finance",
    description: "Payment networks, market data, banks, insurance underwriting and capital-return compounders.",
    tickers: ["MA", "V", "LSEG", "JPM", "BAC", "CB", "TRV"],
    accent: "#ffa329",
  },
  {
    id: "defense",
    label: "Defense & Aerospace",
    shortLabel: "Defense",
    description: "Defense primes, aerospace platforms, drones, autonomy and backlog/cash-conversion analysis.",
    tickers: ["BA.L", "NOC", "RTX", "LMT", "AVAV", "KTOS"],
    accent: "#ff554a",
  },
  {
    id: "energy-power",
    label: "Energy & Power",
    shortLabel: "Energy",
    description: "Nuclear power scarcity, fuel cells, AI data-center power, natural gas, LNG demand, commodity cycles and FCF discipline.",
    tickers: ["CEG", "BE", "EQT"],
    accent: "#d6f75a",
  },
  {
    id: "consumer-energy",
    label: "Consumer, EV & Staples",
    shortLabel: "Consumer",
    description: "Consumer compounders, EV/autonomy, beverages, retail membership and category normalization.",
    tickers: ["AAPL", "TSLA", "COST", "DGE.L"],
    accent: "#c09cff",
  },
];

const featuredTickers = ["MSFT", "CEG", "MU", "PLTR", "TSLA", "ASML", "AMZN", "JPM"];

const graphPositions = [
  { x: "13%", y: "63%" },
  { x: "28%", y: "26%" },
  { x: "46%", y: "44%" },
  { x: "61%", y: "20%" },
  { x: "72%", y: "62%" },
  { x: "83%", y: "36%" },
  { x: "36%", y: "72%" },
  { x: "55%", y: "76%" },
];

function getCollectionForStock(stock: StockMetadata) {
  return coverageCollections.find((collection) => collection.tickers.includes(stock.ticker));
}

function matchesSearch(stock: StockMetadata, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [stock.ticker, stock.name, stock.sector, stock.description].some((field) =>
    field.toLowerCase().includes(normalized),
  );
}

export function Home() {
  const [query, setQuery] = useState("");
  const [activeCollectionId, setActiveCollectionId] = useState("all");

  const enrichedStocks = useMemo<EnrichedStockMetadata[]>(
    () =>
      stockMetadataList.map((stock) => ({
        ...stock,
        collection: getCollectionForStock(stock),
      })),
    [],
  );

  const filteredStocks = useMemo(() => {
    return enrichedStocks.filter((stock) => {
      const collectionMatch = activeCollectionId === "all" || stock.collection?.id === activeCollectionId;
      return collectionMatch && matchesSearch(stock, query);
    });
  }, [activeCollectionId, enrichedStocks, query]);

  const selectedCollection = coverageCollections.find((collection) => collection.id === activeCollectionId);

  const graphStocks = useMemo(() => {
    const source =
      activeCollectionId === "all"
        ? featuredTickers.flatMap((ticker) => {
            const stock = enrichedStocks.find((candidate) => candidate.ticker === ticker);
            return stock ? [stock] : [];
          })
        : filteredStocks;
    return source.slice(0, graphPositions.length);
  }, [activeCollectionId, enrichedStocks, filteredStocks]);

  const featuredStocks = useMemo(() => {
    const filteredTickerSet = new Set(filteredStocks.map((stock) => stock.ticker));
    return featuredTickers
      .flatMap((ticker) => {
        const stock = enrichedStocks.find((candidate) => candidate.ticker === ticker);
        return stock ? [stock] : [];
      })
      .filter((stock) => filteredTickerSet.has(stock.ticker))
      .slice(0, 4);
  }, [enrichedStocks, filteredStocks]);

  return (
    <div className="space-y-5 text-white">
      <section className="tf-command-surface relative overflow-hidden p-4 sm:p-6 lg:p-8">
        <div className="tf-scan-line" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.16fr)_420px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tf-signal-chip">Market ontology</span>
              <span className="tf-signal-chip border-blue-300/30 bg-blue-300/10 text-blue-200">Research graph</span>
              <span className="tf-signal-chip border-amber-300/30 bg-amber-300/10 text-amber-200">Backend aware</span>
            </div>
            <h1 className="mt-6 max-w-5xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              ThesisForge command map
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400 sm:text-lg">
              A graph-first investment workspace for connecting companies, demand cycles, source quality,
              valuation gaps, transcript signals and risk clusters.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <SignalStat label="Companies" value={stockMetadataList.length.toString()} note="Registered objects" />
              <SignalStat label="Themes" value={coverageCollections.length.toString()} note="Coverage clusters" />
              <SignalStat label="Mode" value="Live" note="Registry loaded" />
            </div>
          </div>

          <div className="tf-object-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="tf-kicker">Active scope</p>
                <h2 className="mt-1 text-xl font-semibold text-white">{selectedCollection?.label ?? "All coverage"}</h2>
              </div>
              <Radar className="h-5 w-5 text-cyan-200" />
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              {selectedCollection?.description ?? "All modules are grouped by the strongest research object relationship."}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <SignalStat compact label="Visible" value={filteredStocks.length.toString()} note="Modules" />
              <SignalStat compact label="Priority" value={(featuredStocks.length || Math.min(filteredStocks.length, 4)).toString()} note="Focus cards" />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <label className="tf-object-panel flex min-h-14 items-center gap-3 px-4">
          <Search className="h-5 w-5 shrink-0 text-cyan-200/70" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ticker, company, sector or thesis driver"
            className="h-12 min-w-0 flex-1 bg-transparent text-base font-medium text-white outline-none placeholder:text-slate-500"
          />
        </label>

        <div className="flex gap-2 overflow-x-auto pb-1 xl:max-w-[780px]">
          <FilterPill
            active={activeCollectionId === "all"}
            label="All"
            count={stockMetadataList.length}
            accent="#3adbea"
            onClick={() => setActiveCollectionId("all")}
          />
          {coverageCollections.map((collection) => (
            <FilterPill
              key={collection.id}
              active={activeCollectionId === collection.id}
              label={collection.shortLabel}
              count={collection.tickers.length}
              accent={collection.accent}
              onClick={() => setActiveCollectionId(collection.id)}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="tf-command-surface overflow-hidden p-4 sm:p-5">
          <SectionHeader
            icon={<Waypoints className="h-4 w-4" />}
            label={selectedCollection?.label ?? "Global thesis map"}
            title="Coverage graph"
          />

          <div className="tf-grid-surface relative mt-5 min-h-[430px] overflow-hidden border border-white/10">
            <div className="absolute inset-x-10 top-[54%] h-px bg-cyan-200/20" />
            <div className="absolute left-[18%] top-[30%] h-px w-[52%] -rotate-[22deg] bg-cyan-200/25" />
            <div className="absolute left-[40%] top-[48%] h-px w-[44%] rotate-[30deg] bg-amber-200/25" />
            <div className="absolute left-[22%] top-[72%] h-px w-[38%] rotate-[7deg] bg-blue-300/20" />

            {graphStocks.map((stock, index) => (
              <GraphNode
                key={stock.ticker}
                stock={stock}
                position={graphPositions[index]}
                accent={stock.collection?.accent ?? "#3adbea"}
                active={index === 2 || stock.ticker === "CEG"}
              />
            ))}

            <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <p className="max-w-2xl text-xs leading-5 text-slate-500">
                Nodes cluster by sector, valuation workstream, market theme and source readiness.
              </p>
              <span className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
                {filteredStocks.length} objects visible
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <SectionHeader
            icon={<Layers3 className="h-4 w-4" />}
            label="Coverage clusters"
            title="Research object groups"
          />

          <div className="space-y-2">
            {coverageCollections.map((collection) => {
              const count = enrichedStocks.filter((stock) => stock.collection?.id === collection.id).length;
              const active = activeCollectionId === collection.id;
              return (
                <button
                  key={collection.id}
                  type="button"
                  onClick={() => setActiveCollectionId(collection.id)}
                  className={`group grid w-full grid-cols-[4px_minmax(0,1fr)_auto] items-center gap-4 border px-4 py-3 text-left transition ${
                    active
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-white/10 bg-white/[0.045] text-slate-300 hover:border-white/20 hover:bg-white/[0.075]"
                  }`}
                >
                  <span className="h-10 w-1" style={{ backgroundColor: collection.accent }} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{collection.label}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">
                      {collection.tickers.slice(0, 5).join(" / ")}
                    </span>
                  </span>
                  <span className="text-sm font-semibold" style={{ color: collection.accent }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <SectionHeader
            icon={<Sparkles className="h-4 w-4" />}
            label="Priority objects"
            title={selectedCollection?.shortLabel ?? "High-signal focus"}
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            {(featuredStocks.length ? featuredStocks : filteredStocks.slice(0, 4)).map((stock) => (
              <FeatureCard key={stock.ticker} stock={stock} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <SectionHeader
            icon={<Crosshair className="h-4 w-4" />}
            label="All modules"
            title={query ? `Results for \"${query}\"` : "Coverage list"}
          />

          {filteredStocks.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {filteredStocks.map((stock) => (
                <CompactStockRow key={stock.ticker} stock={stock} />
              ))}
            </div>
          ) : (
            <div className="tf-object-panel p-6 text-sm font-medium text-slate-400">
              No matching stock modules.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SignalStat({ label, value, note, compact = false }: { label: string; value: string; note: string; compact?: boolean }) {
  return (
    <div className={`border border-white/10 bg-white/[0.045] ${compact ? "p-3" : "p-4"}`}>
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-2 font-semibold text-white ${compact ? "text-xl" : "text-3xl"}`}>{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{note}</p>
    </div>
  );
}

function FilterPill({
  active,
  label,
  count,
  accent,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 shrink-0 items-center gap-2 border px-3 text-sm font-semibold transition ${
        active
          ? "border-white/25 bg-white/10 text-white"
          : "border-white/10 bg-white/[0.045] text-slate-400 hover:border-white/20 hover:bg-white/[0.075] hover:text-white"
      }`}
      style={active ? { boxShadow: `inset 0 -2px 0 ${accent}` } : undefined}
    >
      <span>{label}</span>
      <span className="text-xs" style={{ color: active ? accent : "rgba(148,163,184,0.65)" }}>{count}</span>
    </button>
  );
}

function SectionHeader({ icon, label, title }: { icon: ReactNode; label: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-cyan-300/25 bg-cyan-300/10 text-cyan-100">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="tf-kicker">{label}</p>
        <h2 className="mt-0.5 truncate text-lg font-semibold text-white">{title}</h2>
      </div>
    </div>
  );
}

function GraphNode({
  stock,
  position,
  accent,
  active,
}: {
  stock: EnrichedStockMetadata;
  position: { x: string; y: string };
  accent: string;
  active: boolean;
}) {
  return (
    <Link
      to={`/stocks/${stock.ticker}`}
      className="group absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: position.x, top: position.y }}
    >
      <span
        className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-15 blur-md transition group-hover:opacity-30"
        style={{ backgroundColor: accent }}
      />
      <span
        className={`relative flex h-16 w-16 items-center justify-center rounded-full border bg-[#060910] text-sm font-bold text-white transition group-hover:scale-105 ${
          active ? "shadow-[0_0_0_8px_rgba(58,219,234,0.07)]" : ""
        }`}
        style={{ borderColor: accent, boxShadow: active ? `0 0 34px ${accent}33` : undefined }}
      >
        {stock.ticker.length > 4 ? stock.ticker.slice(0, 4) : stock.ticker}
      </span>
      <span className="pointer-events-none absolute left-[76px] top-2 hidden min-w-[150px] sm:block">
        <span className="block text-sm font-semibold text-white">{stock.ticker}</span>
        <span className="mt-1 block max-w-[170px] truncate text-[0.68rem] text-slate-500">{stock.collection?.shortLabel ?? stock.sector}</span>
      </span>
    </Link>
  );
}

function FeatureCard({ stock }: { stock: EnrichedStockMetadata }) {
  const accent = stock.collection?.accent ?? "#3adbea";
  return (
    <Link
      to={`/stocks/${stock.ticker}`}
      className="group tf-object-panel flex min-h-[190px] flex-col justify-between p-5 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.075]"
    >
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-slate-500">{stock.collection?.shortLabel ?? "Module"}</p>
            <h3 className="mt-2 text-3xl font-semibold tracking-normal text-white">{stock.ticker}</h3>
          </div>
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center border transition group-hover:bg-white/10"
            style={{ borderColor: `${accent}80`, color: accent }}
          >
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-3 text-lg font-semibold text-white">{stock.name}</p>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-400">{stock.description}</p>
      </div>
      <p className="mt-5 border-t border-white/10 pt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {stock.sector}
      </p>
    </Link>
  );
}

function CompactStockRow({ stock }: { stock: EnrichedStockMetadata }) {
  const accent = stock.collection?.accent ?? "#3adbea";
  return (
    <Link
      to={`/stocks/${stock.ticker}`}
      className="group grid min-h-[86px] grid-cols-[72px_minmax(0,1fr)_28px] items-center gap-3 border border-white/10 bg-white/[0.045] px-3 py-3 transition hover:border-white/20 hover:bg-white/[0.075]"
    >
      <div
        className="flex h-12 items-center justify-center border bg-[#05070b] text-xs font-semibold tracking-[0.16em] text-white"
        style={{ borderColor: `${accent}75` }}
      >
        {stock.ticker}
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-white">{stock.name}</h3>
        <p className="mt-1 truncate text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {stock.collection?.label ?? stock.sector}
        </p>
        <p className="mt-1 truncate text-xs text-slate-500">{stock.sector}</p>
      </div>
      <Activity className="h-4 w-4 text-slate-600 transition group-hover:text-cyan-200" />
    </Link>
  );
}
