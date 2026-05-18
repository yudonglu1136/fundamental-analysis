import { verifySupabaseAccessToken } from "./verifyAuth.mjs";

const localDevToken = "local-dev-token";

function isDevBypassEnabled() {
  return process.env.API_AUTH_DEV_BYPASS === "true" && process.env.NODE_ENV !== "production";
}

export async function requireAuth(request) {
  const header = request.headers.authorization ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return {
      ok: false,
      status: 401,
      body: {
        error: "unauthorized",
        message: "Missing bearer token",
      },
    };
  }

  if (isDevBypassEnabled() && match[1] === localDevToken) {
    const user = {
      id: "local-dev-user",
      email: "local-dev@fundamental-analysis.test",
      name: "Local Development",
      avatar: null,
      provider: "local-dev",
      entitlements: {
        plan: "unknown",
        roles: ["local-dev"],
        features: [],
      },
    };
    request.user = user;
    request.auth = { user, claims: { sub: user.id, provider: user.provider, localDev: true } };
    return { ok: true, user };
  }

  const result = await verifySupabaseAccessToken(match[1]);
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      body: {
        error: result.error,
        message: result.message,
      },
    };
  }

  request.user = result.user;
  request.auth = {
    user: result.user,
    claims: result.claims,
  };
  return {
    ok: true,
    user: result.user,
  };
}
