const required = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_API_BASE_URL",
  "SUPABASE_URL",
  "SUPABASE_JWT_SECRET",
  "API_ALLOWED_ORIGINS",
];

const placeholderPatterns = [
  /^$/,
  /your-/i,
  /example/i,
  /localhost/i,
  /127\.0\.0\.1/,
];

const failures = [];

for (const key of required) {
  const value = process.env[key] ?? "";
  if (placeholderPatterns.some((pattern) => pattern.test(value))) {
    failures.push(`${key} is missing or still points to a local/example value.`);
  }
}

if (process.env.VITE_AUTH_DEV_BYPASS === "true") {
  failures.push("VITE_AUTH_DEV_BYPASS must not be true in production.");
}

if (process.env.API_AUTH_DEV_BYPASS === "true") {
  failures.push("API_AUTH_DEV_BYPASS must not be true in production.");
}

if (process.env.NODE_ENV && process.env.NODE_ENV !== "production") {
  failures.push("NODE_ENV should be production for the production backend.");
}

if (failures.length) {
  console.error("Production environment validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Production environment validation passed.");
