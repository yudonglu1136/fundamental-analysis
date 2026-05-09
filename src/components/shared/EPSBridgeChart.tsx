import { WaterfallChart } from "./WaterfallChart";

export function EPSBridgeChart({
  rows,
}: {
  rows: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
}) {
  return <WaterfallChart rows={rows} formatter={(value) => `$${value.toFixed(2)}`} />;
}
