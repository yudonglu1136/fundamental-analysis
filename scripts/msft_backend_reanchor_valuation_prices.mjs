import { spawnSync } from "node:child_process";
import { MSFT_BACKEND_DB_PATH } from "../modules/msft/db/schema.mjs";

const bridge = String.raw`
import json, sqlite3, sys
db_path = sys.argv[1]
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
try:
    runs = conn.execute("""
      SELECT id, asOfDate, fairValue, targetPrice3Y
      FROM valuation_runs
      WHERE ticker = 'MSFT'
        AND fairValue IS NOT NULL
      ORDER BY asOfDate, id
    """).fetchall()
    updates = []
    samples = []
    for run in runs:
      price = conn.execute("""
        SELECT priceDate, adjustedClose, source
        FROM daily_price_bars
        WHERE ticker = 'MSFT'
          AND priceDate <= ?
          AND adjustedClose IS NOT NULL
        ORDER BY priceDate DESC
        LIMIT 1
      """, (run["asOfDate"],)).fetchone()
      if price is None:
        continue
      current_price = float(price["adjustedClose"])
      fair_value = float(run["fairValue"])
      target = run["targetPrice3Y"]
      upside = fair_value / current_price - 1
      cagr = ((float(target) + 9.96) / current_price) ** (1 / 3) - 1 if target is not None else None
      updates.append((current_price, upside, cagr, run["id"]))
      if run["asOfDate"] >= "2025-10-01" and len(samples) < 18:
        samples.append({
          "id": run["id"],
          "asOfDate": run["asOfDate"],
          "priceDate": price["priceDate"],
          "currentPrice": current_price,
          "source": price["source"],
        })
    conn.executemany("""
      UPDATE valuation_runs
      SET currentPrice = ?,
          upsideDownside = ?,
          expectedShareholderCagr = ?
      WHERE id = ?
    """, updates)
    conn.commit()
    print(json.dumps({"updated": len(updates), "samples": samples}, indent=2))
finally:
    conn.close()
`;

const result = spawnSync("python3", ["-c", bridge, MSFT_BACKEND_DB_PATH], {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});

if (result.status !== 0) {
  throw new Error(result.stderr || result.stdout);
}
console.log(result.stdout);
