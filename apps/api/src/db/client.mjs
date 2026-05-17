import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const defaultLsegDbPath = path.resolve("data/local/lseg/backend/lseg_research.sqlite");

const pythonBridge = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
db_path = payload["dbPath"]
action = payload["action"]
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
try:
    if action == "query":
        rows = conn.execute(payload["sql"], payload.get("params", [])).fetchall()
        print(json.dumps([dict(row) for row in rows]))
    elif action == "execute":
        cur = conn.execute(payload["sql"], payload.get("params", []))
        conn.commit()
        print(json.dumps({"changes": conn.total_changes, "lastrowid": cur.lastrowid}))
    elif action == "executescript":
        conn.executescript(payload["sql"])
        conn.commit()
        print(json.dumps({"ok": True}))
    else:
        raise ValueError("Unknown action: " + action)
finally:
    conn.close()
`;

function runSqlite(action, payload = {}, dbPath = process.env.LSEG_DB_PATH || defaultLsegDbPath) {
  const result = spawnSync("python3", ["-c", pythonBridge], {
    input: JSON.stringify({ ...payload, action, dbPath }),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`SQLite bridge failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout ? JSON.parse(result.stdout) : null;
}

export function assertDbExists(dbPath = process.env.LSEG_DB_PATH || defaultLsegDbPath) {
  if (!existsSync(dbPath)) {
    throw new Error(`LSEG backend DB does not exist at ${dbPath}. Run npm run lseg:backend:seed first.`);
  }
}

export function query(sql, params = [], dbPath) {
  assertDbExists(dbPath);
  return runSqlite("query", { sql, params }, dbPath);
}

export function execute(sql, params = [], dbPath) {
  assertDbExists(dbPath);
  return runSqlite("execute", { sql, params }, dbPath);
}

export function executescript(sql, dbPath) {
  return runSqlite("executescript", { sql }, dbPath);
}
