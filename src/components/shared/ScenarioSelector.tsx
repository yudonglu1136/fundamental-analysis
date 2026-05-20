import { Select } from "../layout/StockSelector";
import type { Scenario } from "../../stocks/types";

export function ScenarioSelector({
  value,
  onChange,
  className,
}: {
  value: Scenario;
  onChange: (value: Scenario) => void;
  className?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as Scenario)}
      options={[{ value: "Bear", label: "Bear" }, { value: "Base", label: "Base" }, { value: "Bull", label: "Bull" }]}
      className={className}
    />
  );
}
