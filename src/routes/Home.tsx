import { Link } from "react-router-dom";
import { stockMetadataList } from "../stocks/metadata";
import { SectionCard } from "../components/shared/SectionCard";

export function Home() {
  return (
    <div className="space-y-5">
      <SectionCard title="Investment Research Workspace" description="Select a company to open its tailored buy-side dashboard, valuation work, historical data views, and thesis monitoring panels.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {stockMetadataList.map((stock) => (
            <Link key={stock.ticker} to={`/stocks/${stock.ticker}`} className="ontology-node group p-4">
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-ink">{stock.ticker}</p>
                <span className="mt-1 h-2.5 w-2.5 border border-accent/60 bg-accent/15 group-hover:bg-accent" />
              </div>
              <h3 className="mt-3 text-xl font-semibold tracking-normal text-ink">{stock.name}</h3>
              <p className="mt-2 text-sm leading-6 text-ink/55">{stock.description}</p>
              <p className="mt-4 border-t border-ink/10 pt-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink/42">{stock.sector}</p>
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
