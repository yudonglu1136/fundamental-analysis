export const ONTOLOGY_SNAPSHOT_SCHEMA_VERSION = 2;

export const REQUIRED_ONTOLOGY_FIXED_ROUTES = Object.freeze([
  "fixed:strategies",
  "fixed:decision_overview",
  "fixed:market_home",
  "fixed:overview",
  "fixed:graph",
  "fixed:methodology",
  "fixed:timeline",
  "fixed:rankings_all"
]);

function finiteInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

export function ontologySnapshotMetadataErrors({
  manifest,
  metadataSchemaVersion,
  responseCount,
  jsonBytes,
  routeKeys
}) {
  const errors = [];
  const actualResponseCount = finiteInteger(responseCount);
  const actualJsonBytes = finiteInteger(jsonBytes);
  const availableRoutes = new Set(routeKeys || []);

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    errors.push("metadata.manifest must be a JSON object");
    return errors;
  }

  const manifestSchemaVersion = finiteInteger(manifest.schema_version);
  const storedSchemaVersion = finiteInteger(metadataSchemaVersion);
  if (manifestSchemaVersion !== ONTOLOGY_SNAPSHOT_SCHEMA_VERSION) {
    errors.push(`manifest schema_version must be ${ONTOLOGY_SNAPSHOT_SCHEMA_VERSION}`);
  }
  if (storedSchemaVersion !== ONTOLOGY_SNAPSHOT_SCHEMA_VERSION) {
    errors.push(`metadata schema_version must be ${ONTOLOGY_SNAPSHOT_SCHEMA_VERSION}`);
  }
  if (manifestSchemaVersion !== null && storedSchemaVersion !== null && manifestSchemaVersion !== storedSchemaVersion) {
    errors.push("manifest and metadata schema versions do not match");
  }

  if (!manifest.generated_at || !Number.isFinite(Date.parse(manifest.generated_at))) {
    errors.push("manifest generated_at must be a valid timestamp");
  }
  if (actualResponseCount === null || actualResponseCount <= 0) {
    errors.push("responses table must contain at least one payload");
  }
  const manifestResponseCount = finiteInteger(manifest.responses);
  if (manifestResponseCount === null || manifestResponseCount <= 0) {
    errors.push("manifest responses must be a positive integer");
  } else if (actualResponseCount !== null && manifestResponseCount !== actualResponseCount) {
    errors.push(`manifest responses ${manifestResponseCount} does not match table count ${actualResponseCount}`);
  }
  if (actualJsonBytes === null || actualJsonBytes <= 0) {
    errors.push("responses table must contain non-empty JSON payloads");
  }
  const manifestJsonBytes = finiteInteger(manifest.uncompressed_json_bytes);
  if (manifestJsonBytes !== null && actualJsonBytes !== null && manifestJsonBytes !== actualJsonBytes) {
    errors.push(`manifest uncompressed_json_bytes ${manifestJsonBytes} does not match table total ${actualJsonBytes}`);
  }
  if (finiteInteger(manifest.critical_failure_count) > 0) {
    errors.push(`manifest records ${manifest.critical_failure_count} critical export failures`);
  }

  for (const routeKey of REQUIRED_ONTOLOGY_FIXED_ROUTES) {
    if (!availableRoutes.has(routeKey)) errors.push(`required payload is missing: ${routeKey}`);
  }
  return errors;
}
