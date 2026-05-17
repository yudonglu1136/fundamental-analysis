import { useCallback, useState } from "react";
import type { DataSourceType } from "../../stocks/types";

type UseValuationAssumptionStateOptions<TAssumptions extends Record<string, number>> = {
  ticker: string;
  defaultAssumptions: TAssumptions;
  storageKey?: string;
  onDataSourceChange: (source: DataSourceType) => void;
};

function readStoredAssumptions<TAssumptions extends Record<string, number>>(
  storageKey: string,
  defaultAssumptions: TAssumptions,
): Record<string, number> {
  if (typeof window === "undefined") return defaultAssumptions;
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return defaultAssumptions;
  try {
    return {
      ...defaultAssumptions,
      ...(JSON.parse(saved) as Partial<TAssumptions>),
    };
  } catch {
    return defaultAssumptions;
  }
}

export function useValuationAssumptionState<TAssumptions extends Record<string, number>>({
  ticker,
  defaultAssumptions,
  storageKey = `${ticker.toLowerCase()}-valuation-assumptions`,
  onDataSourceChange,
}: UseValuationAssumptionStateOptions<TAssumptions>) {
  const [valuationAssumptions, setValuationAssumptions] = useState<Record<string, number>>(() =>
    readStoredAssumptions(storageKey, defaultAssumptions),
  );

  const handleValuationValuesChange = useCallback(
    (next: Record<string, number>) => {
      setValuationAssumptions(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      }
      onDataSourceChange("manual");
    },
    [onDataSourceChange, storageKey],
  );

  return {
    valuationAssumptions,
    setValuationAssumptions,
    handleValuationValuesChange,
  };
}
