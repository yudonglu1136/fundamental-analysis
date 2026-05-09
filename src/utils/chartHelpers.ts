export function buildWaterfall(rows: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>) {
  let running = 0;
  return rows.map((row) => {
    if (row.type === "base") {
      running = row.value;
      return { label: row.label, base: 0, value: row.value, kind: row.type };
    }
    if (row.type === "total") {
      return { label: row.label, base: 0, value: row.value, kind: row.type };
    }
    const base = row.value >= 0 ? running : running + row.value;
    running += row.value;
    return { label: row.label, base, value: Math.abs(row.value), kind: row.type };
  });
}

export function buildSensitivityTable(
  rowHeader: string,
  colHeader: string,
  rowValues: number[],
  colValues: number[],
  calc: (row: number, col: number) => number,
) {
  return [
    [`${rowHeader} \\ ${colHeader}`, ...colValues.map((value) => Number(value.toFixed(2)))],
    ...rowValues.map((row) => [Number(row.toFixed(3)), ...colValues.map((col) => Number(calc(row, col).toFixed(2)))]),
  ];
}
