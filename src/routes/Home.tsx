import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Layers, Search, Sparkles } from "lucide-react";
import { stockMetadataList, type StockMetadata } from "../stocks/metadata";

type CoverageCollection = {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  tickers: string[];
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
  },
  {
    id: "software-ai",
    label: "Software & AI Workflows",
    shortLabel: "Software",
    description: "Enterprise platforms, observability, ontology, cloud, search, ads and workflow AI.",
    tickers: ["MSFT", "AMZN", "GOOGL", "META", "NOW", "PLTR", "DDOG", "TEM", "TRI"],
  },
  {
    id: "healthcare",
    label: "Healthcare & Biopharma",
    shortLabel: "Healthcare",
    description: "Biopharma, medtech, cell therapy, obesity, oncology and healthcare distribution.",
    tickers: ["LLY", "AZN", "ISRG", "MCK", "BMY", "GILD", "LEGN", "AUTL"],
  },
  {
    id: "financial-infra",
    label: "Payments, Banks & Insurance",
    shortLabel: "Finance",
    description: "Payment networks, market data, banks, insurance underwriting and capital-return compounders.",
    tickers: ["MA", "V", "LSEG", "JPM", "BAC", "CB", "TRV"],
  },
  {
    id: "defense",
    label: "Defense & Aerospace",
    shortLabel: "Defense",
    description: "Defense primes, aerospace platforms, drones, autonomy and backlog/cash-conversion analysis.",
    tickers: ["BA.L", "NOC", "RTX", "LMT", "AVAV", "KTOS"],
  },
  {
    id: "energy-power",
    label: "Energy & Power",
    shortLabel: "Energy",
    description: "Nuclear power scarcity, natural gas, LNG demand, commodity cycles and FCF discipline.",
    tickers: ["CEG", "EQT"],
  },
  {
    id: "consumer-energy",
    label: "Consumer, EV & Staples",
    shortLabel: "Consumer",
    description: "Consumer compounders, EV/autonomy, beverages, retail membership and category normalization.",
    tickers: ["AAPL", "TSLA", "COST", "DGE.L"],
  },
];

const featuredTickers = ["ASML", "MU", "TSLA", "AMZN", "JPM", "QCOM", "AVAV", "EQT"];

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

  const selectedCollection = coverageCollections.find((collection) => collection.id === activeCollectionId);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 border-b border-ink/10 pb-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <p className="ontology-label">Research Coverage</p>
          <h1 className="mt-2 max-w-4xl text-4xl font-semibold tracking-normal text-ink sm:text-5xl">
            Structured buy-side workbench for public equities.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-ink/58">
            A structured coverage map across AI infrastructure, software, healthcare, payments, defense, consumer and energy-driven equity research.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
          <StatBlock label="Companies" value={stockMetadataList.length.toString()} note="Registered modules" />
          <StatBlock label="Themes" value={coverageCollections.length.toString()} note="Coverage maps" />
          <StatBlock label="Mode" value="Live" note="Frontend registry" />
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <label className="flex min-h-14 items-center gap-3 border border-white/70 bg-white/85 px-4 shadow-panel backdrop-blur-xl">
          <Search className="h-5 w-5 shrink-0 text-ink/40" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ticker, company, sector or thesis driver"
            className="h-12 min-w-0 flex-1 bg-transparent text-base font-medium text-ink outline-none placeholder:text-ink/35"
          />
        </label>

        <div className="flex gap-2 overflow-x-auto pb-1 lg:max-w-[720px]">
          <FilterPill
            active={activeCollectionId === "all"}
            label="All"
            count={stockMetadataList.length}
            onClick={() => setActiveCollectionId("all")}
          />
          {coverageCollections.map((collection) => (
            <FilterPill
              key={collection.id}
              active={activeCollectionId === collection.id}
              label={collection.shortLabel}
              count={collection.tickers.length}
              onClick={() => setActiveCollectionId(collection.id)}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="space-y-4">
          <SectionHeader
            icon={<Sparkles className="h-4 w-4" />}
            label={selectedCollection?.label ?? "Priority Coverage"}
            title={selectedCollection?.description ?? "Current high-signal modules"}
          />

          <div className="grid gap-3 md:grid-cols-2">
            {(featuredStocks.length ? featuredStocks : filteredStocks.slice(0, 4)).map((stock) => (
              <FeatureCard key={stock.ticker} stock={stock} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <SectionHeader
            icon={<Layers className="h-4 w-4" />}
            label="Coverage Map"
            title={`${filteredStocks.length} module${filteredStocks.length === 1 ? "" : "s"} shown`}
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
                  className={`flex w-full items-center justify-between border px-4 py-3 text-left transition ${
                    active
                      ? "border-ink bg-ink text-white"
                      : "border-white/70 bg-white/75 text-ink hover:border-accent/45 hover:bg-white"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{collection.label}</span>
                    <span className={`mt-1 block text-xs ${active ? "text-white/55" : "text-ink/45"}`}>
                      {collection.tickers.slice(0, 5).join(" / ")}
                    </span>
                  </span>
                  <span className={`ml-3 text-sm font-semibold ${active ? "text-accent" : "text-ink/45"}`}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader
          icon={<Search className="h-4 w-4" />}
          label="All Modules"
          title={query ? `Results for "${query}"` : "Alphabetical coverage list"}
        />

        {filteredStocks.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {filteredStocks.map((stock) => (
              <CompactStockRow key={stock.ticker} stock={stock} />
            ))}
          </div>
        ) : (
          <div className="border border-white/70 bg-white/75 p-6 text-sm font-medium text-ink/55 shadow-panel">
            No matching stock modules.
          </div>
        )}
      </section>
    </div>
  );
}

function StatBlock({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border border-white/70 bg-white/75 p-3 shadow-panel backdrop-blur-xl lg:p-4">
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-ink/40">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs font-medium text-ink/42">{note}</p>
    </div>
  );
}

function FilterPill({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 shrink-0 items-center gap-2 border px-3 text-sm font-semibold transition ${
        active
          ? "border-ink bg-ink text-white"
          : "border-white/70 bg-white/75 text-ink/62 hover:border-accent/45 hover:bg-white hover:text-ink"
      }`}
    >
      <span>{label}</span>
      <span className={`text-xs ${active ? "text-accent" : "text-ink/35"}`}>{count}</span>
    </button>
  );
}

function SectionHeader({ icon, label, title }: { icon: ReactNode; label: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-ink/10 bg-white/75 text-ink/55 shadow-panel">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-ink/42">{label}</p>
        <h2 className="mt-0.5 truncate text-lg font-semibold text-ink">{title}</h2>
      </div>
    </div>
  );
}

function FeatureCard({ stock }: { stock: EnrichedStockMetadata }) {
  return (
    <Link
      to={`/stocks/${stock.ticker}`}
      className="group flex min-h-[220px] flex-col justify-between border border-white/70 bg-white/85 p-5 shadow-panel transition hover:-translate-y-0.5 hover:border-accent/50 hover:bg-white"
    >
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ink/45">{stock.collection?.shortLabel ?? "Module"}</p>
            <h3 className="mt-2 text-3xl font-semibold tracking-normal text-ink">{stock.ticker}</h3>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-ink/10 bg-ink text-white transition group-hover:border-accent group-hover:bg-accent group-hover:text-ink">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-3 text-lg font-semibold text-ink">{stock.name}</p>
        <p className="mt-3 text-sm leading-6 text-ink/58">{stock.description}</p>
      </div>
      <p className="mt-5 border-t border-ink/10 pt-3 text-xs font-semibold uppercase tracking-[0.16em] text-ink/38">
        {stock.sector}
      </p>
    </Link>
  );
}

function CompactStockRow({ stock }: { stock: EnrichedStockMetadata }) {
  return (
    <Link
      to={`/stocks/${stock.ticker}`}
      className="group grid min-h-[96px] grid-cols-[76px_minmax(0,1fr)_32px] items-center gap-3 border border-white/70 bg-white/75 px-4 py-3 shadow-panel transition hover:border-accent/45 hover:bg-white"
    >
      <div className="flex h-14 items-center justify-center border border-ink/10 bg-ink text-sm font-semibold tracking-[0.18em] text-white">
        {stock.ticker}
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold text-ink">{stock.name}</h3>
        <p className="mt-1 truncate text-xs font-semibold uppercase tracking-[0.16em] text-ink/38">
          {stock.collection?.label ?? stock.sector}
        </p>
        <p className="mt-1 truncate text-sm text-ink/52">{stock.sector}</p>
      </div>
      <ArrowUpRight className="h-4 w-4 text-ink/28 transition group-hover:text-accent" />
    </Link>
  );
}
