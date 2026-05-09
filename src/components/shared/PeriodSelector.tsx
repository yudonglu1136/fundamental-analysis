import { Select } from "../layout/StockSelector";
import type { PeriodOption } from "../../stocks/types";

export function PeriodSelector({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: PeriodOption[] }) {
  return <Select value={value} onValueChange={onChange} options={options} />;
}
