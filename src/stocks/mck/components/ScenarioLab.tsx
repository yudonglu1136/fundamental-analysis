import { SectionCard } from "../../../components/shared/SectionCard";
import type { MckScenarioOutput } from "../types";
import { money, PanelTable, pct } from "./MckPrimitives";

export function ScenarioLab({ scenarios }: { scenarios: MckScenarioOutput[] }) {
  return (
    <SectionCard title="Scenario Lab" description="3-year and 5-year TSR frame. Starting price, EPS CAGR, exit P/E, buybacks and downside shock are scenario inputs.">
      <PanelTable
        headers={["Scenario", "Fair value", "3Y target", "5Y target", "3Y IRR", "5Y IRR", "Upside / downside", "Summary"]}
        rows={scenarios.map((row) => [
          row.scenario,
          money(row.fairValue, 0),
          money(row.targetPrice3Y, 0),
          money(row.targetPrice5Y, 0),
          pct(row.irr3Y),
          pct(row.irr5Y),
          pct(row.upsideDownside),
          row.summary,
        ])}
      />
    </SectionCard>
  );
}
