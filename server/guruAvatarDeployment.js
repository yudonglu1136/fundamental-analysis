import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gurus } from "./gurus.js";
import { auditGuruAvatarDirectory, guruAvatarStyle } from "./guruAvatarCatalog.js";

// This preflight intentionally does not import localDatabase: a normal code
// deployment must not initialize schema or rewrite unchanged avatar timestamps.
// The existing asset schema has no content hash. Validate source PNGs in full
// and compare their canonical metadata; release packaging owns asset hashes.
export function installedGuruAvatarState({ avatarDir, rootDir, databasePath, configuredGurus = gurus }) {
  const audit = auditGuruAvatarDirectory({ avatarDir, configuredGurus });
  if (!audit.ok) throw new Error("Guru avatar catalog validation failed before database access.");
  if (!fs.existsSync(databasePath)) return { upToDate: false, reason: "database_missing", audit };
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
    database.exec("PRAGMA query_only = ON; PRAGMA busy_timeout = 5000;");
    const find = database.prepare(`SELECT url, local_path, style, prompt FROM guru_assets
      WHERE guru_id = ? AND asset_type = 'avatar' LIMIT 2`);
    for (const guru of configuredGurus) {
      const rows = find.all(guru.id);
      const expected = {
        url: `/guru-avatars/${guru.id}.png`,
        local_path: path.relative(rootDir, path.join(avatarDir, `${guru.id}.png`)),
        style: guruAvatarStyle,
        prompt: `AI-generated ${guruAvatarStyle} for ${guru.name}`
      };
      if (rows.length !== 1 || Object.entries(expected).some(([key, value]) => rows[0][key] !== value))
        return { upToDate: false, reason: "catalog_changed", audit };
    }
    return { upToDate: true, reason: "catalog_unchanged", audit };
  } catch {
    return { upToDate: false, reason: "catalog_unavailable", audit };
  } finally {
    database?.close();
  }
}
