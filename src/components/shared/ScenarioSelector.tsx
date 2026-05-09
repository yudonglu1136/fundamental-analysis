import { Select } from "../layout/StockSelector";
import type { Scenario } from "../../stocks/types";

export function ScenarioSelector({ value, onChange }: { value: Scenario; onChange: (value: Scenario) => void }) {
  return <Select value={value} onValueChange={(next) => onChange(next as Scenario)} options={[{ value: "Bear", label: "Bear" }, { value: "Base", label: "Base" }, { value: "Bull", label: "Bull" }]} />;
}
