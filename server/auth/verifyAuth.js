import crypto from "node:crypto";

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

async function verifyWithSupabaseAuth(token) {
  const supabaseUrl = process.env.SUPABASE_URL ? String(process.env.SUPABASE_URL).replace(/\/$/, "") : "";
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      return { ok: false, status: 401, error: "unauthorized", message: "Invalid bearer token" };
    }
    const user = await response.json();
    return {
      ok: true,
      user: mapUser({ ...user, sub: user.id }),
      claims: { sub: user.id, email: user.email, provider: user.app_metadata?.provider }
    };
  } catch {
    return { ok: false, status: 401, error: "unauthorized", message: "Invalid bearer token" };
  }
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
