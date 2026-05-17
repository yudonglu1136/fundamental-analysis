import { SectionCard } from "../../../components/shared/SectionCard";
import type { MckPeerMetric } from "../types";
import { multiple, PanelTable, pct } from "./MckPrimitives";

export function PeerComparisonPanel({ peers }: { peers: MckPeerMetric[] }) {
  return (
    <SectionCard title="Peer Comparison" description="Core peer set is COR and CAH. Adjacent companies are kept as read-throughs, not valuation comps.">
      <PanelTable
        headers={["Company", "Type", "Revenue growth", "Op margin", "EPS growth", "FCF conv.", "FCF yield", "P/E", "Buyback", "ROIC", "Leverage", "Specialty", "Moat"]}
        rows={peers.map((peer) => [
          `${peer.ticker} / ${peer.name}`,
          peer.category === "core_peer" ? "Core peer" : "Adjacent",
          pct(peer.revenueGrowth),
          pct(peer.operatingMargin),
          pct(peer.adjustedEpsGrowth),
          pct(peer.fcfConversion),
          pct(peer.fcfYield),
          multiple(peer.forwardPe),
          pct(peer.buybackYield),
          pct(peer.roic),
          multiple(peer.leverage),
          pct(peer.specialtyExposure),
          peer.moatScore,
        ])}
      />
    </SectionCard>
  );
}
