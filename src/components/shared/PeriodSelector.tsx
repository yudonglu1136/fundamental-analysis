import { Select } from "../layout/StockSelector";
import type { PeriodOption } from "../../stocks/types";

export function PeriodSelector({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: PeriodOption[];
  className?: string;
}) {
  return <Select value={value} onValueChange={onChange} options={options} className={className} />;
}
