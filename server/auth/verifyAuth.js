import crypto from "node:crypto";

const remoteAuthCache = new Map();
const remoteAuthInFlight = new Map();

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function remoteAuthSettings() {
  return {
    timeoutMs: boundedInteger(process.env.SUPABASE_AUTH_TIMEOUT_MS, 5_000, 100, 15_000),
    cacheTtlMs: boundedInteger(process.env.SUPABASE_AUTH_CACHE_TTL_MS, 30_000, 1_000, 300_000),
    cacheMaxEntries: boundedInteger(process.env.SUPABASE_AUTH_CACHE_MAX_ENTRIES, 512, 16, 4_096)
  };
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function parseJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");
  const [encodedHeader, encodedPayload, signature] = parts;
  const header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf8"));
  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
  return { encodedHeader, encodedPayload, signature, header, payload };
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyHs256({ encodedHeader, encodedPayload, signature }, secret) {
  const expected = crypto.createHmac("sha256", secret).update(`${encodedHeader}.${encodedPayload}`).digest("base64url");
  return timingSafeEqual(signature, expected);
}

function mapUser(payload) {
  const metadata = payload.user_metadata || {};
  const appMetadata = payload.app_metadata || {};
  const providers = Array.isArray(appMetadata.providers) ? appMetadata.providers : [];
  return {
    id: payload.sub,
    email: payload.email || null,
    name: metadata.full_name || metadata.name || null,
    avatar: metadata.avatar_url || metadata.picture || null,
    provider: appMetadata.provider || providers[0] || "google"
  };
}

function remoteCacheKey(supabaseUrl, anonKey, token) {
  return crypto
    .createHash("sha256")
    .update(supabaseUrl)
    .update("\0")
    .update(anonKey)
    .update("\0")
    .update(String(token || ""))
    .digest("hex");
}

function tokenExpiryMs(token) {
  try {
    const { payload } = parseJwt(token);
    return typeof payload.exp === "number" && Number.isFinite(payload.exp)
      ? payload.exp * 1000
      : null;
  } catch {
    return null;
  }
}

function readRemoteCache(key, now = Date.now()) {
  const cached = remoteAuthCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    remoteAuthCache.delete(key);
    return null;
  }
  remoteAuthCache.delete(key);
  remoteAuthCache.set(key, cached);
  return cached.result;
}

function writeRemoteCache(key, token, result, settings, now = Date.now()) {
  if (!result?.ok) return;
  const tokenExpiresAt = tokenExpiryMs(token);
  const expiresAt = Math.min(
    now + settings.cacheTtlMs,
    tokenExpiresAt === null ? Number.POSITIVE_INFINITY : tokenExpiresAt
  );
  if (expiresAt <= now) return;
  remoteAuthCache.delete(key);
  remoteAuthCache.set(key, { expiresAt, result });
  while (remoteAuthCache.size > settings.cacheMaxEntries) {
    remoteAuthCache.delete(remoteAuthCache.keys().next().value);
  }
}

function unavailableAuthResult() {
  return {
    ok: false,
    status: 503,
    error: "auth_unavailable",
    message: "Authentication service is temporarily unavailable"
  };
}

async function fetchSupabaseUser(supabaseUrl, anonKey, token, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        accept: "application/json",
        apikey: anonKey,
        authorization: `Bearer ${token}`
      },
      redirect: "error",
      signal: controller.signal
    });
    if (!response.ok) {
      if ([400, 401, 403].includes(response.status)) {
        return { ok: false, status: 401, error: "unauthorized", message: "Invalid bearer token" };
      }
      return unavailableAuthResult();
    }
    const user = await response.json();
    if (!user?.id) return unavailableAuthResult();
    return {
      ok: true,
      user: mapUser({ ...user, sub: user.id }),
      claims: { sub: user.id, email: user.email, provider: user.app_metadata?.provider }
    };
  } catch {
    return unavailableAuthResult();
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyWithSupabaseAuth(token) {
  const supabaseUrl = process.env.SUPABASE_URL ? String(process.env.SUPABASE_URL).replace(/\/$/, "") : "";
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  const settings = remoteAuthSettings();
  const key = remoteCacheKey(supabaseUrl, anonKey, token);
  const cached = readRemoteCache(key);
  if (cached) return cached;
  if (remoteAuthInFlight.has(key)) return remoteAuthInFlight.get(key);

  const verification = fetchSupabaseUser(
    supabaseUrl,
    anonKey,
    token,
    settings.timeoutMs
  ).then((result) => {
    writeRemoteCache(key, token, result, settings);
    return result;
  }).finally(() => {
    remoteAuthInFlight.delete(key);
  });
  remoteAuthInFlight.set(key, verification);
  return verification;
}

export function resetRemoteAuthVerificationCacheForTests() {
  remoteAuthCache.clear();
  remoteAuthInFlight.clear();
}

export async function verifySupabaseAccessToken(token) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    const remoteResult = await verifyWithSupabaseAuth(token);
    return (
      remoteResult || {
        ok: false,
        status: 500,
        error: "auth_not_configured",
        message: "SUPABASE_JWT_SECRET is not configured"
      }
    );
  }

  try {
    const parsed = parseJwt(token);
    if (parsed.header.alg !== "HS256") {
      const remoteResult = await verifyWithSupabaseAuth(token);
      return remoteResult || { ok: false, status: 401, error: "unauthorized", message: "Unsupported token signing algorithm" };
    }
    if (!verifyHs256(parsed, secret)) {
      const remoteResult = await verifyWithSupabaseAuth(token);
      return remoteResult || { ok: false, status: 401, error: "unauthorized", message: "Invalid bearer token" };
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof parsed.payload.exp === "number" && parsed.payload.exp <= now) {
      return { ok: false, status: 401, error: "unauthorized", message: "Bearer token has expired" };
    }
    if (typeof parsed.payload.nbf === "number" && parsed.payload.nbf > now) {
      return { ok: false, status: 401, error: "unauthorized", message: "Bearer token is not active yet" };
    }
    if (!parsed.payload.sub) {
      return { ok: false, status: 401, error: "unauthorized", message: "Bearer token has no subject" };
    }

    const expectedIssuer = process.env.SUPABASE_URL ? `${String(process.env.SUPABASE_URL).replace(/\/$/, "")}/auth/v1` : "";
    if (expectedIssuer && parsed.payload.iss && parsed.payload.iss !== expectedIssuer) {
      return { ok: false, status: 401, error: "unauthorized", message: "Bearer token issuer does not match Supabase project" };
    }

    return { ok: true, user: mapUser(parsed.payload), claims: parsed.payload };
  } catch {
    const remoteResult = await verifyWithSupabaseAuth(token);
    return remoteResult || { ok: false, status: 401, error: "unauthorized", message: "Invalid bearer token" };
  }
}
