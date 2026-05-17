import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import type { MckMarginBridgeOutput } from "../types";
import { bps, MiniMetric, PanelTable } from "./MckPrimitives";

export function MarginBridgePanel({ data }: { data: MckMarginBridgeOutput }) {
  return (
    <SectionCard title="Margin Bridge" description="Basis-point bridge keeps the analysis focused on profit dollars and margin rate, not just revenue growth.">
      <div className="grid gap-4 md:grid-cols-3">
        <MiniMetric label="Prior margin" value={bps(data.priorMarginBps)} badge="Derived" />
        <MiniMetric label="Current margin" value={bps(data.currentMarginBps)} badge="Derived" />
        <MiniMetric label="Change" value={`${data.marginChangeBps >= 0 ? "+" : ""}${bps(data.marginChangeBps)}`} badge="Derived" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.bridge}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="driver" hide />
              <YAxis />
              <Tooltip />
              <Bar dataKey="bps" name="bps" fill="#21486f" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <PanelTable headers={["Driver", "bps", "Source", "Note"]} rows={data.bridge.map((row) => [row.driver, row.bps, row.sourceType, row.note])} />
      </div>
    </SectionCard>
  );
}
